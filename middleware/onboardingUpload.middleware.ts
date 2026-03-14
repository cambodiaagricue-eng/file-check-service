import { onboardingUpload } from "../lib/onboardingMulter";

export const uploadSelfie = onboardingUpload.single("selfie");
export const uploadGovId = onboardingUpload.single("govId");
export const uploadLandDocuments = onboardingUpload.array("landDocuments", 10);
export const uploadOnboardingSubmit = onboardingUpload.fields([
  { name: "selfie", maxCount: 1 },
  { name: "govId", maxCount: 1 },
  { name: "landDocuments", maxCount: 10 },
]);
