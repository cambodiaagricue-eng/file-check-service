import { env } from "../config/env";
import bcrypt from "bcryptjs";
import { getOtpModel, type OtpPurpose } from "../models/otp.model";
import { ApiError } from "../utils/ApiError";
import { sendSms } from "./twilio.service";

const MAX_ATTEMPTS = 5;

function generateOtpCode(): string {
  const value = Math.floor(100000 + Math.random() * 900000);
  return String(value);
}

export async function requestOtp(phone: string, purpose: OtpPurpose): Promise<void> {
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

  await Otp.create({
    phone,
    purpose,
    codeHash,
    expiresAt,
  });

  await sendSms(phone, `Your verification code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes.`);
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
