import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const readFile = vi.fn();
  const generateContent = vi.fn();

  class GoogleGenAI {
    models = {
      generateContent,
    };

    constructor(_config: any) {}
  }

  return {
    readFile,
    generateContent,
    GoogleGenAI,
  };
});

vi.mock("fs/promises", () => ({
  default: {
    readFile: mocks.readFile,
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: mocks.GoogleGenAI,
}));

import { MayuraAiService } from "../../services/mayuraAi.service";

describe("MayuraAiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("analyzes multiple images and returns structured Khmer markdown", async () => {
    const service = new MayuraAiService();
    mocks.readFile
      .mockResolvedValueOnce(Buffer.from("image-one"))
      .mockResolvedValueOnce(Buffer.from("image-two"));
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({
        plantName: "ស្រូវ",
        diseaseName: "ជំងឺបាក់តេរីលើស្លឹក",
        isDiseaseDetected: true,
        confidence: "ខ្ពស់",
        summary: "មានសញ្ញាជំងឺលើស្លឹកស្រូវ។",
        reasons: ["សំណើមខ្ពស់", "ការឆ្លងមេរោគ"],
        precautions: ["កាត់បន្ថយទឹកជាប់", "ពិនិត្យដំណាំជាប្រចាំ"],
        fixes: ["ដកស្លឹកដែលឆ្លង", "អនុវត្តវិធានគ្រប់គ្រងសមស្រប"],
        reportMarkdown: "# របាយការណ៍ MayuraAI\n## ឈ្មោះរុក្ខជាតិ\nស្រូវ",
      }),
    });

    const result = await service.analyzePlantDisease([
      {
        path: "C:\\tmp\\leaf-1.jpg",
        mimeType: "image/jpeg",
        originalName: "leaf-1.jpg",
        size: 1200,
      },
      {
        path: "C:\\tmp\\leaf-2.png",
        mimeType: "image/png",
        originalName: "leaf-2.png",
        size: 1500,
      },
    ]);

    expect(result.plantName).toBe("ស្រូវ");
    expect(result.isDiseaseDetected).toBe(true);
    expect(result.reportMarkdown).toContain("# របាយការណ៍ MayuraAI");
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    const call = mocks.generateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-2.5-flash");
    expect(call.contents).toHaveLength(3);
  });

  it("rejects requests with no images", async () => {
    const service = new MayuraAiService();

    await expect(service.analyzePlantDisease([])).rejects.toThrow(
      "At least one image is required.",
    );
  });

  it("rejects when inline image payload exceeds Gemini limit", async () => {
    const service = new MayuraAiService();
    mocks.readFile.mockResolvedValue(Buffer.alloc(21 * 1024 * 1024));

    await expect(service.analyzePlantDisease([
      {
        path: "C:\\tmp\\large.jpg",
        mimeType: "image/jpeg",
        originalName: "large.jpg",
        size: 21 * 1024 * 1024,
      },
    ])).rejects.toThrow("Total image size is too large");
  });

  it("wraps Gemini failures in an API-safe error", async () => {
    const service = new MayuraAiService();
    mocks.readFile.mockResolvedValue(Buffer.from("image-one"));
    mocks.generateContent.mockRejectedValue(new Error("upstream failed"));

    await expect(service.analyzePlantDisease([
      {
        path: "C:\\tmp\\leaf-1.jpg",
        mimeType: "image/jpeg",
        originalName: "leaf-1.jpg",
        size: 1200,
      },
    ])).rejects.toThrow("Mayura AI image diagnosis failed.");
  });
});
