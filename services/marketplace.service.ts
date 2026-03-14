import { getBidModel } from "../models/bid.model";
import { getListingModel } from "../models/listing.model";
import { getUserModel } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { broadcast, notifyUsers } from "../ws/realtime";
import { uploadToS3 } from "../utils/uploadToS3";
import fs from "fs/promises";

async function safeUnlink(path: string): Promise<void> {
  try {
    await fs.unlink(path);
  } catch {
    // ignore
  }
}

export class MarketplaceService {
  async listListings(input?: { sellerId?: string; viewerId?: string }) {
    const Listing = getListingModel();
    const Bid = getBidModel();

    const query: Record<string, unknown> = { isActive: true };
    if (input?.sellerId) {
      query.sellerId = input.sellerId as any;
    }

    const listings = await Listing.find(query)
      .populate("sellerId", "username phone role marketplaceMode memberQrCode")
      .sort({ createdAt: -1 });

    const viewerBids = input?.viewerId
      ? await Bid.find({
          listingId: { $in: listings.map((listing) => listing._id) },
          bidderId: input.viewerId as any,
        }).sort({ createdAt: -1 })
      : [];

    const viewerBidMap = new Map<string, any>();
    for (const bid of viewerBids) {
      const key = String(bid.listingId);
      if (!viewerBidMap.has(key)) {
        viewerBidMap.set(key, bid);
      }
    }

    return listings.map((listing) => ({
      currentUserBid: viewerBidMap.has(String(listing._id))
        ? {
            _id: String(viewerBidMap.get(String(listing._id))._id),
            amountUsd: Number(viewerBidMap.get(String(listing._id)).amountUsd || 0),
            status: String(viewerBidMap.get(String(listing._id)).status || ""),
            createdAt: viewerBidMap.get(String(listing._id)).createdAt,
            updatedAt: viewerBidMap.get(String(listing._id)).updatedAt,
          }
        : null,
      _id: String(listing._id),
      title: listing.title,
      description: listing.description,
      imageUrls: listing.imageUrls || [],
      basePriceUsd: listing.basePriceUsd,
      quantity: listing.quantity,
      isActive: listing.isActive,
      highestBidUsd: listing.highestBidUsd || 0,
      highestBidByUserId: listing.highestBidByUserId
        ? String(listing.highestBidByUserId)
        : null,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
      seller: listing.sellerId && typeof listing.sellerId === "object"
        ? {
            id: String((listing.sellerId as any)._id),
            username: String((listing.sellerId as any).username || ""),
            phone: String((listing.sellerId as any).phone || ""),
            role: String((listing.sellerId as any).role || ""),
            marketplaceMode: String((listing.sellerId as any).marketplaceMode || "both"),
            memberQrCode: String((listing.sellerId as any).memberQrCode || ""),
          }
        : null,
    }));
  }

  async createListing(
    sellerId: string,
    input: {
      title: string;
      description?: string;
      basePriceUsd: number;
      quantity: number;
      images?: Express.Multer.File[];
    },
  ) {
    const User = getUserModel();
    const seller = await User.findById(sellerId);
    if (!seller) {
      throw new ApiError(404, "Seller not found.");
    }
    if (!["farmer", "buyer", "seller", "admin", "superadmin"].includes(String(seller.role))) {
      throw new ApiError(403, "Only marketplace-enabled users can create listings.");
    }
    const files = input.images || [];
    const imageUrls: string[] = [];
    try {
      for (const [idx, file] of files.entries()) {
        const url = await uploadToS3(file.path, {
          contentType: file.mimetype,
          keyPrefix: `marketplace/listings/${sellerId}/${idx + 1}`,
        });
        imageUrls.push(url);
      }

      const Listing = getListingModel();
      const listing = await Listing.create({
        sellerId: sellerId as any,
        title: input.title,
        description: input.description || "",
        imageUrls,
        basePriceUsd: input.basePriceUsd,
        quantity: input.quantity,
        isActive: true,
        highestBidUsd: 0,
      });
      return listing;
    } finally {
      await Promise.all(files.map((f) => safeUnlink(f.path)));
    }
  }

  async placeBid(
    bidderId: string,
    input: { listingId: string; amountUsd: number },
  ) {
    const Listing = getListingModel();
    const Bid = getBidModel();
    const listing = await Listing.findById(input.listingId);
    if (!listing || !listing.isActive) {
      throw new ApiError(404, "Listing not found or inactive.");
    }
    if (String(listing.sellerId) === bidderId) {
      throw new ApiError(400, "Seller cannot bid on own listing.");
    }

    const minRequired = Math.max(
      Number(listing.basePriceUsd || 0),
      Number(listing.highestBidUsd || 0) + 0.01,
    );
    if (input.amountUsd < minRequired) {
      throw new ApiError(400, `Bid too low. Minimum required is ${minRequired}.`);
    }

    const existingBid = await Bid.findOne({
      listingId: listing._id,
      bidderId: bidderId as any,
    }).sort({ createdAt: -1 });

    await Bid.updateMany(
      { listingId: listing._id, bidderId: { $ne: bidderId as any }, status: "active" },
      { $set: { status: "outbid" } },
    );

    let bid;
    if (existingBid) {
      bid = existingBid;
      bid.amountUsd = input.amountUsd;
      bid.status = "active";
      await bid.save();

      await Bid.updateMany(
        {
          listingId: listing._id,
          bidderId: bidderId as any,
          _id: { $ne: existingBid._id },
          status: "active",
        },
        { $set: { status: "outbid" } },
      );
    } else {
      bid = await Bid.create({
        listingId: listing._id,
        bidderId: bidderId as any,
        amountUsd: input.amountUsd,
        status: "active",
      });
    }

    listing.highestBidUsd = input.amountUsd;
    listing.highestBidByUserId = bidderId as any;
    await listing.save();

    const payload = {
      listingId: String(listing._id),
      highestBidUsd: listing.highestBidUsd,
      highestBidByUserId: String(listing.highestBidByUserId),
      bidId: String(bid._id),
    };
    broadcast("marketplace.bid.updated", payload);
    notifyUsers([String(listing.sellerId)], "marketplace.bid.for_seller", payload);

    return {
      listing,
      bid,
    };
  }

  async listSellerBids(sellerId: string) {
    const Listing = getListingModel();
    const Bid = getBidModel();
    const listings = await Listing.find({ sellerId: sellerId as any }).select("_id");
    const listingIds = listings.map((l) => l._id);
    return Bid.find({ listingId: { $in: listingIds } })
      .populate("bidderId", "username phone role memberQrCode")
      .sort({ createdAt: -1 });
  }
}
