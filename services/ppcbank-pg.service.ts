import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

type PpcBankPgResponse<TBody extends Record<string, unknown> = Record<string, unknown>> = {
  header?: {
    result?: boolean;
    resultCode?: string;
    resultMessage?: string;
  };
  body?: TBody;
};

class PpcBankGatewayError extends ApiError {
  constructor(
    statusCode: number,
    message: string,
    readonly resultCode?: string,
    readonly payload?: unknown,
  ) {
    super(statusCode, message);
  }
}

function trace(message: string, payload?: Record<string, unknown>) {
  const enabled = String(env.PPCBANK_TRACE || process.env.PAYMENT_TEST_TRACE || "false")
    .toLowerCase() === "true";
  if (!enabled) {
    return;
  }

  const timestamp = new Date().toISOString();
  if (payload) {
    console.log(`[PPCBANK_PG][${timestamp}] ${message}`, payload);
    return;
  }
  console.log(`[PPCBANK_PG][${timestamp}] ${message}`);
}

function assertPgConfigured() {
  const missing = [
    ["PPCBANK_PG_BASE_URL", env.PPCBANK_PG_BASE_URL],
    ["PPCBANK_MERCHANT_CODE", env.PPCBANK_MERCHANT_CODE],
    ["PPCBANK_MERCHANT_PASSWORD", env.PPCBANK_MERCHANT_PASSWORD],
  ].filter(([, value]) => !value);

  if (missing.length) {
    throw new ApiError(
      500,
      `Missing PPCBank Payment Gateway configuration: ${missing.map(([key]) => key).join(", ")}`,
    );
  }
}

export class PpcBankPgService {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  private clearToken() {
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async authenticate(forceRefresh = false) {
    assertPgConfigured();

    if (forceRefresh) {
      this.clearToken();
      trace("Forcing merchant token refresh");
    }

    if (!forceRefresh && this.token && this.tokenExpiresAt > Date.now() + 30_000) {
      trace("Reusing cached merchant token", {
        expiresAt: new Date(this.tokenExpiresAt).toISOString(),
      });
      return this.token;
    }

    trace("Authenticating merchant with PPCBank", {
      endpoint: "/security_check",
      merchantCode: env.PPCBANK_MERCHANT_CODE,
    });
    const response = await this.rawRequest<{ token?: string; expirationDate?: string }>(
      "/security_check",
      {
        method: "POST",
        body: {
          merchantCode: env.PPCBANK_MERCHANT_CODE,
          password: env.PPCBANK_MERCHANT_PASSWORD,
        },
      },
    );

    const token = String(response.body?.token || "").trim();
    if (!token) {
      throw new ApiError(502, "PPCBank Payment Gateway auth succeeded without a token.");
    }

    this.token = token;
    const expirationDate = String(response.body?.expirationDate || "");
    if (/^\d{14}$/.test(expirationDate)) {
      const year = Number(expirationDate.slice(0, 4));
      const month = Number(expirationDate.slice(4, 6)) - 1;
      const day = Number(expirationDate.slice(6, 8));
      const hour = Number(expirationDate.slice(8, 10));
      const minute = Number(expirationDate.slice(10, 12));
      const second = Number(expirationDate.slice(12, 14));
      this.tokenExpiresAt = Date.UTC(year, month, day, hour, minute, second);
    } else {
      this.tokenExpiresAt = Date.now() + 15 * 60 * 1000;
    }

    trace("Merchant authentication completed", {
      merchantCode: env.PPCBANK_MERCHANT_CODE,
      expiresAt: new Date(this.tokenExpiresAt).toISOString(),
      tokenPreview: `${token.slice(0, 12)}...`,
    });

    return token;
  }

  async generateKhqrPayment(input: {
    billNumber: string;
    amountUsd: number;
    mobileNumber?: string;
  }) {
    trace("Generating KHQR payment URL", {
      endpoint: "/api/v1/PMS1011",
      billNumber: input.billNumber,
      amountUsd: input.amountUsd,
      mobileNumber: input.mobileNumber || env.PPCBANK_TEST_PHONE_NUMBER || "",
    });
    return this.authorizedRequest<{ paymentURL?: string }>("/api/v1/PMS1011", {
      method: "POST",
      body: {
        header: {
          languageCode: "01",
          channelTypeCode: "03",
        },
        body: {
          merchantCode: env.PPCBANK_MERCHANT_CODE,
          mobileNumber: input.mobileNumber || env.PPCBANK_TEST_PHONE_NUMBER || "",
          billNumber: input.billNumber,
          storeLabel: env.PPCBANK_MERCHANT_NAME || "",
          amount: Number(input.amountUsd.toFixed(2)),
          currencyCode: "USD",
        },
      },
    });
  }

  async generateDeepLink(input: {
    billNumber: string;
    amountUsd: number;
    mobileNumber?: string;
  }) {
    trace("Generating PPCBank deep link", {
      endpoint: "/api/v1/PMS1025",
      billNumber: input.billNumber,
      amountUsd: input.amountUsd,
      mobileNumber: input.mobileNumber || env.PPCBANK_TEST_PHONE_NUMBER || "",
    });
    return this.authorizedRequest<{ deepLinkURL?: string }>("/api/v1/PMS1025", {
      method: "POST",
      body: {
        header: {
          languageCode: "01",
          channelTypeCode: "03",
        },
        body: {
          merchantCode: env.PPCBANK_MERCHANT_CODE,
          mobileNumber: input.mobileNumber || env.PPCBANK_TEST_PHONE_NUMBER || "",
          billNumber: input.billNumber,
          storeLabel: env.PPCBANK_MERCHANT_NAME || "",
          amount: Number(input.amountUsd.toFixed(2)),
          currencyCode: "USD",
        },
      },
    });
  }

  async checkKhqrStatus(input: { billNumber: string }) {
    trace("Checking KHQR payment status", {
      endpoint: "/api/v1/PMS1024",
      billNumber: input.billNumber,
      merchantCode: env.PPCBANK_MERCHANT_CODE,
    });
    return this.authorizedRequest<{
      withdrawalAccountNo?: string;
      senderBankCode?: string;
      senderBankName?: string;
      senderName?: string;
      transactionAmount?: number;
      transactionCurrencyCode?: string;
      billStatusCode?: string;
      resultYN?: string;
      referenceNo?: string;
      transactionHash?: string;
    }>("/api/v1/PMS1024", {
      method: "POST",
      body: {
        header: {
          languageCode: "01",
          channelTypeCode: "03",
        },
        body: {
          merchantCode: env.PPCBANK_MERCHANT_CODE,
          billNumber: input.billNumber,
        },
      },
    });
  }

  private async authorizedRequest<TBody extends Record<string, unknown>>(
    path: string,
    init: { method: string; body: Record<string, unknown> },
    didRetry = false,
  ) {
    const token = await this.authenticate();
    trace("Calling authorized PPCBank endpoint", {
      endpoint: path,
      method: init.method,
      tokenPreview: `${token.slice(0, 12)}...`,
    });

    try {
      return await this.rawRequest<TBody>(path, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      if (!didRetry && this.isTokenExpiredError(error)) {
        trace("PPCBank token expired during request. Refreshing and retrying once.", {
          endpoint: path,
        });
        await this.authenticate(true);
        return this.authorizedRequest<TBody>(path, init, true);
      }
      throw error;
    }
  }

  private async rawRequest<TBody extends Record<string, unknown>>(
    path: string,
    init: {
      method: string;
      headers?: Record<string, string>;
      body?: Record<string, unknown>;
    },
  ) {
    const baseUrl = String(env.PPCBANK_PG_BASE_URL || "").replace(/\/+$/, "");
    trace("Sending request to PPCBank", {
      url: `${baseUrl}${path}`,
      method: init.method,
      requestBody: this.redactForTrace(init.body || {}),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.PPCBANK_REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error && error.name === "AbortError"
        ? `PPCBank request timed out after ${env.PPCBANK_REQUEST_TIMEOUT_MS}ms.`
        : "Unable to reach PPCBank Payment Gateway.";
      throw new PpcBankGatewayError(504, message, undefined, {
        endpoint: `${baseUrl}${path}`,
      });
    }
    clearTimeout(timeout);

    const payload = await response.json().catch(() => null);
    trace("Received response from PPCBank", {
      url: `${baseUrl}${path}`,
      status: response.status,
      responseHeader: payload?.header || {},
      responseBody: this.redactForTrace(payload?.body || {}),
    });

    if (!response.ok) {
      throw new PpcBankGatewayError(
        response.status,
        this.extractError(payload) || `PPCBank Payment Gateway request failed with ${response.status}.`,
        String(payload?.header?.resultCode || ""),
        payload,
      );
    }

    if (payload?.header?.result === false) {
      throw new PpcBankGatewayError(
        400,
        this.extractError(payload) || "PPCBank Payment Gateway returned an error.",
        String(payload?.header?.resultCode || ""),
        payload,
      );
    }

    return payload as PpcBankPgResponse<TBody>;
  }

  private extractError(payload: any) {
    return String(payload?.header?.resultMessage || payload?.message || "").trim();
  }

  private isTokenExpiredError(error: unknown) {
    if (!(error instanceof PpcBankGatewayError)) {
      return false;
    }
    return error.resultCode === "900024" ||
      error.message.toLowerCase().includes("token has expired");
  }

  private redactForTrace(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.redactForTrace(entry));
    }
    if (!value || typeof value !== "object") {
      return value;
    }

    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const lowered = key.toLowerCase();
      if (lowered.includes("password")) {
        output[key] = "***REDACTED***";
        continue;
      }
      if (lowered === "token" || lowered === "authorization") {
        const tokenValue = String(entry || "");
        output[key] = tokenValue ? `${tokenValue.slice(0, 12)}...` : "";
        continue;
      }
      output[key] = this.redactForTrace(entry);
    }
    return output;
  }
}
