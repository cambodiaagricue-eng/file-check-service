import multer from "multer";
import path from "path";
import fs from "fs";

const onboardingUploadPath = path.join(process.cwd(), "uploads", "onboarding");

if (!fs.existsSync(onboardingUploadPath)) {
  fs.mkdirSync(onboardingUploadPath, { recursive: true });
}

const onboardingStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, onboardingUploadPath);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safeOriginal}`);
  },
});

const onboardingFileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, WEBP, and PDF files are allowed"));
  }
};

export const onboardingUpload = multer({
  storage: onboardingStorage,
  fileFilter: onboardingFileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 10,
  },
});
