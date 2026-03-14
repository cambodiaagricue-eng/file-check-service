import { getWalletModel } from "../models/wallet.model";
import { getWalletTransactionModel } from "../models/walletTransaction.model";
import { getUserModel } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { paymentService } from "./payment.service";

const USD_TO_COINS_RATE = 1; // 10 USD -> 10 coins
const SOIL_TEST_COINS = 10;
const MAYUR_GPT_COINS_PER_CALL = 1;

function coinsToUsd(coins: number) {
  return Number((coins / USD_TO_COINS_RATE).toFixed(2));
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
    if (amountUsd <= 0) {
      throw new ApiError(400, "amountUsd must be greater than zero.");
    }
    const charge = await paymentService.charge({
      userId,
      amountUsd,
      currency: "USD",
      metadata: { source: "buy_coins" },
    });

    const coinsToCredit = amountUsd * USD_TO_COINS_RATE;
    const wallet = await this.getOrCreateWallet(userId);
    wallet.coins += coinsToCredit;
    wallet.usdBalance = coinsToUsd(wallet.coins);
    await wallet.save();

    const Tx = getWalletTransactionModel();
    await Tx.create({
      userId: userId as any,
      type: "credit",
      source: "buy_coins",
      usdAmount: amountUsd,
      coinsDelta: coinsToCredit,
      balanceAfter: wallet.coins,
      metadata: { paymentId: charge.paymentId, provider: charge.provider },
    });

    return { wallet, payment: charge };
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
    const User = getUserModel();
    const user = await User.findById(userId);
    if (user?.createdByAgentId) {
      throw new ApiError(
        403,
        "Mayur GPT is not available for agent-created accounts currently.",
      );
    }
    return this.chargeCoins(userId, MAYUR_GPT_COINS_PER_CALL, "mayur_gpt");
  }
}
