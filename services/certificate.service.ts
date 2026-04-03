import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getCertificateModel } from "../models/certificate.model";
import { getUserModel } from "../models/user.model";
import { STAGE_LABELS, type Stage } from "../constants/stages";
import { ApiError } from "../utils/ApiError";
import { uploadBufferToS3 } from "../utils/uploadToS3";

function generateCertificateId(stage: Stage, seq: number): string {
  const stagePrefix = stage === "agri_business" ? "AGRI" : stage.toUpperCase();
  const year = new Date().getFullYear();
  return `MYR-${stagePrefix}-${year}-${String(seq).padStart(5, "0")}`;
}

async function generatePdf(
  fullName: string,
  stageLabel: string,
  certificateId: string,
  issuedAt: Date,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);

  const green = rgb(0.184, 0.49, 0.196); // #2F7D32
  const darkGray = rgb(0.2, 0.2, 0.2);

  // Border
  page.drawRectangle({ x: 20, y: 20, width: 802, height: 555, borderColor: green, borderWidth: 3 });
  page.drawRectangle({ x: 30, y: 30, width: 782, height: 535, borderColor: green, borderWidth: 1 });

  // Header
  page.drawText("MAYURA PLATFORM", {
    x: 280, y: 520, size: 18, font: helveticaBold, color: green,
  });
  page.drawText("Certificate of Completion", {
    x: 250, y: 480, size: 24, font: helveticaBold, color: darkGray,
  });

  // Body
  page.drawText("This certifies that", {
    x: 320, y: 420, size: 14, font: helvetica, color: darkGray,
  });
  page.drawText(fullName, {
    x: 421 - (helveticaBold.widthOfTextAtSize(fullName, 28) / 2), y: 370, size: 28, font: helveticaBold, color: green,
  });
  page.drawText(`has successfully completed the ${stageLabel} stage`, {
    x: 200, y: 320, size: 14, font: helvetica, color: darkGray,
  });
  page.drawText("of the Mayura Agricultural Education Program.", {
    x: 220, y: 295, size: 14, font: helvetica, color: darkGray,
  });

  // Footer
  const dateStr = issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  page.drawText(`Certificate ID: ${certificateId}`, {
    x: 60, y: 80, size: 10, font: helvetica, color: darkGray,
  });
  page.drawText(`Issued: ${dateStr}`, {
    x: 660, y: 80, size: 10, font: helvetica, color: darkGray,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export class CertificateService {
  /** Issue a certificate for a user completing a stage. Idempotent — returns existing if already issued. */
  async issueCertificate(userId: string, stage: Stage): Promise<{ certificateId: string; pdfUrl: string }> {
    const Certificate = getCertificateModel();
    const User = getUserModel();

    const existing = await Certificate.findOne({ userId, stage }).lean();
    if (existing) return { certificateId: existing.certificateId, pdfUrl: existing.pdfUrl };

    const user = await User.findById(userId).lean();
    if (!user) throw new ApiError(404, "User not found.");

    const fullName = user.profile?.fullName || user.username || "Farmer";
    const totalCerts = await Certificate.countDocuments({ stage });
    const certificateId = generateCertificateId(stage, totalCerts + 1);
    const issuedAt = new Date();

    const pdfBuffer = await generatePdf(fullName, STAGE_LABELS[stage], certificateId, issuedAt);

    const pdfUrl = await uploadBufferToS3(
      pdfBuffer,
      `certificates/${userId}/${certificateId}.pdf`,
      "application/pdf",
    );

    await Certificate.create({ userId, stage, certificateId, pdfUrl, issuedAt });

    return { certificateId, pdfUrl };
  }

  /** List all certificates for a user. */
  async getUserCertificates(userId: string) {
    const Certificate = getCertificateModel();
    return Certificate.find({ userId }).sort({ issuedAt: 1 }).lean();
  }

  /** Get certificates by memberQrCode (public). */
  async getCertificatesByQrCode(memberQrCode: string) {
    const User = getUserModel();
    const Certificate = getCertificateModel();
    const user = await User.findOne({ memberQrCode }).select("_id").lean();
    if (!user) throw new ApiError(404, "Member not found.");
    return Certificate.find({ userId: user._id }).select("stage certificateId issuedAt").sort({ issuedAt: 1 }).lean();
  }
}
