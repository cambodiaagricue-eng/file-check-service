import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

function getTwilioAuthHeader(): string {
  const token = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
    "utf-8",
  ).toString("base64");
  return `Basic ${token}`;
}

export async function sendSms(to: string, body: string): Promise<void> {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const payload = new URLSearchParams();
  payload.set("To", to);
  payload.set("Body", body);

  if (env.MESSAGING_SERVICE_SID) {
    payload.set("MessagingServiceSid", env.MESSAGING_SERVICE_SID);
  } else if (env.TWILIO_FROM_PHONE) {
    payload.set("From", env.TWILIO_FROM_PHONE);
  } else {
    throw new ApiError(
      500,
      "Twilio sender config missing. Set MESSAGING_SERVICE_SID or TWILIO_FROM_PHONE.",
    );
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: getTwilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new ApiError(502, "Failed to send SMS through Twilio", raw);
  }
}
