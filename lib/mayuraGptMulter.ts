import fs from "fs";
import multer from "multer";
import path from "path";

const mayuraGptUploadPath = path.join(process.cwd(), "uploads", "mayura-gpt");

if (!fs.existsSync(mayuraGptUploadPath)) {
  fs.mkdirSync(mayuraGptUploadPath, { recursive: true });
}

const mayuraGptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, mayuraGptUploadPath);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safeOriginal}`);
  },
});

const mayuraGptFileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const allowed = [
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
  ];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  cb(new Error("Only WEBM, MP4, MP3, WAV, and OGG audio files are allowed"));
};

export const mayuraGptUpload = multer({
  storage: mayuraGptStorage,
  fileFilter: mayuraGptFileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1,
  },
});
