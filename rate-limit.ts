// src/lib/api-framework/rate-limit.ts
import { CustomRequest } from "@/lib/http";
import { ApiError } from "./response";
import { RateLimitAdapter, RateLimitOptions, RateLimitResult } from "./types";

/**
 * Rate limit manager class for limiting request rates
 */
export class RateLimitManager {
  private adapters: Map<string, RateLimitAdapter> = new Map();
  private defaultAdapter: string | null = null;

  constructor() {
    // Register memory adapter by default
    this.registerAdapter('memory', new MemoryRateLimitAdapter());
    this.defaultAdapter = 'memory';
  }

  /**
   * Register a new rate limit adapter
   */
  public registerAdapter(name: string, adapter: RateLimitAdapter): void {
    this.adapters.set(name, adapter);
    if (!this.defaultAdapter) {
      this.defaultAdapter = name;
    }
  }

  /**
   * Set the default rate limit adapter
   */
  public setDefaultAdapter(name: string): void {
    if (!this.adapters.has(name)) {
      throw new Error(`Rate limit adapter '${name}' not registered`);
    }
    this.defaultAdapter = name;
  }

  /**
   * Get a rate limit adapter
   */
  public getAdapter(name?: string): RateLimitAdapter {
    const adapterName = name || this.defaultAdapter;
    if (!adapterName) {
      throw new Error('No default rate limit adapter configured');
    }

    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Rate limit adapter '${adapterName}' not registered`);
    }

    return adapter;
  }

  /**
   * Check rate limit for a request
   */
  public async checkRateLimit(
    req: CustomRequest,
    options: RateLimitOptions
  ): Promise<void> {
    if (!options.enabled) {
      return;
    }

    const adapter = this.getAdapter(options.adapter);

    // Generate key
    const key = this.generateRateLimitKey(req, options);

    // Check rate limit
    const result = await adapter.increment(key, options);

    // Add headers to the request for later use
    req.rateLimitInfo = {
      limit: options.limit,
      remaining: result.remaining,
      reset: result.reset,
      key
    };

    // Throw error if limit exceeded
    if (result.limited) {
      throw new ApiError(
        options.message || "Rate limit exceeded",
        options.statusCode || 429,
        undefined,
        [],
        {
          limit: options.limit,
          remaining: 0,
          reset: result.reset,
          retryAfter: result.retryAfter
        }
      );
    }
  }

  /**
   * Generate a rate limit key based on request and options
   */
  private generateRateLimitKey(req: CustomRequest, options: RateLimitOptions): string {
    if (typeof options.keyGenerator === 'function') {
      return options.keyGenerator(req);
    }

    // Default key generation
    const keyParts = [options.name || 'default'];

    // Add IP address
    const ip = req.ip || 'unknown';
    keyParts.push(`ip:${ip}`);

    // Add user ID if authenticated and option is set
    if (options.varyByUser && req.user?.id) {
      keyParts.push(`user:${req.user.id}`);
    }

    // Add route if option is set
    if (options.varyByRoute) {
      const route = req.url.split('?')[0];
      keyParts.push(`route:${route}`);
    }

    // Add method if option is set
    if (options.varyByMethod) {
      keyParts.push(`method:${req.method}`);
    }

    return keyParts.join('|');
  }

  /**
   * Reset rate limit for a key
   */
  public async resetRateLimit(key: string, adapter?: string): Promise<void> {
    await this.getAdapter(adapter).reset(key);
  }

  /**
   * Get rate limit information for a key
   */
  public async getRateLimitInfo(
    key: string,
    options: RateLimitOptions,
    adapter?: string
  ): Promise<RateLimitResult> {
    return this.getAdapter(adapter).get(key, options);
  }
}

/**
 * Memory-based rate limit adapter implementation
 */
class MemoryRateLimitAdapter implements RateLimitAdapter {
  private limits: Map<string, { count: number; resetAt: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupIntervalMs: number = 60000) {
    // Set up periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  public get cleanupIntervalMs(): NodeJS.Timeout {
    return this.cleanupInterval;
  }

  /**
   * Increment the count for a key
   */
  public async increment(
    key: string,
    options: RateLimitOptions
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = options.window * 1000;

    let limitData = this.limits.get(key);

    // If no data exists or window has passed, create new entry
    if (!limitData || now > limitData.resetAt) {
      limitData = {
        count: 1,
        resetAt: now + windowMs
      };
    } else {
      // Increment count for existing entry
      limitData.count += 1;
    }

    // Store updated data
    this.limits.set(key, limitData);

    // Calculate remaining and determine if limited
    const remaining = Math.max(0, options.limit - limitData.count);
    const limited = limitData.count > options.limit;

    return {
      limited,
      remaining,
      limit: options.limit,
      reset: Math.ceil((limitData.resetAt - now) / 1000),
      retryAfter: limited ? Math.ceil((limitData.resetAt - now) / 1000) : 0
    };
  }

  /**
   * Get the current rate limit information for a key
   */
  public async get(
    key: string,
    options: RateLimitOptions
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const limitData = this.limits.get(key);

    if (!limitData) {
      return {
        limited: false,
        remaining: options.limit,
        limit: options.limit,
        reset: 0,
        retryAfter: 0
      };
    }

    const remaining = Math.max(0, options.limit - limitData.count);
    const limited = limitData.count >= options.limit;

    return {
      limited,
      remaining,
      limit: options.limit,
      reset: Math.ceil((limitData.resetAt - now) / 1000),
      retryAfter: limited ? Math.ceil((limitData.resetAt - now) / 1000) : 0
    };
  }

  /**
   * Reset the count for a key
   */
  public async reset(key: string): Promise<void> {
    this.limits.delete(key);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [key, value] of this.limits.entries()) {
      if (value.resetAt <= now) {
        this.limits.delete(key);
      }
    }
  }
}

/**
 * Factory function to create a Redis rate limit adapter
 * This is just an example and requires a Redis client to be passed
 */
export const createRedisRateLimitAdapter = (redisClient: any): RateLimitAdapter => {
  return {
    async increment(
      key: string,
      options: RateLimitOptions
    ): Promise<RateLimitResult> {
      const now = Math.floor(Date.now() / 1000);
      const windowSeconds = options.window;
      const redisKey = `ratelimit:${key}`;

      console.log(`Incrementing rate limit for key: ${redisKey}`);
      console.log(`Current time: ${now}`);
      const pipeline = redisClient.pipeline();

      // Increment the counter
      pipeline.incr(redisKey);

      // Set expiration if this is a new key
      pipeline.ttl(redisKey);

      const results = await pipeline.exec();

      if (!results || results.length !== 2) {
        throw new Error('Failed to increment rate limit');
      }

      const count = results[0][1];
      const ttl = results[1][1];

      // Set expiration if this is a new key (ttl will be -1 if no expiration is set)
      if (ttl === -1) {
        await redisClient.expire(redisKey, windowSeconds);
      }

      // Calculate reset time
      const reset = ttl === -1 ? windowSeconds : ttl;

      // Calculate remaining and determine if limited
      const remaining = Math.max(0, options.limit - count);
      const limited = count > options.limit;

      return {
        limited,
        remaining,
        limit: options.limit,
        reset,
        retryAfter: limited ? reset : 0
      };
    },

    async get(
      key: string,
      options: RateLimitOptions
    ): Promise<RateLimitResult> {
      const redisKey = `ratelimit:${key}`;

      const pipeline = redisClient.pipeline();
      pipeline.get(redisKey);
      pipeline.ttl(redisKey);

      const results = await pipeline.exec();

      if (!results || results.length !== 2) {
        return {
          limited: false,
          remaining: options.limit,
          limit: options.limit,
          reset: 0,
          retryAfter: 0
        };
      }

      const count = parseInt(results[0][1], 10) || 0;
      const ttl = results[1][1];

      // Calculate reset time
      const reset = ttl === -1 ? options.window : ttl;

      // Calculate remaining and determine if limited
      const remaining = Math.max(0, options.limit - count);
      const limited = count >= options.limit;

      return {
        limited,
        remaining,
        limit: options.limit,
        reset,
        retryAfter: limited ? reset : 0
      };
    },

    async reset(key: string): Promise<void> {
      await redisClient.del(`ratelimit:${key}`);
    }
  };
};

// Create and export a singleton instance
export const rateLimitManager = new RateLimitManager();

// Export convenience function
export const checkRateLimit = async (
  req: CustomRequest,
  options: RateLimitOptions
): Promise<void> => {
  return rateLimitManager.checkRateLimit(req, options);
};