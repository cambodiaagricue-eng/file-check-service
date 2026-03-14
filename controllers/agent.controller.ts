import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { getUserModel } from "../models/user.model";
import { OnboardingService } from "../services/onboarding.service";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${field} is required.`);
  }
  return value.trim();
}

const onboardingService = new OnboardingService();

export async function agentCreateFarmerController(req: Request, res: Response) {
  if (!req.authUser?.id) {
    throw new ApiError(401, "Unauthorized.");
  }
  const username = requireString(req.body?.username, "username").toLowerCase();
  const phone = requireString(req.body?.phone, "phone");
  const password = requireString(req.body?.password, "password");

  const User = getUserModel();
  const exists = await User.findOne({ $or: [{ username }, { phone }] });
  if (exists) {
    throw new ApiError(409, "User already exists.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const farmer = await User.create({
    username,
    phone,
    passwordHash,
    role: "farmer",
    marketplaceMode: "both",
    createdByAgentId: req.authUser.id as any,
    agentCreatedPendingApproval: true,
    isActive: false,
    isVerified: true,
  });
  return res.json(
    new ApiResponse(
      true,
      "Farmer account created by agent. Pending admin approval.",
      farmer,
    ),
  );
}

export async function agentOnboardFarmerController(req: Request, res: Response) {
  if (!req.authUser?.id) {
    throw new ApiError(401, "Unauthorized.");
  }

  const username = requireString(req.body?.username, "username").toLowerCase();
  const phone = requireString(req.body?.phone, "phone");
  const password = requireString(req.body?.password, "password");
  const fullName = requireString(req.body?.fullName, "fullName");
  const address = requireString(req.body?.address, "address");
  const gender = requireString(req.body?.gender, "gender");
  const age = Number(requireString(req.body?.age, "age"));

  const filesByField = (req.files || {}) as Record<string, Express.Multer.File[]>;
  const selfie = filesByField.selfie?.[0];
  const govId = filesByField.govId?.[0];
  const landDocuments = filesByField.landDocuments || [];

  const User = getUserModel();
  const exists = await User.findOne({ $or: [{ username }, { phone }] });
  if (exists) {
    throw new ApiError(409, "User already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const farmer = await User.create({
    username,
    phone,
    passwordHash,
    role: "farmer",
    marketplaceMode: "both",
    createdByAgentId: req.authUser.id as any,
    agentCreatedPendingApproval: true,
    isActive: false,
    isVerified: true,
  });

  try {
    const status = await onboardingService.completeAllStepsByAgent(
      String(farmer._id),
      { fullName, address, gender, age },
      selfie,
      govId,
      landDocuments,
    );

    return res.json(
      new ApiResponse(
        true,
        "Farmer onboarded by agent. Pending admin approval.",
        {
          farmer,
          onboarding: status,
        },
      ),
    );
  } catch (error) {
    await User.findByIdAndDelete(farmer._id);
    throw error;
  }
}

export async function agentListFarmersController(req: Request, res: Response) {
  if (!req.authUser?.id) {
    throw new ApiError(401, "Unauthorized.");
  }

  const User = getUserModel();
  const farmers = await User.find({ createdByAgentId: req.authUser.id as any, role: "farmer" })
    .select(
      "username phone memberQrCode isActive onboardingCompleted createdByAgentId agentCreatedPendingApproval profile onboarding createdAt updatedAt",
    )
    .sort({ createdAt: -1 });

  return res.json(
    new ApiResponse(
      true,
      "Agent farmers fetched.",
      farmers.map((farmer) => ({
        userId: String(farmer._id),
        username: farmer.username,
        phone: farmer.phone,
        memberQrCode: farmer.memberQrCode,
        isActive: farmer.isActive,
        onboardingCompleted: farmer.onboardingCompleted,
        agentCreatedPendingApproval: farmer.agentCreatedPendingApproval,
        createdAt: farmer.createdAt,
        updatedAt: farmer.updatedAt,
        profile: farmer.profile,
        onboarding: farmer.onboarding,
      })),
    ),
  );
}
