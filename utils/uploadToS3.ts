import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function createS3Client(region: string): S3Client {
  return new S3Client({
    region,
    followRegionRedirects: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    },
  });
}

export async function uploadToS3(
  filepath: string,
  options?: { contentType?: string; keyPrefix?: string },
): Promise<string> {
  const result = await uploadToS3WithMetadata(filepath, options);
  return result.url;
}

export async function uploadToS3WithMetadata(
  filepath: string,
  options?: { contentType?: string; keyPrefix?: string },
): Promise<{ url: string; key: string }> {
  const region = (
    process.env.AWS_BUCKET_REGION ||
    process.env.AWS_REGION ||
    ""
  ).trim();
  if (!region) {
    throw new Error(
      "Missing required environment variable: AWS_BUCKET_REGION or AWS_REGION",
    );
  }

  const bucketName = getRequiredEnv("AWS_BUCKET_NAME");
  const s3 = createS3Client(region);

  await fsp.access(filepath, fs.constants.F_OK);
  const fileBuffer = await fsp.readFile(filepath);
  const fileName = path.basename(filepath);
  const keyPrefix = options?.keyPrefix?.trim() || "uploads";
  const key = `${keyPrefix}/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentLength: fileBuffer.length,
    ContentType: options?.contentType || "application/octet-stream",
  });

  try {
    await s3.send(command);
  } catch (error: any) {
    const statusCode = error?.$metadata?.httpStatusCode ?? "unknown";
    const requestId = error?.$metadata?.requestId ?? "unknown";
    const code = error?.Code ?? error?.code ?? error?.name ?? "UnknownError";
    const message = error?.message ?? "No error message from S3";
    const suggestedRegion =
      error?.$response?.headers?.["x-amz-bucket-region"] ??
      error?.BucketRegion ??
      "unknown";

    throw new Error(
      `S3 upload failed [${code}] (status: ${statusCode}, requestId: ${requestId}, bucket: ${bucketName}, region: ${region}, suggestedRegion: ${suggestedRegion}): ${message}`,
    );
  }

  return {
    url: `https://${bucketName}.s3.${region}.amazonaws.com/${key}`,
    key,
  };
}
