import multer from "multer";
import { storage, fileFilter } from "../lib/multer";

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, 
});

export const uploadMiddleware = upload.single("file");