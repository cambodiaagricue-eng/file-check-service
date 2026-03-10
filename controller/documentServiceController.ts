import { DocumentService } from "../services/documentService";
import { Router } from "express";
import type { Request, Response } from "express";
import { uploadMiddleware } from "../middleware/multer.middleware";

const documentRoute = Router();
const documentService = new DocumentService();

documentRoute.post(
  "/verify-name",
  uploadMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "File not uploaded",
        });
      }

      const filepath = req.file.path;
      const expectedName = req.query.expectedName as string;

      if (!expectedName) {
        return res.status(400).json({
          message: "expectedName is required",
        });
      }

      const result = await documentService.checkNameExistsornot(
        filepath,
        expectedName,
      );

      res.json({
        message: "File uploaded and name checked successfully",
        data: result,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          error instanceof Error ? error.message : "Something went wrong",
      });
    }
  },
);

export default documentRoute;
