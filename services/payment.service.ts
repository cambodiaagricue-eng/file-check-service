import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";
import { PpcBankPgService } from "./ppcbank-pg.service";

export type PaymentChargeInput = {
  userId: string;
  amountUsd: number;
  currency?: "USD";
  metadata?: Record<string, unknown>;
};

export type PaymentChargeResult = {
  success: boolean;
  status: "completed" | "pending";
  paymentId: string;
  provider: "ppcbank_pg";
  amountUsd: number;
  currency: "USD";
  instructions?: Record<string, unknown>;
  raw?: Record<string, unknown>;
};

export type PaymentIntentInput = PaymentChargeInput & {
  coins: number;
  referenceId: string;
  virtualAccountNo: string;
  billNumber: string;
  paymentName: string;
  customerDescription: string;
  mobileNumber: string;
  expiresAt: Date;
};

export type PaymentConfirmationResult = {
  success: boolean;
  status: "completed" | "pending";
  paymentId: string;
  provider: "ppcbank_pg";
  amountUsd: number;
  currency: "USD";
  raw?: Record<string, unknown>;
};

export interface PaymentService {
  getProvider(): "ppcbank_pg";
  charge(input: PaymentChargeInput): Promise<PaymentChargeResult>;
  createTopUpIntent?(input: PaymentIntentInput): Promise<PaymentChargeResult>;
  confirmTopUp?(input: PaymentIntentInput): Promise<PaymentConfirmationResult>;
}

class PpcBankPaymentService implements PaymentService {
  private readonly pg = new PpcBankPgService();

  getProvider() {
    return "ppcbank_pg" as const;
  }

  async charge(): Promise<PaymentChargeResult> {
    throw new ApiError(
      400,
      "Direct wallet credit is not supported with PPCBank. Start a top-up intent and confirm it after payment.",
    );
  }

  async createTopUpIntent(input: PaymentIntentInput): Promise<PaymentChargeResult> {
    const khqr = await this.pg.generateKhqrPayment({
      billNumber: input.billNumber,
      amountUsd: input.amountUsd,
      mobileNumber: input.mobileNumber,
    });
    const deepLink = await this.pg.generateDeepLink({
      billNumber: input.billNumber,
      mobileNumber: input.mobileNumber,
      amountUsd: input.amountUsd,
    });

    return {
      success: true,
      status: "pending",
      paymentId: input.billNumber,
      provider: "ppcbank_pg",
      amountUsd: input.amountUsd,
      currency: "USD",
      instructions: {
        billNumber: input.billNumber,
        paymentURL: khqr.body?.paymentURL,
        deepLinkURL: deepLink.body?.deepLinkURL,
        merchantCode: env.PPCBANK_MERCHANT_CODE,
        merchantName: env.PPCBANK_MERCHANT_NAME,
        paymentName: input.paymentName,
      },
      raw: {
        generateKhqrPayment: khqr,
        generateDeepLink: deepLink,
      },
    };
  }

  async confirmTopUp(input: PaymentIntentInput): Promise<PaymentConfirmationResult> {
    const status = await this.pg.checkKhqrStatus({
      billNumber: input.billNumber,
    });

    const paid = String(status.body?.resultYN || "").toUpperCase() === "Y";
    const billStatusCode = String(status.body?.billStatusCode || "");
    const paidAmount = Number(status.body?.transactionAmount || 0);

    if (!paid || billStatusCode !== "01" || paidAmount < input.amountUsd) {
      return {
        success: false,
        status: "pending",
        paymentId: input.billNumber,
        provider: "ppcbank_pg",
        amountUsd: input.amountUsd,
        currency: "USD",
        raw: { status },
      };
    }

    return {
      success: true,
      status: "completed",
      paymentId: String(status.body?.referenceNo || input.billNumber),
      provider: "ppcbank_pg",
      amountUsd: input.amountUsd,
      currency: "USD",
      raw: { status },
    };
  }
}

function resolvePaymentService(): PaymentService {
  if (String(env.PPCBANK_ENABLED || "").toLowerCase() !== "true") {
    throw new Error("PPCBANK_ENABLED must be true. Mock payments have been removed.");
  }
  if (!env.PPCBANK_PG_BASE_URL || !env.PPCBANK_MERCHANT_CODE || !env.PPCBANK_MERCHANT_PASSWORD) {
    throw new Error(
      "Missing PPCBank Payment Gateway configuration. Set PPCBANK_PG_BASE_URL, PPCBANK_MERCHANT_CODE, and PPCBANK_MERCHANT_PASSWORD.",
    );
  }
  return new PpcBankPaymentService();
}

export const paymentService: PaymentService = resolvePaymentService();
