import { v4 as uuidv4 } from "uuid"
import { CustomResponse } from "."
import { extractAuthToken, validateAuth } from "./auth"
import { withCache } from "./cache"
import { applyCors } from "./cors"
import { checkRateLimit } from "./rate-limit"
import { CustomRequest } from "./request"
import { ApiError, respondError } from "./response"
import { ApiConfig, ApiContext, ApiHandler, ApiResponse } from "./types"
import { validateRequest } from "./validation"

export const createEndpoint = <T>(config: ApiConfig<T>) => {
  return async (
    request: Request | CustomRequest,
    routeParams: Record<string, string> = {}
  ): Promise<ApiHandler<CustomResponse<any>['toResponse']>> => {
    const req = request instanceof CustomRequest
      ? request
      : CustomRequest.fromRequest(request);

    const startTime = Date.now();
    const requestId = uuidv4();

    // Handle OPTIONS for CORS
    if (config.cors?.enabled && req.method === "OPTIONS") {
      const response = CustomResponse.empty(204);
      return applyCors(response, config.cors).toResponse();
    }

    try {
      // Rate limiting
      if (config.rateLimit?.enabled) {
        checkRateLimit(req, config.rateLimit);
      }

      // Authentication
      let user = undefined;
      if (config.auth?.required) {
        user = await validateAuth(req, config.auth.roles);
        if (!user) {
          throw new ApiError("Authentication required", 401);
        }
      }

      // Validation
      let validatedQuery = {}, validatedBody = {}, validatedParams = {};

      if (config.validation) {
        if (config.validation.query) {
          validatedQuery = validateRequest(
            Object.fromEntries(req.searchParams.entries()),
            config.validation.query
          );
        }

        if (config.validation.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
          const body = await req.json().catch(() => ({}));
          validatedBody = validateRequest(body, config.validation.body);
        }

        if (config.validation.params) {
          validatedParams = validateRequest(routeParams, config.validation.params);
        }
      }

      // Configure context
      const context: ApiContext = {
        params: {
          ...routeParams,
          ...(validatedParams || {}),
        },
        query: validatedQuery || {},
        method: req.method,
        url: req.url,
        originalUrl: req.url,
        ip: req.ip,
        files: {},
        body: validatedBody || {},
        headers: Object.fromEntries(req.headers.entries()),
        startTime,
        authToken: user ? extractAuthToken(req) : undefined,
        user,
        requestId,
      };

      // Request timeout
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        if (config.timeout) {
          timeoutId = setTimeout(() => {
            reject(new ApiError("Request timeout", 408));
          }, config.timeout);
        }
      });

      // Execute handler with cache if enabled
      const handlerWithCache = async () => {
        const result = await Promise.race([
          config.handler(req, context),
          timeoutPromise
        ]);

        // Ensure the result is a CustomResponse
        return result instanceof CustomResponse
          ? result
          : new CustomResponse(result);
      };

      let response: CustomResponse<ApiResponse<T>>;
      const cacheOptions = config.cache ? await Promise.resolve(config.cache) : null;
      if (cacheOptions && typeof cacheOptions === 'object' && cacheOptions.enabled) {
        response = await withCache(req, cacheOptions, handlerWithCache);
      } else {
        response = await handlerWithCache();
      }

      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Apply CORS if enabled
      if (config.cors?.enabled) {
        response = applyCors(response, config.cors);
      }

      // Add metric headers if enabled
      if (config.metrics) {
        response.setHeader("X-Response-Time", `${Date.now() - startTime}ms`);
        response.setHeader("X-Request-ID", requestId);
      }

      return response.toResponse();
    } catch (error: any) {
      console.error(`[API] [${requestId}] Error:`, error);

      let response = respondError(
        error instanceof Error ? error : String(error),
        error instanceof ApiError ? error.statusCode : 500
      );

      // Apply CORS in case of error
      if (config.cors?.enabled) {
        response = applyCors(response, config.cors);
      }

      // Add metric headers in case of error
      if (config.metrics) {
        response.setHeader("X-Response-Time", `${Date.now() - startTime}ms`);
        response.setHeader("X-Request-ID", requestId);
      }

      return response.toResponse();
    }
  };
};

