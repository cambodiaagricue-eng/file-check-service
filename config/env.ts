import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3003),
  CORS_ORIGIN: z.string().default("http://localhost:8080"),
  ACCESS_COOKIE_NAME: z.string().default("access_token"),
  REFRESH_COOKIE_NAME: z.string().default("refresh_token"),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  SUPERADMIN_PHONE: z.string().default("+919999999999"),
  SUPERADMIN_PASSWORD: z.string().default("Admin@12345"),

  MONGODB_URI: z.string().optional(),
  MONGODB_MAIN_URI: z.string().optional(),
  MONGODB_DOCUMENT_URI: z.string().optional(),

  GEMINI_API_KEY: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_BUCKET_REGION: z.string().optional(),
  AWS_BUCKET_NAME: z.string().optional(),

  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_FROM_PHONE: z.string().optional(),
  MESSAGING_SERVICE_SID: z.string().optional(),

  OTP_TTL_MINUTES: z.coerce.number().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ")}`,
  );
}

function resolveMongoUris(config: z.infer<typeof envSchema>) {
  const fallbackMain = config.MONGODB_MAIN_URI || config.MONGODB_URI;
  if (!fallbackMain) {
    throw new Error("Missing Mongo URI. Set MONGODB_MAIN_URI or MONGODB_URI.");
  }

  const fallbackDocument =
    config.MONGODB_DOCUMENT_URI ||
    fallbackMain.replace(/\/([^/?]+)(\?|$)/, "/document-db$2");

  return {
    main: fallbackMain,
    document: fallbackDocument,
  };
}

const mongoUris = resolveMongoUris(parsed.data);

export const env = {
  ...parsed.data,
  MONGODB_MAIN_URI: mongoUris.main,
  MONGODB_DOCUMENT_URI: mongoUris.document,
} as const;
