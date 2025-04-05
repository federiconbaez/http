// src/lib/api-framework/cache.ts
import { CustomRequest } from "./request";
import { CacheOptions } from "./types";

// Simple in-memory cache
const cache = new Map<string, { value: any; expires: number }>();

export const withCache = async <T>(
  req: CustomRequest,
  options: CacheOptions,
  handler: () => Promise<T>
): Promise<T> => {
  if (!options.enabled) {
    return handler();
  }

  const cacheKey = typeof options.key === "function"
    ? options.key(req)
    : options.key || req.url;

  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expires > now) {
    return cached.value;
  }

  const result = await handler();

  cache.set(cacheKey, {
    value: result,
    expires: now + options.ttl * 1000,
  });

  return result;
};

// Limpiar la caché periódicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value.expires <= now) {
      cache.delete(key);
    }
  }
}, 60000); // Cada minuto