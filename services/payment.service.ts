import { ApiError } from "../utils/ApiError";

export type PaymentChargeInput = {
  userId: string;
  amountUsd: number;
  currency?: "USD";
  metadata?: Record<string, unknown>;
};

export type PaymentChargeResult = {
  success: boolean;
  paymentId: string;
  provider: "mock";
  amountUsd: number;
  currency: "USD";
  raw?: Record<string, unknown>;
};

export interface PaymentService {
  charge(input: PaymentChargeInput): Promise<PaymentChargeResult>;
}

class MockPaymentService implements PaymentService {
  async charge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
    if (input.amountUsd <= 0) {
      throw new ApiError(400, "Payment amount must be greater than zero.");
    }
    const paymentId = `MOCKPAY-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    return {
      success: true,
      paymentId,
      provider: "mock",
      amountUsd: input.amountUsd,
      currency: "USD",
      raw: {
        userId: input.userId,
        metadata: input.metadata || {},
      },
    };
  }
}

// Swap this export to a real gateway implementation without changing callers.
export const paymentService: PaymentService = new MockPaymentService();
