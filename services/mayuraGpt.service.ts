import { createPartFromUri, GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

const mayuraGptResponseSchema = z.object({
  transcript: z.string().default(""),
  responseText: z.string().min(1),
  languageCode: z.string().default("en"),
});

type MayuraGptResponse = z.infer<typeof mayuraGptResponseSchema>;

const mayuraGptTranscriptSchema = z.object({
  transcript: z.string().min(1),
  languageCode: z.string().default("en"),
});

type MayuraGptTranscript = z.infer<typeof mayuraGptTranscriptSchema>;

const mayuraGptHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

type MayuraGptHistoryMessage = z.infer<typeof mayuraGptHistoryMessageSchema>;

function getClient() {
  if (!env.GEMINI_API_KEY) {
    throw new ApiError(503, "Gemini API is not configured for Mayura GPT.");
  }

  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

function buildHistoryContext(history: MayuraGptHistoryMessage[]) {
  const normalized = history
    .map((item) => mayuraGptHistoryMessageSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .slice(-12);

  if (!normalized.length) {
    return "Conversation history:\n(none)";
  }

  const lines = normalized.map((message, index) => {
    const speaker = message.role === "assistant" ? "Assistant" : "User";
    return `${index + 1}. ${speaker}: ${message.content}`;
  });

  return ["Conversation history:", ...lines].join("\n");
}

function buildPrompt(
  mode: "text" | "audio",
  userInput?: string,
  history: MayuraGptHistoryMessage[] = [],
) {
  const parts = [
    "You are MayuraGPT, an agricultural assistant for farmers.",
    "Support multilingual conversations, especially English and Khmer (Cambodian).",
    "Detect the user's language and reply in that same language whenever possible.",
    "Treat the conversation history as context and answer consistently with earlier turns.",
    "Keep the answer practical, concise, and useful for a farmer.",
    "If the request is unclear, say what extra detail is needed.",
    "Return ONLY valid JSON with EXACTLY these keys:",
    '{"transcript": string, "responseText": string, "languageCode": string}',
    buildHistoryContext(history),
  ];

  if (mode === "text") {
    parts.push(`User message: ${userInput || ""}`);
    parts.push('For text mode, set "transcript" equal to the user message.');
  } else {
    parts.push(
      'For audio mode, first transcribe the spoken audio accurately. Put that full transcript into "transcript". Then answer in "responseText".',
    );
  }

  return parts.join("\n");
}

async function waitForUploadedFile(ai: GoogleGenAI, fileName: string) {
  let file = await ai.files.get({ name: fileName });

  while (file.state === "PROCESSING") {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    file = await ai.files.get({ name: fileName });
  }

  if (file.state === "FAILED") {
    throw new ApiError(
      400,
      "The voice clip could not be processed. Please try again with a clearer recording.",
    );
  }

  if (!file.uri || !file.mimeType) {
    throw new ApiError(500, "Processed audio file metadata is incomplete.");
  }

  return file;
}

async function parseModelResponse(text: string | undefined) {
  if (!text) {
    throw new ApiError(502, "Mayura GPT returned an empty response.");
  }

  return mayuraGptResponseSchema.parse(JSON.parse(text)) as MayuraGptResponse;
}

async function parseTranscriptResponse(text: string | undefined) {
  if (!text) {
    throw new ApiError(502, "Mayura GPT returned an empty transcript.");
  }

  return mayuraGptTranscriptSchema.parse(JSON.parse(text)) as MayuraGptTranscript;
}

export class MayuraGptService {
  async askText(prompt: string, history: MayuraGptHistoryMessage[] = []) {
    const normalizedPrompt = String(prompt || "").trim();
    if (!normalizedPrompt) {
      throw new ApiError(400, "Prompt is required.");
    }

    const ai = getClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: buildPrompt("text", normalizedPrompt, history),
      config: {
        responseMimeType: "application/json",
        // @ts-ignore
        responseJsonSchema: zodToJsonSchema(mayuraGptResponseSchema),
      },
    });

    return parseModelResponse(response.text);
  }

  async askVoice(audioPath: string, mimeType: string) {
    const ai = getClient();

    try {
      const buffer = await fs.readFile(audioPath);
      const blob = new Blob([buffer], { type: mimeType });
      const uploaded = await ai.files.upload({
        file: blob,
        config: {
          displayName: `mayura-voice-${Date.now()}`,
        },
      });

      if (!uploaded.name) {
        throw new ApiError(500, "Voice upload did not return a file name.");
      }

      const processed = await waitForUploadedFile(ai, uploaded.name);

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          buildPrompt("audio"),
          createPartFromUri(processed.uri, processed.mimeType),
        ],
        config: {
          responseMimeType: "application/json",
          // @ts-ignore
          responseJsonSchema: zodToJsonSchema(mayuraGptResponseSchema),
        },
      });

      return parseModelResponse(response.text);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      const message = String((error as Error | undefined)?.message || "");
      if (/mime|audio|unsupported/i.test(message)) {
        throw new ApiError(
          400,
          "This audio format is not supported. Please try again with a clearer browser recording.",
        );
      }

      throw new ApiError(502, "Mayura GPT voice request failed.");
    } finally {
      try {
        await fs.unlink(audioPath);
      } catch {
        // Best-effort local cleanup.
      }
    }
  }

  async transcribeVoice(audioPath: string, mimeType: string) {
    const ai = getClient();

    try {
      const buffer = await fs.readFile(audioPath);
      const blob = new Blob([buffer], { type: mimeType });
      const uploaded = await ai.files.upload({
        file: blob,
        config: {
          displayName: `mayura-voice-transcript-${Date.now()}`,
        },
      });

      if (!uploaded.name) {
        throw new ApiError(500, "Voice upload did not return a file name.");
      }

      const processed = await waitForUploadedFile(ai, uploaded.name);
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          [
            "Transcribe the spoken audio accurately.",
            "Support English and Khmer (Cambodian).",
            'Return ONLY valid JSON with EXACTLY these keys: {"transcript": string, "languageCode": string}',
          ].join("\n"),
          createPartFromUri(processed.uri, processed.mimeType),
        ],
        config: {
          responseMimeType: "application/json",
          // @ts-ignore
          responseJsonSchema: zodToJsonSchema(mayuraGptTranscriptSchema),
        },
      });

      return parseTranscriptResponse(response.text);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(502, "Voice transcription failed.");
    } finally {
      try {
        await fs.unlink(audioPath);
      } catch {
        // Best-effort local cleanup.
      }
    }
  }
}
