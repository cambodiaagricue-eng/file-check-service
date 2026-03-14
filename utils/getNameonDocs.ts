import { createPartFromUri, GoogleGenAI } from "@google/genai";
import fsp from "fs/promises";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

const documentCheckSchema = z.object({
  namefound: z
    .boolean()
    .describe("True if any holder name is found in the document."),
  expectednamefound: z
    .boolean()
    .describe("True if the provided expected name is found in the document."),
  "document oneliner summary": z
    .string()
    .describe(
      "One-line summary of the document, including holder name when present.",
    ),
});

type DocumentCheckResult = z.infer<typeof documentCheckSchema>;

function getDisplayNameForMimeType(mimeType: string) {
  if (mimeType === "application/pdf") {
    return `document-${Date.now()}.pdf`;
  }
  if (mimeType === "image/png") {
    return `document-${Date.now()}.png`;
  }
  if (mimeType === "image/webp") {
    return `document-${Date.now()}.webp`;
  }
  return `document-${Date.now()}.jpg`;
}

async function getFileData(expectedName: string, fileUrl: string) {
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    throw new Error("Unable to fetch uploaded document for verification.");
  }

  const fileBuffer = await fileResponse.arrayBuffer();
  const mimeType = (fileResponse.headers.get("content-type") || "application/pdf")
    .split(";")[0]
    .trim()
    .toLowerCase();

  const supportedMimeType = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ].includes(mimeType)
    ? mimeType
    : "application/pdf";

  return getFileDataFromBuffer(
    expectedName,
    fileBuffer,
    supportedMimeType,
  );
}

async function getFileDataFromBuffer(
  expectedName: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
) {
  const fileBlob = new Blob([fileBuffer], { type: mimeType });

  let file;
  try {
    file = await ai.files.upload({
      file: fileBlob,
      config: {
        displayName: getDisplayNameForMimeType(mimeType),
      },
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (/no pages/i.test(message)) {
      throw new Error(
        "The uploaded government ID could not be read. Please upload a clear government ID image or a valid PDF with visible pages.",
      );
    }
    throw error;
  }

  if (!file.name) {
    throw new Error("Uploaded file did not return a file name.");
  }
  const fileName = file.name;
  let getFile = await ai.files.get({ name: fileName });
  while (getFile.state === "PROCESSING") {
    console.log(`current file status: ${getFile.state}`);
    console.log("File is still processing, retrying in 5 seconds");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    getFile = await ai.files.get({ name: fileName });
  }
  if (getFile.state === "FAILED") {
    throw new Error(
      "Government ID processing failed. Please upload a clearer image or a valid PDF document.",
    );
  }

  if (!getFile.uri || !getFile.mimeType) {
    throw new Error("Uploaded file did not return uri/mimeType.");
  }
  const content: any[] = [
    [
      "Analyze the provided identity document (any language, including Khmer/Cambodian).",
      "1) Detect whether a document holder name is present.",
      `2) Check whether this expected name appears in the document exactly or as a clear normalized match: "${expectedName}".`,
      "3) Write a one-line summary that includes the extracted holder name when present.",
      "Return ONLY valid JSON with EXACTLY these keys:",
      '{"namefound": boolean, "expectednamefound": boolean, "document oneliner summary": string}',
      "No markdown, no code fences, no extra keys.",
    ].join("\n"),

    createPartFromUri(getFile.uri, getFile.mimeType),
  ];

  // "gemini-3-flash-preview" to "gemini-2.0-flash"
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: content,
    config: {
      responseMimeType: "application/json",
      //@ts-ignore
      responseJsonSchema: zodToJsonSchema(documentCheckSchema),
    },
  });

  if (!response.text) {
    throw new Error("Model returned an empty response.");
  }

  const result = documentCheckSchema.parse(
    JSON.parse(response.text),
  ) as DocumentCheckResult;

  return result;
}

async function getFileDataFromLocalFile(
  expectedName: string,
  filepath: string,
  mimeType?: string,
) {
  const fileBuffer = await fsp.readFile(filepath);
  const normalizedMimeType = (
    mimeType ||
    "application/pdf"
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  const supportedMimeType = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ].includes(normalizedMimeType)
    ? normalizedMimeType
    : "application/pdf";

  return getFileDataFromBuffer(expectedName, fileBuffer.buffer, supportedMimeType);
}

export { getFileData, getFileDataFromLocalFile };
