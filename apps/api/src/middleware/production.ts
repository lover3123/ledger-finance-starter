import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";

/**
 * Security headers via helmet-like middleware.
 * Adds X-Content-Type-Options, X-Frame-Options, etc.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Remove fingerprinting headers
  res.removeHeader("X-Powered-By");
  next();
}

/**
 * Assigns a unique request ID to every request for debugging/tracing.
 */
export function requestId(req: Request, _res: Response, next: NextFunction) {
  (req as any).requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  next();
}

/**
 * Request timeout — kills slow requests after N ms.
 */
export function requestTimeout(timeoutMs = 30_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ message: "Request timeout" });
      }
    }, timeoutMs);
    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));
    next();
  };
}

/**
 * Basic input sanitization — strips dangerous characters from common string fields.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === "object") {
    for (const [key, val] of Object.entries(req.query)) {
      if (typeof val === "string") {
        (req.query as any)[key] = stripDangerous(val);
      }
    }
  }
  next();
}

function sanitizeObject(obj: Record<string, unknown>) {
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "string") {
      obj[key] = stripDangerous(val);
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      sanitizeObject(val as Record<string, unknown>);
    } else if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        if (typeof val[i] === "string") {
          val[i] = stripDangerous(val[i]);
        } else if (val[i] && typeof val[i] === "object") {
          sanitizeObject(val[i]);
        }
      }
    }
  }
}

/** Strip null bytes and basic script injection patterns. */
function stripDangerous(s: string): string {
  return s
    .replace(/\0/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "");
}
