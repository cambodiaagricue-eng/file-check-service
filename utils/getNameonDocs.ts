import { createPartFromUri, GoogleGenAI } from "@google/genai";
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

async function getFileData(expectedName: string, fileUrl: string) {
  const pdfBuffer = await fetch(fileUrl).then((response) =>
    response.arrayBuffer(),
  );
  const fileBlob = new Blob([pdfBuffer], { type: "application/pdf" });
  const file = await ai.files.upload({
    file: fileBlob,
    config: {
      displayName: `document-${Date.now()}.pdf`,
    },
  });

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
    throw new Error("File processing failed.");
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

export { getFileData };
