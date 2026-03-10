import type { Request } from "express";
import fs from "fs/promises";
import { uploadToS3 } from "../utils/uploadToS3";
import { getFileData } from "../utils/getNameonDocs";

export class DocumentService {
  async checkNameExistsornot(filepath: string, expectedname: string) {
    try {
      const documentUrl = await uploadToS3(filepath);
      await fs.unlink(filepath);
      const expectedName = expectedname;
      const aiResult = await getFileData(expectedName, documentUrl);
      return {
        documentUrl,
        aiResult,
      };
    } catch (err) {
      throw err;
    }
  }
}
