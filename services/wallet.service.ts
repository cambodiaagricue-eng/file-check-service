import { getWalletModel } from "../models/wallet.model";
import { getWalletTransactionModel } from "../models/walletTransaction.model";
import { getUserModel } from "../models/user.model";
import { getPaymentOrderModel } from "../models/paymentOrder.model";
import { ApiError } from "../utils/ApiError";
import { paymentService } from "./payment.service";
import { env } from "../config/env";

const USD_TO_COINS_RATE = 1; // 10 USD -> 10 coins
const SOIL_TEST_COINS = 10;
const MAYUR_GPT_COINS_PER_CALL = 1;
const DEFAULT_INITIAL_TOP_UP_USD = Number(env.PPCBANK_DEFAULT_INITIAL_AMOUNT_USD || 10);

function trace(message: string, payload?: Record<string, unknown>) {
  const enabled = String(process.env.PAYMENT_TEST_TRACE || "false").toLowerCase() === "true" ||
    env.NODE_ENV !== "production";
  if (!enabled) {
    return;
  }
  const timestamp = new Date().toISOString();
  if (payload) {
    console.log(`[WALLET_FLOW][${timestamp}] ${message}`, payload);
    return;
  }
  console.log(`[WALLET_FLOW][${timestamp}] ${message}`);
}

function coinsToUsd(coins: number) {
  return Number((coins / USD_TO_COINS_RATE).toFixed(2));
}

function formatDatePart(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

export class WalletService {
  async getOrCreateWallet(userId: string) {
    const Wallet = getWalletModel();
    let wallet = await Wallet.findOne({ userId: userId as any });
    if (!wallet) {
      wallet = await Wallet.create({
        userId: userId as any,
        coins: 0,
        usdBalance: 0,
      });
    } else {
      const normalizedUsdBalance = coinsToUsd(Number(wallet.coins || 0));
      if (Number(wallet.usdBalance || 0) !== normalizedUsdBalance) {
        wallet.usdBalance = normalizedUsdBalance;
        await wallet.save();
      }
    }
    return wallet;
  }

  async buyCoins(userId: string, amountUsd: number) {
    return this.initiateCoinPurchase(userId, amountUsd);
  }

  async initiateCoinPurchase(userId: string, amountUsd = DEFAULT_INITIAL_TOP_UP_USD) {
    if (amountUsd <= 0) {
      throw new ApiError(400, "amountUsd must be greater than zero.");
    }

    const coinsToCredit = amountUsd * USD_TO_COINS_RATE;
    const PaymentOrder = getPaymentOrderModel();
    const createdAt = new Date();
    const order = await PaymentOrder.create({
      userId: userId as any,
      type: "coin_topup",
      provider: paymentService.getProvider(),
      status: "pending",
      amountUsd,
      coins: coinsToCredit,
      currency: "USD",
      metadata: {},
      raw: {},
      instructions: {},
      expiresAt: null,
    });
    trace("Created payment order", {
      orderId: String(order._id),
      userId,
      amountUsd,
      coinsToCredit,
      provider: paymentService.getProvider(),
    });

    const billNumber = `${formatDatePart(createdAt)}${String(order._id).slice(-8)}`;
    const paymentName = `${env.PPCBANK_PAYMENT_NAME_PREFIX || "Mayura Coin Top-up"} ${coinsToCredit}`;
    trace("Prepared payment payload", {
      orderId: String(order._id),
      billNumber,
      paymentName,
    });

    const payment = await paymentService.createTopUpIntent({
      userId,
      amountUsd,
      currency: "USD",
      metadata: { source: "buy_coins", orderId: String(order._id) },
      coins: coinsToCredit,
      referenceId: String(order._id),
      virtualAccountNo: "",
      billNumber,
      paymentName,
      customerDescription: `Coin top-up for user ${userId}`,
      mobileNumber: env.PPCBANK_TEST_PHONE_NUMBER || env.PPCBANK_MOBILE_NUMBER || "85500000000",
      expiresAt: createdAt,
    });

    order.providerPaymentId = payment.paymentId;
    order.virtualAccountNo = String(payment.instructions?.virtualAccountNo || "");
    order.billNumber = billNumber;
    order.instructions = payment.instructions || {};
    order.raw = payment.raw || {};
    if (payment.instructions?.virtualAccountExpiryDate) {
      const expiryDate = String(payment.instructions.virtualAccountExpiryDate);
      order.expiresAt = new Date(
        `${expiryDate.slice(0, 4)}-${expiryDate.slice(4, 6)}-${expiryDate.slice(6, 8)}T23:59:59.000Z`,
      );
    }
    await order.save();
    trace("Saved payment order with provider instructions", {
      orderId: String(order._id),
      providerPaymentId: order.providerPaymentId,
      billNumber: order.billNumber,
      instructions: order.instructions || {},
    });

    return {
      wallet: await this.getOrCreateWallet(userId),
      payment,
      order,
    };
  }

  async confirmCoinPurchase(userId: string, orderId: string) {
    const PaymentOrder = getPaymentOrderModel();
    const existing = await PaymentOrder.findOne({
      _id: orderId as any,
      userId: userId as any,
      type: "coin_topup",
    });
    if (!existing) {
      throw new ApiError(404, "Payment order not found.");
    }
    if (existing.status === "completed") {
      trace("Payment order already completed", {
        orderId,
        userId,
      });
      return {
        wallet: await this.getOrCreateWallet(userId),
        order: existing,
        alreadyCompleted: true,
      };
    }
    if (!paymentService.confirmTopUp) {
      throw new ApiError(400, "Current payment provider does not support payment confirmation.");
    }
    if (!existing.billNumber || !existing.providerPaymentId) {
      throw new ApiError(400, "Payment order is missing provider payment details.");
    }
    if (existing.expiresAt && existing.expiresAt.getTime() < Date.now()) {
      existing.status = "expired";
      existing.failureReason = "Payment order expired before confirmation.";
      await existing.save();
      throw new ApiError(400, "Payment order has expired.");
    }

    existing.status = "processing";
    existing.lastCheckedAt = new Date();
    await existing.save();
    trace("Starting payment confirmation", {
      orderId,
      userId,
      billNumber: existing.billNumber,
      providerPaymentId: existing.providerPaymentId,
    });

    const confirmation = await paymentService.confirmTopUp({
      userId,
      amountUsd: Number(existing.amountUsd || 0),
      currency: "USD",
      metadata: existing.metadata || {},
      coins: Number(existing.coins || 0),
      referenceId: String(existing.providerPaymentId),
      virtualAccountNo: String(existing.virtualAccountNo || ""),
      billNumber: String(existing.billNumber),
      paymentName: String(existing.instructions?.paymentName || "Mayura Coin Top-up"),
      customerDescription: String(existing.metadata?.customerDescription || ""),
      mobileNumber: env.PPCBANK_TEST_PHONE_NUMBER || env.PPCBANK_MOBILE_NUMBER || "85500000000",
      expiresAt: existing.expiresAt || new Date(),
    });

    if (confirmation.status !== "completed") {
      existing.status = "pending";
      existing.raw = {
        ...(existing.raw || {}),
        confirmation: confirmation.raw || {},
      };
      await existing.save();
      trace("Payment still pending", {
        orderId,
        billNumber: existing.billNumber,
        raw: confirmation.raw || {},
      });
      throw new ApiError(409, "Payment is not completed yet. Please confirm again after the user pays.");
    }

    const wallet = await this.creditPurchasedCoins(userId, existing, confirmation.raw || {});

    existing.status = "completed";
    existing.completedAt = new Date();
    existing.lastCheckedAt = new Date();
    existing.raw = {
      ...(existing.raw || {}),
      confirmation: confirmation.raw || {},
    };
    await existing.save();
    trace("Payment confirmed and order completed", {
      orderId,
      billNumber: existing.billNumber,
      completedAt: existing.completedAt?.toISOString?.() || existing.completedAt,
    });

    return {
      wallet,
      order: existing,
      alreadyCompleted: false,
    };
  }

  async chargeCoins(
    userId: string,
    coins: number,
    source: "soil_test" | "mayur_gpt" | "pool_order" | "manual",
    metadata?: Record<string, unknown>,
  ) {
    if (coins <= 0) {
      throw new ApiError(400, "coins must be greater than zero.");
    }
    const wallet = await this.getOrCreateWallet(userId);
    if (wallet.coins < coins) {
      throw new ApiError(400, "Insufficient coins.");
    }
    wallet.coins -= coins;
    wallet.usdBalance = coinsToUsd(wallet.coins);
    await wallet.save();

    const Tx = getWalletTransactionModel();
    await Tx.create({
      userId: userId as any,
      type: "debit",
      source,
      usdAmount: coinsToUsd(coins),
      coinsDelta: -coins,
      balanceAfter: wallet.coins,
      metadata: metadata || {},
    });

    return wallet;
  }

  async chargeSoilTest(userId: string) {
    return this.chargeCoins(userId, SOIL_TEST_COINS, "soil_test");
  }

  async chargeMayurGpt(userId: string) {
    return this.chargeMayurGptUsage(userId);
  }

  async assertMayurGptAvailable(userId: string) {
    const User = getUserModel();
    const user = await User.findById(userId);
    if (user?.createdByAgentId) {
      throw new ApiError(
        403,
        "Mayur GPT is not available for agent-created accounts currently.",
      );
    }

    const wallet = await this.getOrCreateWallet(userId);
    if (wallet.coins < MAYUR_GPT_COINS_PER_CALL) {
      throw new ApiError(400, "Insufficient coins.");
    }

    return wallet;
  }

  async chargeMayurGptUsage(userId: string, metadata?: Record<string, unknown>) {
    await this.assertMayurGptAvailable(userId);
    return this.chargeCoins(userId, MAYUR_GPT_COINS_PER_CALL, "mayur_gpt", metadata);
  }

  private async creditPurchasedCoins(userId: string, order: any, raw: Record<string, unknown>) {
    const Tx = getWalletTransactionModel();
    const existingTx = await Tx.findOne({
      userId: userId as any,
      source: "buy_coins",
      "metadata.orderId": String(order._id),
    });
    if (existingTx) {
      trace("Skipping duplicate wallet credit", {
        orderId: String(order._id),
        userId,
      });
      return this.getOrCreateWallet(userId);
    }

    const wallet = await this.getOrCreateWallet(userId);
    wallet.coins += Number(order.coins || 0);
    wallet.usdBalance = coinsToUsd(wallet.coins);
    await wallet.save();
    trace("Wallet credited after successful payment", {
      orderId: String(order._id),
      userId,
      coinsAdded: Number(order.coins || 0),
      usdAmount: Number(order.amountUsd || 0),
      balanceAfter: wallet.coins,
    });

    await Tx.create({
      userId: userId as any,
      type: "credit",
      source: "buy_coins",
      usdAmount: Number(order.amountUsd || 0),
      coinsDelta: Number(order.coins || 0),
      balanceAfter: wallet.coins,
      metadata: {
        orderId: String(order._id),
        paymentId: String(order.providerPaymentId || ""),
        provider: String(order.provider || ""),
        raw,
      },
    });
    trace("Wallet transaction recorded", {
      orderId: String(order._id),
      userId,
      provider: String(order.provider || ""),
      providerPaymentId: String(order.providerPaymentId || ""),
    });

    return wallet;
  }
}
