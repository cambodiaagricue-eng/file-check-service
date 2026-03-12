import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type ApiEnvelope<T = unknown> = {
  success?: boolean;
  message?: string;
  data?: T;
  details?: unknown;
};

const BASE_URL = process.env.BASE_URL || "http://localhost:3003/api/v1/auth";
let cookieJar = "";

function mergeCookies(setCookie: string[] | undefined) {
  if (!setCookie?.length) {
    return;
  }
  const nextPairs = setCookie.map((raw) => raw.split(";")[0]).filter(Boolean);
  const map = new Map<string, string>();

  const existing = cookieJar.split(";").map((x) => x.trim()).filter(Boolean);
  for (const pair of existing) {
    const [k, v] = pair.split("=");
    if (k && v) {
      map.set(k, `${k}=${v}`);
    }
  }
  for (const pair of nextPairs) {
    if (!pair) {
      continue;
    }
    const [k, v] = pair.split("=");
    if (k && v) {
      map.set(k, `${k}=${v}`);
    }
  }
  cookieJar = Array.from(map.values()).join("; ");
}

async function prompt(
  rl: ReturnType<typeof createInterface>,
  label: string,
): Promise<string> {
  return (await rl.question(`${label}: `)).trim();
}

async function post<T = unknown>(path: string, body: unknown): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieJar ? { Cookie: cookieJar } : {}),
    },
    body: JSON.stringify(body),
  });
  const setCookie = response.headers.getSetCookie?.() ||
    (response.headers.get("set-cookie") ? [response.headers.get("set-cookie") as string] : undefined);
  mergeCookies(setCookie);

  let payload: ApiEnvelope<T> = {};
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = { message: "Failed to parse server JSON response." };
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function get<T = unknown>(path: string, token?: string): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: {
      ...(cookieJar ? { Cookie: cookieJar } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function run(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    console.log(`Using auth API: ${BASE_URL}`);

    const username = await prompt(rl, "Signup username");
    const phone = await prompt(rl, "Signup phone (+E.164)");
    const password = await prompt(rl, "Signup password");

    const signupRes = await post<{
      token: string;
      username: string;
      phone: string;
      password: string;
      verified: boolean;
    }>("/signup", { username, phone, password });
    console.log("Signup response:", signupRes);

    console.log("\nWaiting for OTP sent to your phone.");
    const verifyOtp = await prompt(rl, "Enter verify-account OTP");
    const verifyRes = await post("/verify-account/confirm", {
      phone,
      code: verifyOtp,
    });
    console.log("Verify response:", verifyRes);

    const location = await prompt(rl, "Login location (from frontend)");
    const loginRes = await post<{
      accessToken: string;
      user: {
        id: string;
        username: string;
        phone: string;
        isVerified: boolean;
        lastLogins: Array<{ location: string; loggedAt: string }>;
      };
    }>("/login", {
      username,
      password,
      location,
    });
    console.log("Login response:", loginRes); 

    const token = loginRes.data?.accessToken;
    if (token) {
      const meRes = await get("/me", token);
      console.log("Me response:", meRes);
    }

    const refreshRes = await post("/refresh-token", {});
    console.log("Refresh response:", refreshRes);

    const wantReset = await prompt(rl, "Reset password flow? (yes/no)");
    if (wantReset.toLowerCase() === "yes") {
      await post("/reset-password/request", { phone });
      console.log("Reset OTP requested.");
      const resetOtp = await prompt(rl, "Enter reset-password OTP");
      const newPassword = await prompt(rl, "Enter new password");
      const resetRes = await post("/reset-password/confirm", {
        phone,
        code: resetOtp,
        newPassword,
      });
      console.log("Reset password response:", resetRes);
    }
  } finally {
    rl.close();
  }
}

void run().catch((error) => {
  console.error("Auth flow test failed:", error);
  process.exit(1);
});
