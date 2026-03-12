import { marketplaceUpload } from "../lib/marketplaceMulter";

export const uploadListingImages = marketplaceUpload.array("images", 8);
