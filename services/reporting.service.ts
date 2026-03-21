import { getAuditLogModel } from "../models/auditLog.model";
import { getPaymentOrderModel } from "../models/paymentOrder.model";
import { getRedeemCodeModel } from "../models/redeemCode.model";
import { getUserModel } from "../models/user.model";
import { getWalletTransactionModel } from "../models/walletTransaction.model";

type PaginationInput = {
  page?: number;
  limit?: number;
};

type WalletTransactionFilters = PaginationInput & {
  userId: string;
  type?: "credit" | "debit";
  source?: "buy_coins" | "redeem_code" | "soil_test" | "mayur_gpt" | "pool_order" | "peer_transfer" | "manual";
};

type AdminPaymentOrderFilters = PaginationInput & {
  userId?: string;
  status?: "pending" | "processing" | "completed" | "failed" | "expired";
  provider?: "ppcbank_pg";
};

type AdminWalletTransactionFilters = PaginationInput & {
  userId?: string;
  type?: "credit" | "debit";
  source?: "buy_coins" | "redeem_code" | "soil_test" | "mayur_gpt" | "pool_order" | "peer_transfer" | "manual";
};

type AdminRedeemCodeFilters = PaginationInput & {
  status?: "created" | "redeemed";
};

type AdminAuditLogFilters = PaginationInput & {
  action?: string;
  eventType?: string;
  success?: boolean;
  actorId?: string;
  actorRole?: string;
};

function normalizePagination(input: PaginationInput) {
  const page = Math.max(1, Number(input.page || 1));
  const limit = Math.min(100, Math.max(1, Number(input.limit || 20)));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function buildPagination(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function mapUserSummary(user: any) {
  if (!user) {
    return null;
  }
  return {
    id: String(user._id),
    username: user.username || null,
    phone: user.phone || null,
    role: user.role || null,
    fullName: user.profile?.fullName || null,
  };
}

function mapPaymentOrder(order: any, user?: any) {
  return {
    id: String(order._id),
    user: mapUserSummary(user),
    type: order.type,
    provider: order.provider,
    status: order.status,
    amountUsd: Number(order.amountUsd || 0),
    coins: Number(order.coins || 0),
    currency: order.currency,
    providerPaymentId: order.providerPaymentId || null,
    virtualAccountNo: order.virtualAccountNo || null,
    billNumber: order.billNumber || null,
    failureReason: order.failureReason || null,
    lastCheckedAt: order.lastCheckedAt || null,
    completedAt: order.completedAt || null,
    expiresAt: order.expiresAt || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    instructions: order.instructions || {},
  };
}

function mapWalletTransaction(transaction: any, user?: any, paymentOrder?: any) {
  return {
    id: String(transaction._id),
    user: mapUserSummary(user),
    type: transaction.type,
    source: transaction.source,
    usdAmount: Number(transaction.usdAmount || 0),
    coinsDelta: Number(transaction.coinsDelta || 0),
    balanceAfter: Number(transaction.balanceAfter || 0),
    paymentOrderId: transaction.paymentOrderId ? String(transaction.paymentOrderId) : null,
    paymentOrder: paymentOrder
      ? {
          id: String(paymentOrder._id),
          status: paymentOrder.status,
          provider: paymentOrder.provider,
          providerPaymentId: paymentOrder.providerPaymentId || null,
          billNumber: paymentOrder.billNumber || null,
        }
      : null,
    metadata: transaction.metadata || {},
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

function mapAuditLog(log: any) {
  const actor = log.actor || {};
  const resource = log.resource || {};
  const request = log.request || {};
  return {
    id: String(log._id),
    action: log.action,
    eventType: log.eventType,
    success: Boolean(log.success),
    errorMessage: log.errorMessage || null,
    createdAt: log.createdAt,
    actor: {
      id: actor.id || null,
      type: actor.type || null,
      role: actor.role || null,
      email: actor.email || null,
      username: actor.username || null,
      phone: actor.phone || null,
      label: actor.username || actor.email || actor.phone || actor.id || "Unknown actor",
    },
    resource: {
      id: resource.id || null,
      type: resource.type || null,
      collection: resource.collection || null,
      label: [resource.type, resource.id].filter(Boolean).join(":") || null,
    },
    request: {
      method: request.method || null,
      path: request.path || null,
      statusCode: request.statusCode ?? null,
      durationMs: request.durationMs ?? null,
      ip: request.ip || null,
      userAgent: request.userAgent || null,
      requestId: request.requestId || null,
      summary: [request.method, request.path, request.statusCode].filter(Boolean).join(" "),
    },
    tags: Array.isArray(log.tags) ? log.tags : [],
    changes: Array.isArray(log.changes) ? log.changes : [],
    metadata: log.metadata || {},
  };
}

export class ReportingService {
  async getAdminRevenueSummary() {
    const PaymentOrder = getPaymentOrderModel();
    const Tx = getWalletTransactionModel();

    const [paymentSummary, debitSummary] = await Promise.all([
      PaymentOrder.aggregate([
        {
          $match: {
            type: "coin_topup",
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            totalSalesUsd: { $sum: { $ifNull: ["$amountUsd", 0] } },
            totalCoinsSold: { $sum: { $ifNull: ["$coins", 0] } },
            totalTopups: { $sum: 1 },
          },
        },
      ]),
      Tx.aggregate([
        {
          $match: {
            type: "debit",
          },
        },
        {
          $group: {
            _id: "$source",
            coinsSpent: { $sum: { $abs: { $ifNull: ["$coinsDelta", 0] } } },
            usdValue: { $sum: { $ifNull: ["$usdAmount", 0] } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const sales = paymentSummary[0] || {
      totalSalesUsd: 0,
      totalCoinsSold: 0,
      totalTopups: 0,
    };

    const spendBySource = debitSummary
      .map((item) => ({
        source: String(item._id || "unknown"),
        coinsSpent: Number(item.coinsSpent || 0),
        usdValue: Number(item.usdValue || 0),
        count: Number(item.count || 0),
      }))
      .sort((a, b) => b.coinsSpent - a.coinsSpent);

    return {
      totalSalesUsd: Number(sales.totalSalesUsd || 0),
      totalCoinsSold: Number(sales.totalCoinsSold || 0),
      totalTopups: Number(sales.totalTopups || 0),
      totalCoinsSpent: spendBySource.reduce((sum, item) => sum + item.coinsSpent, 0),
      totalSpendEvents: spendBySource.reduce((sum, item) => sum + item.count, 0),
      spendBySource,
    };
  }

  async getUserWalletTransactions(filters: WalletTransactionFilters) {
    const { page, limit, skip } = normalizePagination(filters);
    const Tx = getWalletTransactionModel();
    const PaymentOrder = getPaymentOrderModel();
    const query: Record<string, unknown> = {
      userId: filters.userId as any,
    };
    if (filters.type) {
      query.type = filters.type;
    }
    if (filters.source) {
      query.source = filters.source;
    }

    const [items, total] = await Promise.all([
      Tx.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Tx.countDocuments(query),
    ]);
    const paymentOrderIds = items
      .map((item: any) => item.paymentOrderId)
      .filter(Boolean);
    const paymentOrders = paymentOrderIds.length > 0
      ? await PaymentOrder.find({ _id: { $in: paymentOrderIds } }).lean()
      : [];
    const paymentOrderMap = new Map(paymentOrders.map((order: any) => [String(order._id), order]));

    return {
      items: items.map((item: any) =>
        mapWalletTransaction(item, undefined, paymentOrderMap.get(String(item.paymentOrderId || "")))),
      pagination: buildPagination(total, page, limit),
    };
  }

  async getAdminPaymentOrders(filters: AdminPaymentOrderFilters) {
    const { page, limit, skip } = normalizePagination(filters);
    const PaymentOrder = getPaymentOrderModel();
    const User = getUserModel();
    const query: Record<string, unknown> = {};
    if (filters.userId) {
      query.userId = filters.userId as any;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.provider) {
      query.provider = filters.provider;
    }

    const [items, total] = await Promise.all([
      PaymentOrder.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PaymentOrder.countDocuments(query),
    ]);
    const userIds = [...new Set(items.map((item: any) => String(item.userId)))];
    const users = userIds.length > 0
      ? await User.find({ _id: { $in: userIds } })
        .select("username phone role profile.fullName")
        .lean()
      : [];
    const userMap = new Map(users.map((user: any) => [String(user._id), user]));

    return {
      items: items.map((item: any) => mapPaymentOrder(item, userMap.get(String(item.userId)))),
      pagination: buildPagination(total, page, limit),
    };
  }

  async getAdminWalletTransactions(filters: AdminWalletTransactionFilters) {
    const { page, limit, skip } = normalizePagination(filters);
    const Tx = getWalletTransactionModel();
    const PaymentOrder = getPaymentOrderModel();
    const User = getUserModel();
    const query: Record<string, unknown> = {};
    if (filters.userId) {
      query.userId = filters.userId as any;
    }
    if (filters.type) {
      query.type = filters.type;
    }
    if (filters.source) {
      query.source = filters.source;
    }

    const [items, total] = await Promise.all([
      Tx.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Tx.countDocuments(query),
    ]);

    const userIds = [...new Set(items.map((item: any) => String(item.userId)))];
    const paymentOrderIds = items
      .map((item: any) => item.paymentOrderId)
      .filter(Boolean)
      .map((id: any) => String(id));

    const [users, paymentOrders] = await Promise.all([
      userIds.length > 0
        ? User.find({ _id: { $in: userIds } })
          .select("username phone role profile.fullName")
          .lean()
        : [],
      paymentOrderIds.length > 0
        ? PaymentOrder.find({ _id: { $in: paymentOrderIds } }).lean()
        : [],
    ]);

    const userMap = new Map(users.map((user: any) => [String(user._id), user]));
    const paymentOrderMap = new Map(paymentOrders.map((order: any) => [String(order._id), order]));

    return {
      items: items.map((item: any) =>
        mapWalletTransaction(
          item,
          userMap.get(String(item.userId)),
          paymentOrderMap.get(String(item.paymentOrderId || "")),
        )),
      pagination: buildPagination(total, page, limit),
    };
  }

  async getAdminRedeemCodes(filters: AdminRedeemCodeFilters) {
    const { page, limit, skip } = normalizePagination(filters);
    const RedeemCode = getRedeemCodeModel();
    const User = getUserModel();
    const query: Record<string, unknown> = {};
    if (filters.status) {
      query.status = filters.status;
    }

    const [items, total] = await Promise.all([
      RedeemCode.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      RedeemCode.countDocuments(query),
    ]);

    const userIds = [...new Set(
      items
        .flatMap((item: any) => [item.createdByAdminId, item.redeemedByUserId])
        .filter(Boolean)
        .map((id: any) => String(id)),
    )];

    const users = userIds.length > 0
      ? await User.find({ _id: { $in: userIds } })
        .select("username phone role profile.fullName")
        .lean()
      : [];
    const userMap = new Map(users.map((user: any) => [String(user._id), user]));

    return {
      items: items.map((item: any) => ({
        id: String(item._id),
        code: item.code,
        amountUsd: Number(item.amountUsd || 0),
        coins: Number(item.coins || 0),
        status: item.status,
        notes: item.notes || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        redeemedAt: item.redeemedAt || null,
        createdBy: mapUserSummary(userMap.get(String(item.createdByAdminId || ""))),
        redeemedBy: mapUserSummary(userMap.get(String(item.redeemedByUserId || ""))),
      })),
      pagination: buildPagination(total, page, limit),
    };
  }

  async getAdminAuditLogs(filters: AdminAuditLogFilters) {
    const { page, limit, skip } = normalizePagination(filters);
    const AuditLog = getAuditLogModel();
    const query: Record<string, unknown> = {};
    if (filters.action) {
      query.action = filters.action;
    }
    if (filters.eventType) {
      query.eventType = filters.eventType;
    }
    if (typeof filters.success === "boolean") {
      query.success = filters.success;
    }
    if (filters.actorId) {
      query["actor.id"] = filters.actorId;
    }
    if (filters.actorRole) {
      query["actor.role"] = filters.actorRole;
    }

    const [items, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(query),
    ]);

    return {
      items: items.map(mapAuditLog),
      pagination: buildPagination(total, page, limit),
    };
  }
}
