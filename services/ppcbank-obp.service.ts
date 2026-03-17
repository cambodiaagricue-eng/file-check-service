import { randomInt } from "crypto";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

type PpcBankStatusResponse = {
  status?: {
    code?: number;
    message?: string;
  };
  data?: Record<string, unknown>;
};

type PpcBankHeaderBodyResponse = {
  header?: {
    result?: boolean;
    resultCode?: string;
    resultMessage?: string;
  };
  body?: Record<string, unknown>;
};

function isPpcBankEnabled() {
  return String(env.PPCBANK_ENABLED || "").toLowerCase() === "true";
}

function assertPpcBankConfigured() {
  const missing = [
    ["PPCBANK_OBP_BASE_URL", env.PPCBANK_OBP_BASE_URL],
    ["PPCBANK_CLIENT_ID", env.PPCBANK_CLIENT_ID],
    ["PPCBANK_SECRET_ID", env.PPCBANK_SECRET_ID],
    ["PPCBANK_PARTNER_CODE", env.PPCBANK_PARTNER_CODE],
    ["PPCBANK_SETTLEMENT_ACCOUNT_NO", env.PPCBANK_SETTLEMENT_ACCOUNT_NO],
  ].filter(([, value]) => !value);

  if (missing.length) {
    throw new ApiError(
      500,
      `Missing PPCBank configuration: ${missing.map(([key]) => key).join(", ")}`,
    );
  }
}

function formatYyyyMmDd(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

export function buildPpcBankVirtualAccountNo(seed: string) {
  const digits = seed.replace(/\D/g, "");
  const suffix = String(randomInt(1000, 9999));
  return `${digits}${suffix}`.slice(-16).padStart(16, "0");
}

export class PpcBankObpService {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  isEnabled() {
    return isPpcBankEnabled();
  }

  getSettlementAccountNo() {
    assertPpcBankConfigured();
    return String(env.PPCBANK_SETTLEMENT_ACCOUNT_NO);
  }

  getVirtualAccountExpiryDate() {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + Math.max(1, Number(env.PPCBANK_VA_EXPIRY_DAYS || 1)));
    return formatYyyyMmDd(date);
  }

  async generateAuthToken(forceRefresh = false) {
    assertPpcBankConfigured();
    const now = Date.now();
    if (!forceRefresh && this.accessToken && this.accessTokenExpiresAt > now + 15_000) {
      return {
        accessToken: this.accessToken,
        expiresIn: Math.max(0, Math.floor((this.accessTokenExpiresAt - now) / 1000)),
        tokenType: "Bearer",
      };
    }

    const response = await this.rawRequest<PpcBankStatusResponse>("/api/auth/login", {
      method: "POST",
      body: {
        clientId: env.PPCBANK_CLIENT_ID,
        secretId: env.PPCBANK_SECRET_ID,
      },
    });

    const accessToken = String(response.data?.accessToken || "").trim();
    if (!accessToken) {
      throw new ApiError(502, "PPCBank auth succeeded without returning an access token.");
    }

    const expiresIn = Number(response.data?.expiresIn || 3600);
    this.accessToken = accessToken;
    this.accessTokenExpiresAt = Date.now() + expiresIn * 1000;

    return {
      accessToken,
      expiresIn,
      tokenType: String(response.data?.tokenType || "Bearer"),
    };
  }

  async createVirtualAccount(input: {
    virtualAccountNo: string;
    paymentName: string;
    customerRefNo: string;
    customerDescription: string;
    currency: "USD";
    virtualAccountExpiryDate: string;
  }) {
    return this.authorizedRequest<PpcBankHeaderBodyResponse>("/accountapi/api/v1/virtual-account", {
      method: "POST",
      body: {
        virtualAccountNo: input.virtualAccountNo,
        paymentName: input.paymentName,
        accountNo: this.getSettlementAccountNo(),
        customerRefNo: input.customerRefNo,
        customerDescription: input.customerDescription,
        paymentType: env.PPCBANK_PAYMENT_TYPE || "01",
        currency: input.currency,
        virtualAccountExpiryDate: input.virtualAccountExpiryDate,
      },
    });
  }

  async generateKhqrString(input: {
    virtualAccountNo: string;
    paymentName: string;
    amountUsd: number;
    billNumber: string;
    mobileNumber: string;
  }) {
    return this.authorizedRequest<PpcBankHeaderBodyResponse>("/accountapi/api/v1/qr-string", {
      method: "POST",
      body: {
        virtualAccountNo: input.virtualAccountNo,
        paymentName: input.paymentName,
        currencyCode: "USD",
        transactionAmount: Number(input.amountUsd.toFixed(2)),
        billNumber: input.billNumber,
        mobileNumber: input.mobileNumber,
      },
    });
  }

  async retrieveTransactionSummary(input: {
    accountNo: string;
    currencyCode: "USD";
    transactionDate: string;
  }) {
    return this.authorizedRequest<PpcBankHeaderBodyResponse>(
      "/accountapi/api/v1/transaction-summary",
      {
        method: "POST",
        body: input,
      },
    );
  }

  async retrieveTransactionHistory(input: {
    accountNo: string;
    currencyCode: "USD";
    transactionDate: string;
    transactionID?: string;
    transactionFromTime?: string;
    transactionToTime?: string;
    listCount?: number;
    pageNo?: number;
  }) {
    return this.authorizedRequest<PpcBankHeaderBodyResponse>(
      "/accountapi/api/v1/transaction-history",
      {
        method: "POST",
        body: {
          accountNo: input.accountNo,
          currencyCode: input.currencyCode,
          transactionID: input.transactionID || "",
          transactionDate: input.transactionDate,
          transactionFromTime: input.transactionFromTime || "000000",
          transactionToTime: input.transactionToTime || "235959",
          listCount: input.listCount || 50,
          pageNo: input.pageNo || 1,
        },
      },
    );
  }

  private async authorizedRequest<T>(
    path: string,
    init: { method: string; body?: Record<string, unknown> },
  ): Promise<T> {
    const auth = await this.generateAuthToken();
    return this.rawRequest<T>(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "x-obp-partnercode": String(env.PPCBANK_PARTNER_CODE),
      },
    });
  }

  private async rawRequest<T>(
    path: string,
    init: {
      method: string;
      headers?: Record<string, string>;
      body?: Record<string, unknown>;
    },
  ): Promise<T> {
    const baseUrl = String(env.PPCBANK_OBP_BASE_URL || "").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = this.extractErrorMessage(payload) || `PPCBank request failed with ${response.status}.`;
      throw new ApiError(response.status, message);
    }

    if (payload?.status?.code && Number(payload.status.code) >= 400) {
      throw new ApiError(
        Number(payload.status.code),
        this.extractErrorMessage(payload) || "PPCBank returned an error response.",
      );
    }

    if (payload?.header?.result === false) {
      throw new ApiError(
        502,
        this.extractErrorMessage(payload) || "PPCBank returned an unsuccessful response.",
      );
    }

    return payload as T;
  }

  private extractErrorMessage(payload: any) {
    return String(
      payload?.status?.message ||
        payload?.header?.resultMessage ||
        payload?.message ||
        "",
    ).trim();
  }
}
