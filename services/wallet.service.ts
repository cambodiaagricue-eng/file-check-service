import { getWalletModel } from "../models/wallet.model";
import { getWalletTransactionModel } from "../models/walletTransaction.model";
import { getUserModel } from "../models/user.model";
import { getPaymentOrderModel } from "../models/paymentOrder.model";
import { ApiError } from "../utils/ApiError";
import { paymentService } from "./payment.service";
import { env } from "../config/env";
import { getMainDbConnection } from "../db/maindb";

const USD_TO_COINS_RATE = 1; // 10 USD -> 10 coins
const SOIL_TEST_COINS = 10;
const MAYUR_GPT_COINS_PER_CALL = 1;
const DEFAULT_INITIAL_TOP_UP_USD = Number(env.PPCBANK_DEFAULT_INITIAL_AMOUNT_USD || 10);
const STALE_PROCESSING_LOCK_MS = 60_000;

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

function buildBillNumber(orderId: string, createdAt: Date) {
  const datePart = formatDatePart(createdAt);
  const timePart = String(createdAt.getTime()).slice(-6);
  const idPart = orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `${datePart}${timePart}${idPart}`.slice(0, 30);
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
    await this.expireStaleCoinPurchases(userId);
    await this.expireIncompleteCoinPurchases(userId);
    const createdAt = new Date();
    const existingActiveOrder = await PaymentOrder.findOne({
      userId: userId as any,
      type: "coin_topup",
      provider: paymentService.getProvider(),
      status: { $in: ["pending", "processing"] },
    }).sort({ createdAt: -1 });
    if (existingActiveOrder) {
      throw new ApiError(
        409,
        "You already have a pending coin purchase. Complete or expire it before creating another one.",
      );
    }

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

    const billNumber = buildBillNumber(String(order._id), createdAt);
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
    try {
      await order.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(
          409,
          "A payment request with the same reference already exists. Please try again.",
        );
      }
      throw error;
    }
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

  async getCoinPurchaseStatus(userId: string, orderId: string) {
    const order = await this.getCoinPurchaseOrder(userId, orderId);
    await this.recoverStaleProcessingOrder(order);
    await this.expireOrderIfStale(order);

    return {
      wallet: await this.getOrCreateWallet(userId),
      order,
      canCancel: order.status === "pending",
      canRetry: order.status === "failed" || order.status === "expired",
      isTerminal: ["completed", "failed", "expired"].includes(String(order.status || "")),
    };
  }

  async getActiveCoinPurchase(userId: string) {
    const PaymentOrder = getPaymentOrderModel();
    await this.expireStaleCoinPurchases(userId);
    await this.expireIncompleteCoinPurchases(userId);
    const order = await PaymentOrder.findOne({
      userId: userId as any,
      type: "coin_topup",
      provider: paymentService.getProvider(),
      status: { $in: ["pending", "processing"] },
    }).sort({ createdAt: -1 });
    if (order) {
      await this.recoverStaleProcessingOrder(order);
      await this.expireOrderIfStale(order);
    }

    return {
      wallet: await this.getOrCreateWallet(userId),
      order,
    };
  }

  async cancelCoinPurchase(userId: string, orderId: string) {
    const order = await this.getCoinPurchaseOrder(userId, orderId);
    await this.recoverStaleProcessingOrder(order);
    await this.expireOrderIfStale(order);

    if (order.status === "completed") {
      throw new ApiError(409, "Completed payments cannot be cancelled.");
    }
    if (order.status === "processing") {
      throw new ApiError(409, "This payment is currently being confirmed. Please retry shortly.");
    }
    if (order.status === "failed" || order.status === "expired") {
      return {
        wallet: await this.getOrCreateWallet(userId),
        order,
        alreadyClosed: true,
      };
    }

    order.status = "expired";
    order.failureReason = "Payment was cancelled by the user before completion.";
    order.lastCheckedAt = new Date();
    await order.save();
    trace("Payment order cancelled by user", {
      orderId,
      userId,
      status: order.status,
    });

    return {
      wallet: await this.getOrCreateWallet(userId),
      order,
      alreadyClosed: false,
    };
  }

  async confirmCoinPurchase(userId: string, orderId: string, allowRecoverProcessing = true) {
    const PaymentOrder = getPaymentOrderModel();
    const existing = await this.getCoinPurchaseOrder(userId, orderId);
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
    if (await this.expireOrderIfStale(existing)) {
      throw new ApiError(400, "Payment order has expired.");
    }

    const locked = await PaymentOrder.findOneAndUpdate(
      {
        _id: orderId as any,
        userId: userId as any,
        type: "coin_topup",
        status: "pending",
      },
      {
        $set: {
          status: "processing",
          lastCheckedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!locked) {
      const current = await PaymentOrder.findOne({
        _id: orderId as any,
        userId: userId as any,
        type: "coin_topup",
      });
      if (!current) {
        throw new ApiError(404, "Payment order not found.");
      }
      if (current.status === "processing") {
        if (allowRecoverProcessing && await this.recoverStaleProcessingOrder(current)) {
          return this.confirmCoinPurchase(userId, orderId, false);
        }
        throw new ApiError(409, "This payment is already being confirmed. Please retry shortly.");
      }
      if (current.status === "completed") {
        return {
          wallet: await this.getOrCreateWallet(userId),
          order: current,
          alreadyCompleted: true,
        };
      }
      if (current.status === "failed" || current.status === "expired") {
        throw new ApiError(409, `This payment order is ${current.status}.`);
      }
      throw new ApiError(409, "Unable to acquire confirmation lock for this payment.");
    }
    trace("Starting payment confirmation", {
      orderId,
      userId,
      billNumber: locked.billNumber,
      providerPaymentId: locked.providerPaymentId,
    });

    const confirmation = await paymentService.confirmTopUp({
      userId,
      amountUsd: Number(locked.amountUsd || 0),
      currency: "USD",
      metadata: locked.metadata || {},
      coins: Number(locked.coins || 0),
      referenceId: String(locked.providerPaymentId),
      virtualAccountNo: String(locked.virtualAccountNo || ""),
      billNumber: String(locked.billNumber),
      paymentName: String(locked.instructions?.paymentName || "Mayura Coin Top-up"),
      customerDescription: String(locked.metadata?.customerDescription || ""),
      mobileNumber: env.PPCBANK_TEST_PHONE_NUMBER || env.PPCBANK_MOBILE_NUMBER || "85500000000",
      expiresAt: locked.expiresAt || new Date(),
    });

    if (confirmation.status !== "completed") {
      const billStatusCode = String(
        (confirmation.raw as any)?.status?.body?.billStatusCode || "",
      );
      const resultYN = String(
        (confirmation.raw as any)?.status?.body?.resultYN || "",
      ).toUpperCase();

      if (billStatusCode === "04") {
        locked.status = "failed";
        locked.failureReason = "Payment was cancelled in PPCBank.";
        locked.raw = {
          ...(locked.raw || {}),
          confirmation: confirmation.raw || {},
        };
        await locked.save();
        throw new ApiError(409, "Payment was cancelled in PPCBank.");
      }

      if (billStatusCode === "05") {
        locked.status = "failed";
        locked.failureReason = "Payment was refunded in PPCBank.";
        locked.raw = {
          ...(locked.raw || {}),
          confirmation: confirmation.raw || {},
        };
        await locked.save();
        throw new ApiError(409, "Payment was refunded in PPCBank.");
      }

      locked.status = "pending";
      locked.raw = {
        ...(locked.raw || {}),
        confirmation: confirmation.raw || {},
      };
      await locked.save();
      trace("Payment still pending", {
        orderId,
        billNumber: locked.billNumber,
        billStatusCode,
        resultYN,
        raw: confirmation.raw || {},
      });
      throw new ApiError(409, "Payment is not completed yet. Please confirm again after the user pays.");
    }

    let wallet: any;
    try {
      wallet = await this.creditPurchasedCoins(userId, locked, confirmation.raw || {});
    } catch (error) {
      locked.status = "pending";
      locked.failureReason = "Internal credit step failed. Retry confirmation to resume coin credit.";
      locked.lastCheckedAt = new Date();
      locked.raw = {
        ...(locked.raw || {}),
        confirmation: confirmation.raw || {},
      };
      await locked.save();
      throw error;
    }

    locked.status = "completed";
    locked.completedAt = new Date();
    locked.lastCheckedAt = new Date();
    locked.raw = {
      ...(locked.raw || {}),
      confirmation: confirmation.raw || {},
    };
    await locked.save();
    trace("Payment confirmed and order completed", {
      orderId,
      billNumber: locked.billNumber,
      completedAt: locked.completedAt?.toISOString?.() || locked.completedAt,
    });

    return {
      wallet,
      order: locked,
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
    const session = await getMainDbConnection().startSession();
    try {
      let walletSnapshot: any;
      await session.withTransaction(async () => {
        const Tx = getWalletTransactionModel();
        const existingTx = await Tx.findOne({
          paymentOrderId: order._id as any,
        }).session(session);
        if (existingTx) {
          trace("Skipping duplicate wallet credit", {
            orderId: String(order._id),
            userId,
          });
          walletSnapshot = await getWalletModel().findOne({ userId: userId as any }).session(session);
          return;
        }

        const Wallet = getWalletModel();
        let wallet = await Wallet.findOne({ userId: userId as any }).session(session);
        if (!wallet) {
          wallet = await Wallet.create(
            [{
              userId: userId as any,
              coins: 0,
              usdBalance: 0,
            }],
            { session },
          ).then((docs) => docs[0]);
        }

        wallet.coins += Number(order.coins || 0);
        wallet.usdBalance = coinsToUsd(wallet.coins);
        await wallet.save({ session });
        trace("Wallet credited after successful payment", {
          orderId: String(order._id),
          userId,
          coinsAdded: Number(order.coins || 0),
          usdAmount: Number(order.amountUsd || 0),
          balanceAfter: wallet.coins,
        });

        await Tx.create([{
          userId: userId as any,
          type: "credit",
          source: "buy_coins",
          usdAmount: Number(order.amountUsd || 0),
          coinsDelta: Number(order.coins || 0),
          balanceAfter: wallet.coins,
          paymentOrderId: order._id as any,
          metadata: {
            orderId: String(order._id),
            paymentId: String(order.providerPaymentId || ""),
            provider: String(order.provider || ""),
            raw,
          },
        }], { session });
        trace("Wallet transaction recorded", {
          orderId: String(order._id),
          userId,
          provider: String(order.provider || ""),
          providerPaymentId: String(order.providerPaymentId || ""),
        });
        walletSnapshot = wallet;
      });
      return walletSnapshot;
    } catch (error) {
      if (this.isMongoTransactionUnsupported(error)) {
        trace("Mongo transactions unavailable, falling back to non-transactional wallet credit", {
          orderId: String(order._id),
          userId,
        });
        return this.creditPurchasedCoinsWithoutTransaction(userId, order, raw);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async getCoinPurchaseOrder(userId: string, orderId: string) {
    const PaymentOrder = getPaymentOrderModel();
    const order = await PaymentOrder.findOne({
      _id: orderId as any,
      userId: userId as any,
      type: "coin_topup",
    });
    if (!order) {
      throw new ApiError(404, "Payment order not found.");
    }
    return order;
  }

  private async expireOrderIfStale(order: any) {
    if (
      (order.status === "pending" || order.status === "processing") &&
      order.expiresAt &&
      order.expiresAt.getTime() < Date.now()
    ) {
      order.status = "expired";
      order.failureReason = "Payment order expired before confirmation.";
      order.lastCheckedAt = new Date();
      await order.save();
      trace("Payment order expired", {
        orderId: String(order._id),
        userId: String(order.userId || ""),
      });
      return true;
    }
    return false;
  }

  private async expireStaleCoinPurchases(userId: string) {
    const PaymentOrder = getPaymentOrderModel();
    const now = new Date();
    await PaymentOrder.updateMany(
      {
        userId: userId as any,
        type: "coin_topup",
        provider: paymentService.getProvider(),
        status: { $in: ["pending", "processing"] },
        expiresAt: { $lt: now },
      },
      {
        $set: {
          status: "expired",
          failureReason: "Payment order expired before confirmation.",
          lastCheckedAt: now,
        },
      },
    );
  }

  private async expireIncompleteCoinPurchases(userId: string) {
    const PaymentOrder = getPaymentOrderModel();
    const now = new Date();
    await PaymentOrder.updateMany(
      {
        userId: userId as any,
        type: "coin_topup",
        provider: paymentService.getProvider(),
        status: { $in: ["pending", "processing"] },
        $or: [
          { providerPaymentId: null },
          { providerPaymentId: "" },
          { billNumber: null },
          { billNumber: "" },
        ],
      },
      {
        $set: {
          status: "expired",
          failureReason:
            "Payment order was invalidated because provider payment details were missing.",
          lastCheckedAt: now,
        },
      },
    );
  }

  private async creditPurchasedCoinsWithoutTransaction(
    userId: string,
    order: any,
    raw: Record<string, unknown>,
  ) {
    const Tx = getWalletTransactionModel();
    const existingTx = await Tx.findOne({
      paymentOrderId: order._id as any,
    });
    if (existingTx) {
      trace("Skipping duplicate wallet credit in non-transactional fallback", {
        orderId: String(order._id),
        userId,
      });
      return this.getOrCreateWallet(userId);
    }

    const Wallet = getWalletModel();
    let wallet = await Wallet.findOne({ userId: userId as any });
    if (!wallet) {
      wallet = await Wallet.create({
        userId: userId as any,
        coins: 0,
        usdBalance: 0,
      });
    }

    wallet.coins += Number(order.coins || 0);
    wallet.usdBalance = coinsToUsd(wallet.coins);
    await wallet.save();
    trace("Wallet credited after successful payment without transaction", {
      orderId: String(order._id),
      userId,
      coinsAdded: Number(order.coins || 0),
      usdAmount: Number(order.amountUsd || 0),
      balanceAfter: wallet.coins,
    });

    try {
      await Tx.create({
        userId: userId as any,
        type: "credit",
        source: "buy_coins",
        usdAmount: Number(order.amountUsd || 0),
        coinsDelta: Number(order.coins || 0),
        balanceAfter: wallet.coins,
        paymentOrderId: order._id as any,
        metadata: {
          orderId: String(order._id),
          paymentId: String(order.providerPaymentId || ""),
          provider: String(order.provider || ""),
          raw,
        },
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        trace("Duplicate wallet transaction detected after fallback credit", {
          orderId: String(order._id),
          userId,
        });
        return this.getOrCreateWallet(userId);
      }
      throw error;
    }

    trace("Wallet transaction recorded without transaction", {
      orderId: String(order._id),
      userId,
      provider: String(order.provider || ""),
      providerPaymentId: String(order.providerPaymentId || ""),
    });
    return wallet;
  }

  private isMongoTransactionUnsupported(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "");
    return message.includes("Transaction numbers are only allowed on a replica set member or mongos");
  }

  private isStaleProcessingOrder(order: any) {
    if (order.status !== "processing" || !order.lastCheckedAt) {
      return false;
    }
    return Date.now() - new Date(order.lastCheckedAt).getTime() > STALE_PROCESSING_LOCK_MS;
  }

  private async recoverStaleProcessingOrder(order: any) {
    if (!this.isStaleProcessingOrder(order)) {
      return false;
    }
    order.status = "pending";
    order.failureReason = null;
    order.lastCheckedAt = new Date();
    await order.save();
    trace("Recovered stale processing payment order", {
      orderId: String(order._id),
      userId: String(order.userId || ""),
    });
    return true;
  }
}
