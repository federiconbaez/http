// src/lib/api-framework/rate-limit.ts
import { CustomRequest } from "@/lib/http/request";
import { ApiError } from "./response";
import { RateLimitOptions } from "./types";

// Simple limitador de tasa en memoria
const rateLimit = new Map<string, { count: number; resetAt: number }>();

export const checkRateLimit = (
  req: CustomRequest,
  options: RateLimitOptions
): void => {
  if (!options.enabled) {
    return;
  }

  const ip = req.ip || "unknown";
  const key = options.keyFn ? options.keyFn(req) : ip;
  const now = Date.now();
  const windowMs = options.window * 1000;

  let limitData = rateLimit.get(key);

  if (!limitData || now > limitData.resetAt) {
    limitData = { count: 1, resetAt: now + windowMs };
  } else {
    limitData.count += 1;
  }

  rateLimit.set(key, limitData);

  if (limitData.count > options.limit) {
    throw new ApiError(
      "Rate limit exceeded",
      429,
      undefined,
      {
        limit: options.limit,
        remaining: 0,
        reset: Math.ceil((limitData.resetAt - now) / 1000),
      }
    );
  }
};

// Limpiar el rate limit periódicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimit.entries()) {
    if (value.resetAt <= now) {
      rateLimit.delete(key);
    }
  }
}, 60000); // Cada minuto