import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

const MAX_INLINE_BYTES = 20 * 1024 * 1024;

const mayuraAiResponseSchema = z.object({
  plantName: z.string().default(""),
  diseaseName: z.string().default(""),
  isDiseaseDetected: z.boolean().default(false),
  confidence: z.string().default(""),
  summary: z.string().default(""),
  reasons: z.array(z.string()).default([]),
  precautions: z.array(z.string()).default([]),
  fixes: z.array(z.string()).default([]),
  reportMarkdown: z.string().min(1),
});

export type MayuraAiDiagnosisResult = z.infer<typeof mayuraAiResponseSchema>;

export type MayuraAiInputImage = {
  path: string;
  mimeType: string;
  originalName: string;
  size: number;
};

function getClient() {
  if (!env.GEMINI_API_KEY) {
    throw new ApiError(503, "Gemini API is not configured for Mayura AI.");
  }

  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

function buildPrompt() {
  return [
    "You are MayuraAI, a plant disease detection assistant for farmers.",
    "Analyze all provided plant images together before deciding.",
    "The response must be written for Cambodian users in Khmer language.",
    "Return ONLY valid JSON with EXACTLY these keys:",
    '{"plantName": string, "diseaseName": string, "isDiseaseDetected": boolean, "confidence": string, "summary": string, "reasons": string[], "precautions": string[], "fixes": string[], "reportMarkdown": string}',
    "If the plant looks healthy or the disease is unclear, set isDiseaseDetected to false and explain that carefully.",
    "reportMarkdown must be valid Markdown in Khmer and include these sections:",
    "# របាយការណ៍ MayuraAI",
    "## ឈ្មោះរុក្ខជាតិ",
    "## ជំងឺដែលបានរកឃើញ",
    "## មូលហេតុ",
    "## វិធានការការពារ",
    "## វិធីដោះស្រាយ",
    "## កំណត់ចំណាំសំខាន់",
    "Keep the advice practical and safe. Do not claim certainty when the image quality is poor.",
  ].join("\n");
}

async function parseResponse(text: string | undefined) {
  if (!text) {
    throw new ApiError(502, "Mayura AI returned an empty response.");
  }

  return mayuraAiResponseSchema.parse(JSON.parse(text)) as MayuraAiDiagnosisResult;
}

export class MayuraAiService {
  async analyzePlantDisease(images: MayuraAiInputImage[]) {
    if (!images.length) {
      throw new ApiError(400, "At least one image is required.");
    }

    const ai = getClient();
    const contents: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
    let totalBytes = 0;

    for (const image of images) {
      const buffer = await fs.readFile(image.path);
      totalBytes += buffer.byteLength;
      if (totalBytes > MAX_INLINE_BYTES) {
        throw new ApiError(
          400,
          "Total image size is too large for inline Gemini processing. Please upload smaller images.",
        );
      }

      contents.push({
        inlineData: {
          mimeType: image.mimeType,
          data: buffer.toString("base64"),
        },
      });
    }

    contents.push({
      text: [
        buildPrompt(),
        `Image count: ${images.length}`,
        `Original file names: ${images.map((image) => path.basename(image.originalName)).join(", ")}`,
      ].join("\n"),
    });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          responseMimeType: "application/json",
          // @ts-ignore
          responseJsonSchema: zodToJsonSchema(mayuraAiResponseSchema),
        },
      });

      return parseResponse(response.text);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(502, "Mayura AI image diagnosis failed.");
    }
  }
}
