import fs from "fs";
import multer from "multer";
import path from "path";

const mayuraAiUploadPath = path.join(process.cwd(), "uploads", "mayura-ai");

if (!fs.existsSync(mayuraAiUploadPath)) {
  fs.mkdirSync(mayuraAiUploadPath, { recursive: true });
}

const mayuraAiStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, mayuraAiUploadPath);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safeOriginal}`);
  },
});

const mayuraAiFileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  cb(new Error("Only JPEG, PNG, WEBP, HEIC, and HEIF image files are allowed"));
};

export const mayuraAiUpload = multer({
  storage: mayuraAiStorage,
  fileFilter: mayuraAiFileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 5,
  },
});
