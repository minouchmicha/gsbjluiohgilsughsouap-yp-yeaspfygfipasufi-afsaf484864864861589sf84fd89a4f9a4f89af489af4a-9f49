const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const ytDlp = require("yt-dlp-exec");
const ffmpegPath = require("ffmpeg-static");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const TEMP_DIR = path.join(ROOT, "temp");

const RETENTION_MS = 15 * 60 * 1000; // 15 minutes

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

const jobs = new Map();

function nowTime() {
  return new Date().toLocaleTimeString("en-GB", {
    hour12: false
  });
}

function log(job, message) {
  job.logs.push(`[${nowTime()}] ${message}`);
  console.log(`[${job.id}] ${message}`);
}

function secondsToTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

function timeToSeconds(timeStr) {
  if (!timeStr || !String(timeStr).trim()) return null;

  const parts = String(timeStr)
    .trim()
    .split(":")
    .map((x) => x.trim());

  if (parts.length < 2 || parts.length > 3) return null;

  const nums = parts.map((n) => Number(n));
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;

  let h = 0, m = 0, s = 0;
  if (nums.length === 2) {
    [m, s] = nums;
  } else {
    [h, m, s] = nums;
  }

  return h * 3600 + m * 60 + s;
}

function normalizeTimeInput(timeStr) {
  const secs = timeToSeconds(timeStr);
  if (secs === null) return null;
  return secondsToTime(secs);
}

function qualityToFormat(quality) {
  switch (quality) {
    case "BEST":
      return "bv*+ba/b";
    case "4K":
      return "bv*[height<=2160]+ba/b";
    case "1440P":
      return "bv*[height<=1440]+ba/b";
    case "1080P":
      return "bv*[height<=1080]+ba/b";
    case "720P":
      return "bv*[height<=720]+ba/b";
    case "360P":
      return "bv*[height<=360]+ba/b";
    default:
      return "bv*+ba/b";
  }
}

function safeExt(format) {
  const f = String(format || "mp4").toLowerCase();
  if (["mp4", "mkv", "webm", "mp3"].includes(f)) return f;
  return "mp4";
}

async function findJobFile(jobId) {
  const files = await fsp.readdir(TEMP_DIR);
  const matches = files.filter((f) => f.startsWith(jobId + "."));
  if (matches.length === 0) return null;
  return path.join(TEMP_DIR, matches[0]);
}

async function deleteJobFile(job) {
  if (!job.filePath) return;
  try {
    await fsp.unlink(job.filePath);
  } catch (_) {}
  job.filePath = null;
}

function scheduleExpiry(job) {
  job.expiresAt = Date.now() + RETENTION_MS;
}

async function runDownload(job, payload) {
  try {
    job.status = "running";
    job.progress = 0;

    const {
      url,
      quality,
      format,
      startTime,
      endTime
    } = payload;

    const selectedFormat = safeExt(format);
    const outputTemplate = path.join(TEMP_DIR, `${job.id}.%(ext)s`);

    log(job, "Job created.");
    log(job, `Platform detected: ${payload.platform || "Unknown"}`);
    log(job, `Quality: ${quality}`);
    log(job, `Format: ${selectedFormat.toUpperCase()}`);

    if (startTime && endTime) {
      log(job, `Clip range: ${startTime} → ${endTime}`);
    } else {
      log(job, "Clip range: full video");
    }

    log(job, `Output folder: ${TEMP_DIR}`);

    const baseOptions = {
      noPlaylist: true,
      newline: true,
      noRestrictFilenames: true,
      noWarnings: true,
      ffmpegLocation: ffmpegPath || undefined,
      output: outputTemplate
    };

    let options = {
      ...baseOptions
    };

    if (selectedFormat === "mp3") {
      options = {
        ...options,
        format: "bestaudio/best",
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: "0"
      };
    } else {
      options = {
        ...options,
        format: qualityToFormat(quality),
        mergeOutputFormat: selectedFormat
      };
    }

    if (startTime && endTime) {
      options.downloadSections = `*${startTime}-${endTime}`;
    }

    await ytDlp(url, options);

    const found = await findJobFile(job.id);
    if (!found) {
      throw new Error("Download finished but output file was not found.");
    }

    job.filePath = found;
    job.fileName = path.basename(found);
    job.status = "completed";
    job.progress = 100;
    scheduleExpiry(job);

    log(job, "Download completed successfully.");
    log(job, `Temporary file ready for download: ${job.fileName}`);
    log(job, "File will be deleted automatically after 15 minutes.");
  } catch (error) {
    job.status = "failed";
    job.error = error.message || String(error);
    scheduleExpiry(job);
    log(job, `ERROR: ${job.error}`);
  }
}

app.post("/api/jobs", async (req, res) => {
  const {
    url,
    quality = "BEST",
    format = "mp4",
    startTime = "",
    endTime = ""
  } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Please provide a valid URL." });
  }

  const normalizedStart = normalizeTimeInput(startTime);
  const normalizedEnd = normalizeTimeInput(endTime);

  if ((startTime && !normalizedStart) || (endTime && !normalizedEnd)) {
    return res.status(400).json({
      error: "Time format must be HH:MM:SS or MM:SS."
    });
  }

  if (normalizedStart && normalizedEnd) {
    if (timeToSeconds(normalizedEnd) <= timeToSeconds(normalizedStart)) {
      return res.status(400).json({
        error: "End time must be greater than start time."
      });
    }
  }

  const id = crypto.randomUUID();
  const job = {
    id,
    url,
    quality,
    format,
    startTime: normalizedStart,
    endTime: normalizedEnd,
    status: "queued",
    progress: 0,
    logs: [],
    filePath: null,
    fileName: null,
    error: null,
    createdAt: Date.now(),
    expiresAt: null
  };

  jobs.set(id, job);

  const platform =
    /youtu\.be|youtube/i.test(url) ? "YouTube"
    : /instagram/i.test(url) ? "Instagram"
    : /tiktok/i.test(url) ? "TikTok"
    : /facebook/i.test(url) ? "Facebook"
    : /twitter|x\.com/i.test(url) ? "Twitter / X"
    : "Unknown";

  runDownload(job, {
    url,
    quality,
    format,
    startTime: normalizedStart,
    endTime: normalizedEnd,
    platform
  });

  return res.status(202).json({
    jobId: id,
    status: "queued"
  });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    logs: job.logs,
    fileName: job.fileName,
    error: job.error,
    downloadUrl: job.status === "completed" ? `/api/jobs/${job.id}/file` : null,
    expiresAt: job.expiresAt
  });
});

app.get("/api/jobs/:id/file", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).send("Job not found.");
  if (job.status !== "completed" || !job.filePath) {
    return res.status(404).send("File is not ready.");
  }

  try {
    await fsp.access(job.filePath);
    res.download(job.filePath, job.fileName || path.basename(job.filePath));
  } catch {
    res.status(404).send("File was deleted or not found.");
  }
});

async function cleanupExpiredJobs() {
  const now = Date.now();

  for (const [id, job] of jobs.entries()) {
    if (job.expiresAt && now > job.expiresAt) {
      await deleteJobFile(job);
      jobs.delete(id);
      console.log(`[${id}] cleaned up.`);
    }
  }
}

setInterval(cleanupExpiredJobs, 60 * 1000).unref();

app.listen(PORT, () => {
  console.log(`RVX Editz Downloader running at http://localhost:${PORT}`);
});