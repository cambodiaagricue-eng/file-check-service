import { DocumentService } from "../services/documentService";
import { Router } from "express";
import type { Request, Response } from "express";
import { uploadMiddleware } from "../middleware/multer.middleware";
import { withAudit } from "../middleware/auditLog.middleware";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";

const documentRoute = Router();
const documentService = new DocumentService();

documentRoute.post(
  "/verify-name",
  uploadMiddleware,
  withAudit(
    "verify_name",
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.file) {
        throw new ApiError(400, "File not uploaded");
      }

      const expectedName = req.query.expectedName;
      if (typeof expectedName !== "string" || !expectedName.trim()) {
        throw new ApiError(400, "expectedName is required");
      }

      const result = await documentService.checkNameExistsornot(
        req.authUser!.id,
        req.file.path,
        expectedName.trim(),
      );

      res.json({
        message: "File uploaded and name checked successfully",
        data: result,
      });
    }),
  ),
);

export default documentRoute;
