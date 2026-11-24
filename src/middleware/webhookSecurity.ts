// src/middleware/webhookSecurity.ts
// Middleware utilities for securing public webhook endpoints.
// Provides JSON body parsing, Zod validation, token authentication, input sanitization,
// basic in‑memory rate‑limiting, and standardized error responses.

import type { Request } from "@tanstack/react-router";
import { z, ZodSchema } from "zod";

/**
 * Simple in‑memory rate limiter (per IP).
 * Allows `maxRequests` within `windowMs` milliseconds.
 */
class RateLimiter {
  private store = new Map<string, { count: number; reset: number }>();
  constructor(private maxRequests: number = 60, private windowMs: number = 60_000) {}

  isAllowed(ip: string): boolean {
    const now = Date.now();
    const record = this.store.get(ip);
    if (!record) {
      this.store.set(ip, { count: 1, reset: now + this.windowMs });
      return true;
    }
    if (now > record.reset) {
      // reset window
      this.store.set(ip, { count: 1, reset: now + this.windowMs });
      return true;
    }
    if (record.count < this.maxRequests) {
      record.count += 1;
      return true;
    }
    return false;
  }
}

// One global limiter instance – can be tuned via env vars if needed.
const limiter = new RateLimiter(
  Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 60,
  Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
);

/**
 * Sanitizes plain‑text strings by stripping HTML tags and script‑like content.
 * For now we perform a very light sanitization – production code should use
 * a dedicated library such as DOMPurify (which works in Node with JSDOM).
 */
function sanitizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  // Remove anything that looks like a tag.
  return value.replace(/<[^>]*>/g, "").trim();
}

/**
 * Standardized JSON error response helper.
 */
export function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Standardized JSON success helper.
 */
export function jsonSuccess<T>(payload: T, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Core validation routine used by webhook handlers.
 *
 * @param req Incoming request object.
 * @param schema Zod schema describing the expected payload shape.
 * @param tokenEnv Optional name of the env var that stores the shared secret token.
 */
export async function validateWebhook<T>(
  req: Request,
  schema: ZodSchema<T>,
  tokenEnv = "API_WEBHOOK_TOKEN",
): Promise<{ valid: true; data: T } | { valid: false; error: Response }> {
  // Rate limiting – use client IP if available via "x-forwarded-for" header.
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!limiter.isAllowed(ip)) {
    return { valid: false, error: jsonError(429, "Too many requests – rate limit exceeded") };
  }

  // Authorization header: expect "Bearer <token>".
  const authHeader = req.headers.get("authorization");
  const expected = process.env[tokenEnv];
  if (expected) {
    if (!authHeader?.startsWith("Bearer ")) {
      return { valid: false, error: jsonError(401, "Missing Bearer token") };
    }
    const provided = authHeader.slice(7).trim();
    if (provided !== expected) {
      return { valid: false, error: jsonError(401, "Invalid token") };
    }
  }

  // Parse JSON body.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { valid: false, error: jsonError(400, "Invalid JSON body") };
  }

  // Basic sanitization – walk through object and clean strings.
  const sanitized = (function walk(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return sanitizeString(value);
  })(raw);

  // Zod validation.
  const result = schema.safeParse(sanitized as T);
  if (!result.success) {
    const msg = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { valid: false, error: jsonError(400, `Payload validation error: ${msg}`) };
  }
  return { valid: true, data: result.data };
}

/**
 * Helper to extract tenant id from query string – many routes use the `t` param.
 */
export function getTenantId(req: Request): string {
  try {
    const url = new URL(req.url);
    return url.searchParams.get("t") || "default";
  } catch {
    return "default";
  }
}
