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
    if (!["seller", "admin", "superadmin"].includes(String(seller.role))) {
      throw new ApiError(403, "Only seller mode users can create listings.");
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

    await Bid.updateMany(
      { listingId: listing._id, status: "active" },
      { $set: { status: "outbid" } },
    );

    const bid = await Bid.create({
      listingId: listing._id,
      bidderId: bidderId as any,
      amountUsd: input.amountUsd,
      status: "active",
    });

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
    return Bid.find({ listingId: { $in: listingIds } }).sort({ createdAt: -1 });
  }
}
