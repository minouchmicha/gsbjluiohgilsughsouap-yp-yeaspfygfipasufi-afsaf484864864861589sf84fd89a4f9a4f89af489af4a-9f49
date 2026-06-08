const urlEl = document.getElementById("url");
const startTimeEl = document.getElementById("startTime");
const endTimeEl = document.getElementById("endTime");
const qualityEl = document.getElementById("quality");
const formatEl = document.getElementById("format");
const startBtn = document.getElementById("startBtn");
const statusText = document.getElementById("statusText");
const fileText = document.getElementById("fileText");
const linkText = document.getElementById("linkText");
const logsEl = document.getElementById("logs");
const clearLogsBtn = document.getElementById("clearLogs");
const downloadBox = document.getElementById("downloadBox");
const downloadLink = document.getElementById("downloadLink");

let currentJobId = null;
let pollTimer = null;

function setLogs(lines) {
  logsEl.textContent = Array.isArray(lines) ? lines.join("\n") : "";
  logsEl.scrollTop = logsEl.scrollHeight;
}

function addLog(text) {
  const current = logsEl.textContent.trim();
  logsEl.textContent = current ? `${current}\n${text}` : text;
  logsEl.scrollTop = logsEl.scrollHeight;
}

function setStatus(job) {
  statusText.textContent =
    job.status === "queued" ? "قيد الانتظار" :
    job.status === "running" ? "يتم التحميل" :
    job.status === "completed" ? "تم الانتهاء" :
    job.status === "failed" ? "فشل" :
    "جاهز";

  fileText.textContent = job.fileName || "—";
  linkText.textContent = job.downloadUrl ? "جاهز" : "—";

  if (job.downloadUrl) {
    downloadLink.href = job.downloadUrl;
    downloadBox.classList.remove("hidden");
  } else {
    downloadBox.classList.add("hidden");
  }

  setLogs(job.logs || []);

  if (job.status === "failed" && job.error) {
    addLog(`[ERROR] ${job.error}`);
  }
}

async function fetchJob(jobId) {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) return null;
  return await res.json();
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(jobId) {
  stopPolling();

  pollTimer = setInterval(async () => {
    const job = await fetchJob(jobId);
    if (!job) return;

    setStatus(job);

    if (job.status === "completed" || job.status === "failed") {
      stopPolling();
      startBtn.disabled = false;
      startBtn.textContent = "ابدأ التحميل";
    }
  }, 2000);
}

startBtn.addEventListener("click", async () => {
  const url = urlEl.value.trim();
  const startTime = startTimeEl.value.trim();
  const endTime = endTimeEl.value.trim();

  if (!url) {
    alert("أدخل رابط الفيديو أولًا.");
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = "جارٍ الإنشاء...";
  statusText.textContent = "جارٍ الإرسال...";
  downloadBox.classList.add("hidden");
  fileText.textContent = "—";
  linkText.textContent = "—";
  setLogs([]);

  try {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url,
        startTime,
        endTime,
        quality: qualityEl.value,
        format: formatEl.value
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "حدث خطأ");
    }

    currentJobId = data.jobId;
    statusText.textContent = "قيد التحميل";
    addLog("Job created.");
    startPolling(currentJobId);

    const initial = await fetchJob(currentJobId);
    if (initial) setStatus(initial);
  } catch (err) {
    startBtn.disabled = false;
    startBtn.textContent = "ابدأ التحميل";
    statusText.textContent = "فشل";
    addLog(`[ERROR] ${err.message}`);
    alert(err.message);
  }
});

clearLogsBtn.addEventListener("click", () => {
  logsEl.textContent = "";
});

urlEl.addEventListener("input", () => {
  const v = urlEl.value.toLowerCase();
  if (v.includes("youtube") || v.includes("youtu.be")) {
    linkText.textContent = "YouTube";
  } else if (v.includes("instagram")) {
    linkText.textContent = "Instagram";
  } else if (v.includes("tiktok")) {
    linkText.textContent = "TikTok";
  } else if (v.includes("facebook")) {
    linkText.textContent = "Facebook";
  } else if (v.includes("twitter") || v.includes("x.com")) {
    linkText.textContent = "X / Twitter";
  } else {
    linkText.textContent = "—";
  }
});