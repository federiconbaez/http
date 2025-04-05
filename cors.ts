// src/lib/api-framework/cors.ts
import { CustomRequest, CustomResponse } from "@/lib/http";
import { CorsOptions } from "./types";

/**
 * CORS (Cross-Origin Resource Sharing) management class
 */
export class CorsManager {
  private defaultOptions: CorsOptions = {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    headers: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    credentials: false,
    enabled: true,
    maxAge: 86400, // 24 hours
    exposedHeaders: [],
    preflightSuccessStatus: 204
  };

  /**
   * Create a new CorsManager with optional default options
   */
  constructor(defaultOptions?: Partial<CorsOptions>) {
    if (defaultOptions) {
      this.defaultOptions = { ...this.defaultOptions, ...defaultOptions };
    }
  }

  /**
   * Check if the request origin is allowed
   */
  public isOriginAllowed(requestOrigin: string, allowedOrigin: string | string[]): boolean {
    if (allowedOrigin === "*") {
      return true;
    }

    if (Array.isArray(allowedOrigin)) {
      return allowedOrigin.some(origin => this.isOriginAllowed(requestOrigin, origin));
    }

    // Check if the origin is a regex pattern
    if (allowedOrigin.startsWith('/') && allowedOrigin.endsWith('/')) {
      const regex = new RegExp(allowedOrigin.slice(1, -1));
      return regex.test(requestOrigin);
    }

    // Check if the origin uses wildcard matching
    if (allowedOrigin.includes('*')) {
      const pattern = allowedOrigin.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);

      // Check if the request origin matches the pattern
      return regex.test(requestOrigin);
    }

    return requestOrigin === allowedOrigin;
  }

  /**
   * Apply CORS headers to the response
   */
  public applyCors(
    response: CustomResponse,
    requestOrigin: string | null = null,
    options: Partial<CorsOptions> = {}
  ): CustomResponse {
    // Merge options with defaults
    const finalOptions: CorsOptions = { ...this.defaultOptions, ...options };

    // Set Access-Control-Allow-Origin
    if (requestOrigin && finalOptions.origin !== "*") {
      if (this.isOriginAllowed(requestOrigin, finalOptions.origin)) {
        response.setHeader("Access-Control-Allow-Origin", requestOrigin);
        response.setHeader("Vary", "Origin");
      }
    } else {
      response.setHeader("Access-Control-Allow-Origin",
        Array.isArray(finalOptions.origin) ? finalOptions.origin.join(",") : finalOptions.origin);
    }

    // Set Access-Control-Allow-Methods
    response.setHeader("Access-Control-Allow-Methods",
      Array.isArray(finalOptions.methods) ? finalOptions.methods.join(",") : finalOptions.methods);

    // Set Access-Control-Allow-Headers
    response.setHeader("Access-Control-Allow-Headers",
      Array.isArray(finalOptions.headers) ? finalOptions.headers.join(",") : finalOptions.headers);

    // Set credentials header if enabled
    if (finalOptions.credentials) {
      response.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // Set max age for preflight requests
    if (finalOptions.maxAge) {
      response.setHeader("Access-Control-Max-Age", finalOptions.maxAge.toString());
    }

    // Set exposed headers
    if (finalOptions.exposedHeaders && finalOptions.exposedHeaders.length > 0) {
      response.setHeader("Access-Control-Expose-Headers",
        Array.isArray(finalOptions.exposedHeaders)
          ? finalOptions.exposedHeaders.join(",")
          : finalOptions.exposedHeaders);
    }

    return response;
  }

  /**
   * Handle preflight OPTIONS request
   */
  public handlePreflight(
    request: CustomRequest,
    options: Partial<CorsOptions> = {}
  ): CustomResponse | null {
    // Only handle OPTIONS requests
    if (request.method !== "OPTIONS") {
      return null;
    }

    // Merge options with defaults
    const finalOptions: CorsOptions = { ...this.defaultOptions, ...options };

    // Create empty response with success status
    const response = CustomResponse.empty(finalOptions.preflightSuccessStatus);

    // Get request origin
    const requestOrigin = request.headers.get("origin");

    // Apply CORS headers
    this.applyCors(response, requestOrigin || null, finalOptions);

    // Return the response
    return response;
  }
}

// Create and export a singleton instance
export const corsManager = new CorsManager();

// Export convenience function
export const applyCors = (
  response: CustomResponse,
  options: Partial<CorsOptions> = {}
): CustomResponse => {
  const requestOrigin = null; // In a real scenario, this would come from the request
  return corsManager.applyCors(response, requestOrigin, options);
};

// Export convenience function for preflight
export const handleCorsPreflightRequest = (
  request: CustomRequest,
  options: Partial<CorsOptions> = {}
): CustomResponse | null => {
  return corsManager.handlePreflight(request, options);
};