import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

const BASE_URL = "https://gatewayapi.telegram.org";

export type TelegramOtpOptions = {
  brandName?: string;
  ttlSeconds?: number;
  senderUsername?: string;
  payload?: string;
  callbackUrl?: string;
  requestId?: string;
};

export type TelegramOtpResult = {
  requestId?: string;
  deliveryStatus?: string;
};

function getTelegramToken(): string {
  if (!env.TELEGRAM_API_TOKEN) {
    throw new ApiError(500, "Telegram OTP is not configured. Set TELEGRAM_API_TOKEN.");
  }
  return env.TELEGRAM_API_TOKEN;
}

export async function sendTelegramOtp(
  phoneNumber: string,
  code: string,
  options: TelegramOtpOptions = {},
): Promise<TelegramOtpResult> {
  const response = await fetch(`${BASE_URL}/sendVerificationMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getTelegramToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      request_id: options.requestId,
      phone_number: phoneNumber,
      code,
      ttl: options.ttlSeconds,
      sender_username: options.senderUsername,
      payload: options.payload,
      callback_url: options.callbackUrl,
      brand_name: options.brandName,
    }),
  });

  const raw = await response.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = { raw };
  }

  if (!response.ok) {
    throw new ApiError(502, "Failed to send OTP through Telegram", parsed);
  }

  return {
    requestId: parsed?.result?.request_id,
    deliveryStatus: parsed?.result?.delivery_status?.status,
  };
}
