import type { Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { OnboardingService } from "../services/onboarding.service";

const onboardingService = new OnboardingService();

function requireUserId(req: Request): string {
  const userId = req.authUser?.id;
  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }
  return userId;
}

function requireBodyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${fieldName} is required.`);
  }
  return value.trim();
}

export async function onboardingStatusController(req: Request, res: Response) {
  const status = await onboardingService.getStatus(requireUserId(req));
  return res.json(new ApiResponse(true, "Onboarding status fetched.", status));
}

export async function completeOnboardingStep1Controller(req: Request, res: Response) {
  const userId = requireUserId(req);
  const fullName = requireBodyString(req.body?.fullName, "fullName");
  const address = requireBodyString(req.body?.address, "address");
  const gender = requireBodyString(req.body?.gender, "gender");
  const ageRaw = requireBodyString(req.body?.age, "age");
  const age = Number(ageRaw);

  const status = await onboardingService.completeStep1(userId, {
    fullName,
    address,
    gender,
    age,
  }, req.file);

  return res.json(new ApiResponse(true, "Onboarding step 1 completed.", status));
}

export async function completeOnboardingStep2Controller(req: Request, res: Response) {
  const userId = requireUserId(req);
  const status = await onboardingService.completeStep2(userId, req.file);
  return res.json(new ApiResponse(true, "Onboarding step 2 completed.", status));
}

export async function completeOnboardingStep3Controller(req: Request, res: Response) {
  const userId = requireUserId(req);
  const files = Array.isArray(req.files) ? req.files : [];
  const status = await onboardingService.completeStep3(userId, files, {
    latitude: req.body?.latitude,
    longitude: req.body?.longitude,
    placeId: req.body?.placeId,
    formattedAddress: req.body?.formattedAddress,
    drawnShapes: req.body?.drawnShapes,
  });
  return res.json(new ApiResponse(true, "Onboarding step 3 completed.", status));
}

export async function completeOnboardingSubmitController(req: Request, res: Response) {
  const userId = requireUserId(req);
  const fullName = requireBodyString(req.body?.fullName, "fullName");
  const address = requireBodyString(req.body?.address, "address");
  const gender = requireBodyString(req.body?.gender, "gender");
  const ageRaw = requireBodyString(req.body?.age, "age");
  const age = Number(ageRaw);

  const filesByField = (req.files || {}) as Record<string, Express.Multer.File[]>;
  const selfie = filesByField.selfie?.[0];
  const govId = filesByField.govId?.[0];
  const landDocuments = filesByField.landDocuments || [];

  const status = await onboardingService.completeAllSteps(
    userId,
    { fullName, address, gender, age },
    selfie,
    govId,
    landDocuments,
    {
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
      placeId: req.body?.placeId,
      formattedAddress: req.body?.formattedAddress,
      drawnShapes: req.body?.drawnShapes,
    },
  );

  return res.json(
    new ApiResponse(true, "Onboarding submitted and completed successfully.", status),
  );
}
