const multer = require('multer');
const path = require('path');
const fs = require('fs');

function safeExt(originalname) {
  let ext = path.extname(originalname).toLowerCase();
  if (ext && /^[.][a-z0-9]{1,10}$/.test(ext)) return ext;
  try {
    const decoded = Buffer.from(originalname, 'latin1').toString('utf8');
    ext = path.extname(decoded).toLowerCase();
    if (ext && /^[.][a-z0-9]{1,10}$/.test(ext)) return ext;
  } catch(e) {}
  return ext || '';
}

function createMulter() {
  const UPLOADS_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const storage = multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = safeExt(file.originalname);
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, uniqueName);
    }
  });

  return multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = safeExt(file.originalname);
      const allowed = ['.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.txt', '.ppt', '.pptx'];
      // Also check MIME type
      const allowedMimes = [
        'application/pdf', 'application/zip',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg', 'image/png',
        'text/plain',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ];
      const extOk = allowed.includes(ext);
      const mimeOk = allowedMimes.includes(file.mimetype);
      // Accept if either extension or MIME matches (fallback for browsers with odd mimetypes)
      cb(null, extOk || mimeOk);
    }
  });
}

module.exports = { createMulter };
