import { getPoolOrderJoinModel } from "../models/poolOrderJoin.model";
import { getPoolOrderModel } from "../models/poolOrder.model";
import { ApiError } from "../utils/ApiError";
import { WalletService } from "./wallet.service";

const walletService = new WalletService();

export class PoolOrderService {
  async createPoolOrder(
    adminId: string,
    input: {
      title: string;
      description?: string;
      coinsPerUnit: number;
      minParticipants: number;
      maxParticipants?: number;
    },
  ) {
    const PoolOrder = getPoolOrderModel();
    return PoolOrder.create({
      title: input.title,
      description: input.description || "",
      createdByAdminId: adminId as any,
      coinsPerUnit: input.coinsPerUnit,
      minParticipants: input.minParticipants,
      maxParticipants: input.maxParticipants || null,
      isOpen: true,
    });
  }

  async joinPoolOrder(
    buyerId: string,
    input: { poolOrderId: string; units: number; deliveryAddress: string },
  ) {
    const PoolOrder = getPoolOrderModel();
    const PoolJoin = getPoolOrderJoinModel();
    const order = await PoolOrder.findById(input.poolOrderId);
    if (!order || !order.isOpen) {
      throw new ApiError(404, "Pool order not found or closed.");
    }
    if (!input.deliveryAddress.trim()) {
      throw new ApiError(400, "Delivery address is required.");
    }
    if (input.units <= 0) {
      throw new ApiError(400, "Units must be greater than zero.");
    }

    const existing = await PoolJoin.findOne({
      poolOrderId: order._id,
      buyerId: buyerId as any,
    });
    if (existing) {
      throw new ApiError(409, "Buyer already joined this pool order.");
    }

    const coins = Number(order.coinsPerUnit) * input.units;
    await walletService.chargeCoins(buyerId, coins, "pool_order", {
      poolOrderId: String(order._id),
      units: input.units,
    });

    return PoolJoin.create({
      poolOrderId: order._id,
      buyerId: buyerId as any,
      units: input.units,
      coinsCharged: coins,
      deliveryAddress: input.deliveryAddress.trim(),
    });
  }

  async adminViewPoolOrdersWithAddresses() {
    const PoolJoin = getPoolOrderJoinModel();
    return PoolJoin.find()
      .populate("poolOrderId")
      .populate("buyerId", "username phone role");
  }
}
