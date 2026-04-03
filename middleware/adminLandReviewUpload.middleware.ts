import multer from "multer";
import path from "path";
import fs from "fs";

const uploadPath = path.join(process.cwd(), "uploads", "land-borders");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safeOriginal}`);
  },
});

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/json",
  "application/geo+json",
  "application/vnd.google-earth.kml+xml",
  "application/vnd.google-earth.kmz",
  "application/zip",
  "application/x-zip-compressed",
]);

export const uploadAdminLandBorder = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image, PDF, GeoJSON, KML, and ZIP border files are allowed."));
  },
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 1,
  },
}).single("borderFile");
