import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { env } from "./config/env";

type CookieJar = Record<string, string>;

type ApiEnvelope<T = any> = {
  success?: boolean;
  message?: string;
  data?: T;
  details?: unknown;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  token?: string;
  cookieJar?: CookieJar;
};

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function toCookieHeader(cookieJar: CookieJar): string {
  return Object.entries(cookieJar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function storeCookies(cookieJar: CookieJar, response: Response): void {
  const setCookie = response.headers.getSetCookie?.() || [];
  for (const header of setCookie) {
    const [pair] = header.split(";");
    if (!pair) {
      continue;
    }
    const [name, ...rest] = pair.split("=");
    if (!name || rest.length === 0) {
      continue;
    }
    cookieJar[name.trim()] = rest.join("=").trim();
  }
}

async function request<T = any>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<{ status: number; body: ApiEnvelope<T>; headers: Headers }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.cookieJar && Object.keys(options.cookieJar).length > 0) {
    headers.Cookie = toCookieHeader(options.cookieJar);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (options.cookieJar) {
    storeCookies(options.cookieJar, response);
  }

  const raw = await response.text();
  let body: ApiEnvelope<T> = {};

  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {
      success: false,
      message: "Non-JSON response received.",
      details: raw,
    };
  }

  return {
    status: response.status,
    body,
    headers: response.headers,
  };
}

function printSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function printResponse(label: string, result: { status: number; body: ApiEnvelope<any> }): void {
  console.log(`\n${label}`);
  console.log(`Status: ${result.status}`);
  console.log(JSON.stringify(result.body, null, 2));
}

async function askNonEmpty(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  fallback?: string,
): Promise<string> {
  while (true) {
    const answer = (await rl.question(prompt)).trim();
    if (answer) {
      return answer;
    }
    if (fallback !== undefined) {
      return fallback;
    }
    console.log("Value is required.");
  }
}

async function askYesNo(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultValue = true,
): Promise<boolean> {
  const suffix = defaultValue ? " [Y/n]: " : " [y/N]: ";
  const answer = (await rl.question(`${prompt}${suffix}`)).trim().toLowerCase();
  if (!answer) {
    return defaultValue;
  }
  return ["y", "yes"].includes(answer);
}

async function run(): Promise<void> {
  const rl = createInterface({ input, output });
  const cookieJar: CookieJar = {};

  try {
    printSection("Auth Flow Tester");
    const baseUrl = normalizeBaseUrl(process.env.AUTH_TEST_BASE_URL || "http://localhost:3003");
    const location = process.env.AUTH_TEST_LOCATION || "manual-test";
    const username = await askNonEmpty(rl, "Username: ");
    const phone = await askNonEmpty(rl, "Phone (E.164): ");
    const password = await askNonEmpty(rl, "Password: ");
    const telegramOptions = {
      payload: process.env.AUTH_TEST_TELEGRAM_PAYLOAD || "login_otp",
      brandName: env.TELEGRAM_OTP_BRAND_NAME || username,
      senderUsername: env.TELEGRAM_SENDER_USERNAME,
      callbackUrl: env.TELEGRAM_CALLBACK_URL,
    };

    printSection("Signup");
    const signupResult = await request(baseUrl, "/api/v1/auth/signup", {
      method: "POST",
      cookieJar,
      body: {
        username,
        phone,
        password,
        location,
        ...telegramOptions,
      },
    });
    printResponse("Signup response", signupResult);

    const shouldVerify = await askYesNo(rl, "Do you want to verify the new account now?", true);
    if (shouldVerify) {
      const otpCode = await askNonEmpty(rl, "Enter the OTP you received: ");
      const verifyResult = await request(baseUrl, "/api/v1/auth/verify-account/confirm", {
        method: "POST",
        body: {
          phone,
          code: otpCode,
        },
      });
      printResponse("Verify account response", verifyResult);
    }

    printSection("Login");
    const loginResult = await request(baseUrl, "/api/v1/auth/login", {
      method: "POST",
      cookieJar,
      body: {
        username,
        password,
        location,
      },
    });
    printResponse("Login response", loginResult);

    const accessToken = String(loginResult.body?.data?.accessToken || "");

    printSection("Authenticated Profile");
    const meResult = await request(baseUrl, "/api/v1/auth/me", {
      method: "GET",
      cookieJar,
      token: accessToken || undefined,
    });
    printResponse("Me response", meResult);

    const shouldReset = await askYesNo(rl, "Do you want to test the password reset flow too?", false);
    if (shouldReset) {
      printSection("Reset Password Request");
      const resetRequestResult = await request(baseUrl, "/api/v1/auth/reset-password/request", {
        method: "POST",
        body: {
          phone,
          ...telegramOptions,
        },
      });
      printResponse("Reset password request response", resetRequestResult);

      const resetCode = await askNonEmpty(rl, "Enter the reset OTP you received: ");
      const newPassword = await askNonEmpty(rl, "Enter the new password: ");

      const resetConfirmResult = await request(baseUrl, "/api/v1/auth/reset-password/confirm", {
        method: "POST",
        body: {
          phone,
          code: resetCode,
          newPassword,
        },
      });
      printResponse("Reset password confirm response", resetConfirmResult);

      const reloginResult = await request(baseUrl, "/api/v1/auth/login", {
        method: "POST",
        cookieJar,
        body: {
          username,
          password: newPassword,
          location,
        },
      });
      printResponse("Login with new password response", reloginResult);
    }

    const shouldLogout = await askYesNo(rl, "Do you want to log out at the end?", true);
    if (shouldLogout) {
      printSection("Logout");
      const logoutResult = await request(baseUrl, "/api/v1/auth/logout", {
        method: "POST",
        cookieJar,
      });
      printResponse("Logout response", logoutResult);
    }
  } finally {
    rl.close();
  }
}

void run().catch((error) => {
  console.error("\nAuth flow test failed.");
  console.error(error);
  process.exit(1);
});
