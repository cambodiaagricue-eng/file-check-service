import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  getAuditLogModel,
  type AuditActor,
  type AuditChange,
  type AuditLogInput,
  type AuditResource,
} from "../models/auditLog.model";

type AuditedHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

type AuditLogPayload = Omit<AuditLogInput, "request"> & {
  request: {
    method: string;
    path: string;
    statusCode: number;
    ip?: string;
    userAgent?: string;
    requestId?: string;
    durationMs: number;
  };
};

const SENSITIVE_KEYS = new Set([
  "password",
  "newPassword",
  "accessToken",
  "refreshToken",
  "token",
  "authorization",
  "cookie",
  "code",
  "otp",
]);

function sanitizeValue(
  input: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (depth > 6) {
    return "[TRUNCATED]";
  }

  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean"
  ) {
    return input;
  }

  if (typeof input === "bigint") {
    return input.toString();
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message,
      stack: input.stack,
    };
  }

  if (Array.isArray(input)) {
    return input.map((v) => sanitizeValue(v, seen, depth + 1));
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;

    if (seen.has(obj)) {
      return "[CIRCULAR]";
    }
    seen.add(obj);

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeValue(v, seen, depth + 1);
      }
    }
    return out;
  }

  return String(input);
}

function getFileMetadata(req: Request): unknown {
  const one = (req as Request & { file?: Express.Multer.File }).file;
  const many = (req as Request & { files?: unknown }).files;

  if (one) {
    return [
      {
        fieldname: one.fieldname,
        originalname: one.originalname,
        mimetype: one.mimetype,
        size: one.size,
      },
    ];
  }

  if (Array.isArray(many)) {
    return many.map((file) => {
      const f = file as Express.Multer.File;
      return {
        fieldname: f.fieldname,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      };
    });
  }

  if (many && typeof many === "object") {
    const filesByField = many as Record<string, Express.Multer.File[]>;
    return Object.fromEntries(
      Object.entries(filesByField).map(([field, files]) => [
        field,
        files.map((f) => ({
          fieldname: f.fieldname,
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
        })),
      ]),
    );
  }

  return undefined;
}

type AuditResolver = (context: {
  req: Request;
  res: Response;
  success: boolean;
  errorMessage?: string;
}) => {
  actor?: AuditActor;
  resource?: AuditResource;
  metadata?: Record<string, unknown>;
  changes?: AuditChange[];
  tags?: string[];
  eventType?: string;
};

export type WithAuditConfig = {
  action: string;
  resolver?: AuditResolver;
};

function shouldCaptureResponseSnapshot(action: string, body: unknown) {
  if (
    action.endsWith("_list") ||
    action === "admin_users_documents_list" ||
    action === "auth_login" ||
    action === "auth_refresh_token"
  ) {
    return false;
  }

  if (
    body &&
    typeof body === "object" &&
    "data" in (body as Record<string, unknown>) &&
    Array.isArray((body as { data?: unknown }).data)
  ) {
    return false;
  }

  return true;
}

async function writeAuditLog(payload: AuditLogPayload): Promise<void> {
  try {
    const AuditLog = getAuditLogModel();
    await AuditLog.create(payload);
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}

export async function logAuditEvent(payload: AuditLogPayload): Promise<void> {
  await writeAuditLog(payload);
}

export function withAudit(
  actionOrConfig: string | WithAuditConfig,
  handler: AuditedHandler,
): RequestHandler {
  const config: WithAuditConfig =
    typeof actionOrConfig === "string"
      ? { action: actionOrConfig }
      : actionOrConfig;

  return async (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    let success = true;
    let errorMessage: string | undefined;
    let responseBody: unknown;

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      responseBody = body;
      return originalJson(body);
    }) as Response["json"];

    res.on("finish", () => {
      void (async () => {
      const derived = config.resolver?.({
        req,
        res,
        success: success && res.statusCode < 400,
        errorMessage,
      });

      const authenticatedUserSnapshot = req.authUser
        ? sanitizeValue({
            id: req.authUser.id,
            username: req.authUser.username,
            phone: req.authUser.phone,
            role: req.authUser.role,
            memberQrCode: req.authUser.memberQrCode,
            onboardingCompleted: req.authUser.onboardingCompleted,
            kycReviewStatus: req.authUser.kycReviewStatus,
            kycRejectionReason: req.authUser.kycRejectionReason || null,
            impersonatedBy: req.authUser.impersonatedBy || null,
          }) as Record<string, unknown>
        : undefined;

      const authenticatedActor = req.authUser
        ? {
          id: req.authUser.id,
          type: "authenticated_user",
          role: req.authUser.role,
          username: req.authUser.username,
          phone: req.authUser.phone,
          onboardingCompleted: req.authUser.onboardingCompleted,
        }
        : undefined;

      const requestSnapshot = {
        baseUrl: req.baseUrl,
        routePath: req.route?.path,
        params: sanitizeValue(req.params || {}),
        query: sanitizeValue(req.query || {}),
        body: sanitizeValue(req.body || {}),
        files: sanitizeValue(getFileMetadata(req)),
        headers: sanitizeValue({
          "x-request-id": req.get("x-request-id") || undefined,
          origin: req.get("origin") || undefined,
          referer: req.get("referer") || undefined,
        }),
      };

      void writeAuditLog({
        action: config.action,
        eventType: derived?.eventType ?? "http_request",
        success: success && res.statusCode < 400,
        errorMessage,
        actor: {
          ...authenticatedActor,
          ...(derived?.actor ?? {}),
        },
        resource: derived?.resource,
        metadata: {
          expectedName: typeof req.query.expectedName === "string"
            ? req.query.expectedName
            : undefined,
          authenticatedUser: authenticatedUserSnapshot,
          requestSnapshot,
          responseSnapshot: shouldCaptureResponseSnapshot(config.action, responseBody)
            ? sanitizeValue(responseBody)
            : undefined,
          ...(derived?.metadata ?? {}),
        },
        changes: [
          ...(derived?.changes ?? []),
        ],
        tags: [
          ...(req.authUser ? ["authenticated"] : ["anonymous"]),
          ...(derived?.tags ?? []),
        ],
        request: {
          method: req.method,
          path: req.originalUrl || req.path,
          statusCode: res.statusCode,
          ip: req.ip,
          userAgent: req.get("user-agent"),
          requestId: req.get("x-request-id") || undefined,
          durationMs: Date.now() - startedAt,
        },
      });
      })();
    });

    try {
      await Promise.resolve(handler(req, res, next));
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : "Unknown error";
      next(error);
    }
  };
}
