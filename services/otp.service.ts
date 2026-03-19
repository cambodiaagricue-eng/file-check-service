import { env } from "../config/env";
import bcrypt from "bcryptjs";
import { getOtpModel, type OtpPurpose } from "../models/otp.model";
import { ApiError } from "../utils/ApiError";
import { sendTelegramOtp, type TelegramOtpOptions } from "./telegram.service";

const MAX_ATTEMPTS = 5;

export type RequestOtpOptions = {
  telegram?: TelegramOtpOptions;
};

export type RequestedOtp = {
  requestId?: string;
  deliveryStatus?: string;
  expiresAt: Date;
};

function generateOtpCode(): string {
  const value = Math.floor(100000 + Math.random() * 900000);
  return String(value);
}

async function dispatchOtp(
  phone: string,
  code: string,
  ttlMinutes: number,
  telegramOptions?: TelegramOtpOptions,
): Promise<Pick<RequestedOtp, "requestId" | "deliveryStatus">> {
  return sendTelegramOtp(phone, code, {
    brandName: telegramOptions?.brandName || env.TELEGRAM_OTP_BRAND_NAME,
    ttlSeconds: telegramOptions?.ttlSeconds ?? ttlMinutes * 60,
    senderUsername: telegramOptions?.senderUsername ?? env.TELEGRAM_SENDER_USERNAME,
    payload: telegramOptions?.payload,
    callbackUrl: telegramOptions?.callbackUrl ?? env.TELEGRAM_CALLBACK_URL,
    requestId: telegramOptions?.requestId,
  });
}

export async function requestOtp(
  phone: string,
  purpose: OtpPurpose,
  options: RequestOtpOptions = {},
): Promise<RequestedOtp> {
  const Otp = getOtpModel();
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const recentCount = await Otp.countDocuments({
    phone,
    purpose,
    createdAt: { $gte: oneMinuteAgo },
  });

  if (recentCount >= 2) {
    throw new ApiError(429, "Too many OTP requests. Try again in a minute.");
  }

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000);

  await Otp.updateMany(
    { phone, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  const delivery = await dispatchOtp(phone, code, env.OTP_TTL_MINUTES, options.telegram);

  await Otp.create({
    phone,
    purpose,
    codeHash,
    expiresAt,
    requestId: delivery.requestId,
    deliveryStatus: delivery.deliveryStatus,
  });

  return {
    requestId: delivery.requestId,
    deliveryStatus: delivery.deliveryStatus,
    expiresAt,
  };
}

export async function verifyOtp(
  phone: string,
  purpose: OtpPurpose,
  code: string,
): Promise<void> {
  const Otp = getOtpModel();

  const otp = await Otp.findOne({
    phone,
    purpose,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  if (!otp) {
    throw new ApiError(400, "OTP not found. Request a new code.");
  }

  if (otp.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "OTP has expired. Request a new code.");
  }

  if (otp.attempts >= MAX_ATTEMPTS) {
    throw new ApiError(429, "OTP attempts exceeded. Request a new code.");
  }

  const isValid = await bcrypt.compare(code, otp.codeHash);
  if (!isValid) {
    otp.attempts += 1;
    await otp.save();
    throw new ApiError(400, "Invalid OTP code.");
  }

  otp.consumedAt = new Date();
  await otp.save();
}
