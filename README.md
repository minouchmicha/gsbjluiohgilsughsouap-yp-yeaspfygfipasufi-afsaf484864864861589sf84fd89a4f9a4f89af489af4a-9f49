# Nova Downloader Pro (Node.js)

واجهة ويب جميلة لتحميل مقطع محدد من الفيديو بأعلى جودة متاحة.

## المزايا
- Node.js + Express
- تحميل من روابط الفيديو
- تحديد بداية ونهاية المقطع
- أعلى جودة متاحة
- صيغ: MP4 / MKV / WEBM / MP3
- صفحة ويب RTL عربية
- سجل حالة المهمة عبر API

## التشغيل

```bash
npm install
npm start
```

ثم افتح:

```bash
http://localhost:3000
```

## ملاحظات
- المشروع يعتمد على `yt-dlp-exec` و `ffmpeg-static`.
- إذا واجهت مشكلة في التحميل من بعض المواقع، فهذا غالبًا من قيود المصدر نفسه أو من تحديثات yt-dlp.
- استخدمه فقط في المحتوى الذي تملك حق تنزيله أو يسمح لك المصدر بتنزيله.

## API
### POST /api/download
Body:
```json
{
  "url": "https://example.com/video",
  "startTime": "00:00:10",
  "endTime": "00:00:30",
  "quality": "best",
  "format": "mp4",
  "outputFolder": "downloads"
}
```

### GET /api/jobs/:id
يعرض حالة المهمة والسجل.
