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

    res.on("finish", () => {
      const derived = config.resolver?.({
        req,
        res,
        success: success && res.statusCode < 400,
        errorMessage,
      });

      void writeAuditLog({
        action: config.action,
        eventType: derived?.eventType ?? "http_request",
        success: success && res.statusCode < 400,
        errorMessage,
        actor: derived?.actor,
        resource: derived?.resource,
        metadata: {
          expectedName: typeof req.query.expectedName === "string"
            ? req.query.expectedName
            : undefined,
          ...(derived?.metadata ?? {}),
        },
        changes: derived?.changes ?? [],
        tags: derived?.tags ?? [],
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
