import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { getUserModel } from "../models/user.model";

export async function ensureSuperadmin(): Promise<void> {
  const User = getUserModel();
  const existing = await User.findOne({ username: "admin" });
  if (existing) {
    if (existing.role !== "superadmin") {
      existing.role = "superadmin" as any;
      await existing.save();
    }
    return;
  }

  const passwordHash = await bcrypt.hash(env.SUPERADMIN_PASSWORD, 12);
  await User.create({
    username: "admin",
    phone: env.SUPERADMIN_PHONE,
    passwordHash,
    role: "superadmin",
    marketplaceMode: "both",
    isVerified: true,
    isActive: true,
    onboardingCompleted: true,
  });
}
