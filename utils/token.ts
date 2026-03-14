import { createHash, randomBytes } from "crypto";

export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
