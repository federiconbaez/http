// src/lib/api-framework/cache.ts
import { CustomRequest } from "@/lib/http";
import { CacheAdapter, CacheEntry, CacheOptions } from "./types";

/**
 * Cache manager implementation that supports multiple cache adapters
 */
export class CacheManager {
  private adapters: Map<string, CacheAdapter> = new Map();
  private defaultAdapter: string | null = null;

  constructor() {
    // Register memory adapter by default
    this.registerAdapter('memory', new MemoryCacheAdapter());
    this.defaultAdapter = 'memory';
  }

  /**
   * Register a new cache adapter
   */
  public registerAdapter(name: string, adapter: CacheAdapter): void {
    this.adapters.set(name, adapter);
    if (!this.defaultAdapter) {
      this.defaultAdapter = name;
    }
  }

  /**
   * Set the default cache adapter
   */
  public setDefaultAdapter(name: string): void {
    if (!this.adapters.has(name)) {
      throw new Error(`Cache adapter '${name}' not registered`);
    }
    this.defaultAdapter = name;
  }

  /**
   * Get a cache adapter
   */
  public getAdapter(name?: string): CacheAdapter {
    const adapterName = name || this.defaultAdapter;
    if (!adapterName) {
      throw new Error('No default cache adapter configured');
    }

    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Cache adapter '${adapterName}' not registered`);
    }

    return adapter;
  }

  /**
   * Execute a function with caching
   */
  public async withCache<T>(
    req: CustomRequest,
    options: CacheOptions,
    handler: () => Promise<T>
  ): Promise<T> {
    if (!options.enabled) {
      return handler();
    }

    const adapter = this.getAdapter(options.adapter);
    const cacheKey = await this.generateCacheKey(req, options);

    // Check if we have a cached value
    const cached = await adapter.get<T>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // Execute the handler and cache the result
    const result = await handler();
    await adapter.set(cacheKey, result, {
      ttl: options.ttl,
      tags: options.tags
    });

    return result;
  }

  /**
   * Generate a cache key based on request and options
   */
  private async generateCacheKey(req: CustomRequest, options: CacheOptions): Promise<string> {
    if (typeof options.key === 'function') {
      return await options.key(req);
    }

    if (options.key) {
      return options.key;
    }

    // Default key generation based on URL and method
    const keyParts = [req.method, req.url];

    // Add query parameters if needed
    if (options.includeQuery && req.searchParams) {
      const query = Array.from(req.searchParams.entries())
        .map(([key, value]) => `${key}=${value}`)
        .sort()
        .join('&');

      if (query) {
        keyParts.push(`query:${query}`);
      }
    }

    // Add headers if specified
    if (options.includeHeaders && options.headerNames) {
      const headers = options.headerNames
        .map(name => {
          const value = req.headers.get(name.toLowerCase());
          return value ? `${name}=${value}` : null;
        })
        .filter(Boolean)
        .join('&');

      if (headers) {
        keyParts.push(`headers:${headers}`);
      }
    }

    // Add user ID if authenticated
    if (options.varyByUser && req.user?.id) {
      keyParts.push(`user:${req.user.id}`);
    }

    return keyParts.join('|');
  }

  /**
   * Invalidate cache entries by key pattern
   */
  public async invalidate(pattern: string, adapter?: string): Promise<void> {
    return this.getAdapter(adapter).invalidate(pattern);
  }

  /**
   * Invalidate cache entries by tag
   */
  public async invalidateByTag(tag: string, adapter?: string): Promise<void> {
    return this.getAdapter(adapter).invalidateByTag(tag);
  }

  /**
   * Clear all cache entries
   */
  public async clear(adapter?: string): Promise<void> {
    return this.getAdapter(adapter).clear();
  }
}

/**
 * Memory-based cache adapter implementation
 */
class MemoryCacheAdapter implements CacheAdapter {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupIntervalMs: number = 60000) {
    // Set up periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  /**
   * Clear the cleanup interval
   */
  public get cleanupIntervalId(): NodeJS.Timeout {
    return this.cleanupInterval;
  }

  /**
   * Get a value from cache
   */
  public async get<T>(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (!entry || (entry.expires !== 0 && entry.expires <= now)) {
      // Entry does not exist or is expired
      if (entry) {
        this.cache.delete(key);
        this.removeFromTagIndex(key);
      }
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Set a value in cache
   */
  public async set<T>(
    key: string,
    value: T,
    options: { ttl?: number; tags?: string[] } = {}
  ): Promise<void> {
    const ttl = options.ttl !== undefined ? options.ttl : 300; // Default to 5 minutes
    const now = Date.now();
    const expires = ttl === 0 ? 0 : now + ttl * 1000;

    this.cache.set(key, {
      value,
      expires,
      createdAt: now,
      tags: options.tags || []
    });

    // Update tag index
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(key);
      }
    }
  }

  /**
   * Delete a value from cache
   */
  public async delete(key: string): Promise<boolean> {
    if (!this.cache.has(key)) {
      return false;
    }

    this.removeFromTagIndex(key);
    return this.cache.delete(key);
  }

  /**
   * Invalidate cache entries by key pattern
   */
  public async invalidate(pattern: string): Promise<void> {
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.removeFromTagIndex(key);
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate cache entries by tag
   */
  public async invalidateByTag(tag: string): Promise<void> {
    const keys = this.tagIndex.get(tag);
    if (!keys) {
      return;
    }

    for (const key of keys) {
      this.cache.delete(key);
    }

    // Clear the tag entry
    this.tagIndex.delete(tag);
  }

  /**
   * Clear all cache entries
   */
  public async clear(): Promise<void> {
    this.cache.clear();
    this.tagIndex.clear();
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires !== 0 && entry.expires <= now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.removeFromTagIndex(key);
      this.cache.delete(key);
    }
  }

  /**
   * Remove a key from the tag index
   */
  private removeFromTagIndex(key: string): void {
    const entry = this.cache.get(key);
    if (!entry || !entry.tags || entry.tags.length === 0) {
      return;
    }

    for (const tag of entry.tags) {
      const keys = this.tagIndex.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }
}

/**
 * Factory function to create a Redis cache adapter
 * This is just an example and requires a Redis client to be passed
 */
export const createRedisCacheAdapter = (redisClient: any): CacheAdapter => {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const data = await redisClient.get(`cache:${key}`);
      if (!data) {
        return undefined;
      }

      try {
        const entry = JSON.parse(data);
        const now = Date.now();

        if (entry.expires !== 0 && entry.expires <= now) {
          await redisClient.del(`cache:${key}`);
          return undefined;
        }

        return entry.value as T;
      } catch (error) {
        return undefined;
      }
    },

    async set<T>(
      key: string,
      value: T,
      options: { ttl?: number; tags?: string[] } = {}
    ): Promise<void> {
      const ttl = options.ttl !== undefined ? options.ttl : 300;
      const now = Date.now();
      const expires = ttl === 0 ? 0 : now + ttl * 1000;

      const entry = {
        value,
        expires,
        createdAt: now,
        tags: options.tags || []
      };

      const pipeline = redisClient.pipeline();

      // Store the cache entry
      if (ttl === 0) {
        pipeline.set(`cache:${key}`, JSON.stringify(entry));
      } else {
        pipeline.set(`cache:${key}`, JSON.stringify(entry), 'EX', ttl);
      }

      // Update tag indices
      if (options.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          pipeline.sadd(`tag:${tag}`, key);
        }
      }

      await pipeline.exec();
    },

    async delete(key: string): Promise<boolean> {
      // Get the entry first to remove from tag indices
      const data = await redisClient.get(`cache:${key}`);
      if (data) {
        try {
          const entry = JSON.parse(data);
          const pipeline = redisClient.pipeline();

          // Remove from tag indices
          if (entry.tags && entry.tags.length > 0) {
            for (const tag of entry.tags) {
              pipeline.srem(`tag:${tag}`, key);
            }
          }

          // Delete the key
          pipeline.del(`cache:${key}`);
          await pipeline.exec();
          return true;
        } catch (error) {
          await redisClient.del(`cache:${key}`);
          return true;
        }
      }

      return false;
    },

    async invalidate(pattern: string): Promise<void> {
      const keys = await redisClient.keys(`cache:${pattern}`);
      if (keys.length > 0) {
        // Get entries to remove from tag indices
        const pipeline = redisClient.pipeline();
        for (const key of keys) {
          pipeline.get(key);
        }

        const results = await pipeline.exec();
        const deletePipeline = redisClient.pipeline();

        for (let i = 0; i < results.length; i++) {
          const [error, data] = results[i];
          if (!error && data) {
            try {
              const entry = JSON.parse(data);
              if (entry.tags && entry.tags.length > 0) {
                for (const tag of entry.tags) {
                  deletePipeline.srem(`tag:${tag}`, keys[i].replace('cache:', ''));
                }
              }
            } catch (error) {
              // Ignore parsing errors
            }
          }

          deletePipeline.del(keys[i]);
        }

        await deletePipeline.exec();
      }
    },

    async invalidateByTag(tag: string): Promise<void> {
      const keys = await redisClient.smembers(`tag:${tag}`);
      if (keys.length > 0) {
        const pipeline = redisClient.pipeline();

        for (const key of keys) {
          pipeline.del(`cache:${key}`);
        }

        // Remove the tag set
        pipeline.del(`tag:${tag}`);
        await pipeline.exec();
      }
    },

    async clear(): Promise<void> {
      const keys = await redisClient.keys('cache:*');
      const tagKeys = await redisClient.keys('tag:*');

      if (keys.length > 0 || tagKeys.length > 0) {
        const pipeline = redisClient.pipeline();

        for (const key of [...keys, ...tagKeys]) {
          pipeline.del(key);
        }

        await pipeline.exec();
      }
    }
  };
};

// Create and export a singleton instance
export const cacheManager = new CacheManager();

// Export convenience function
export const withCache = async <T>(
  req: CustomRequest,
  options: CacheOptions,
  handler: () => Promise<T>
): Promise<T> => {
  return cacheManager.withCache(req, options, handler);
};