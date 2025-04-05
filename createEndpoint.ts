// src/lib/api-framework/createEndpoint.ts
import { v4 as uuidv4 } from "uuid";
import { authManager } from "./auth";
import { cacheManager } from "./cache";
import { corsManager } from "./cors";
import { performHealthCheck } from "./health";
import { logError, logRequest, logResponse } from "./logger";
import { collectMetrics, metricsManager } from "./metrics";
import { rateLimitManager } from "./rate-limit";
import { CustomRequest } from "./request";
import { ApiError, CustomResponse, respond, respondError } from "./response";
import { ApiConfig, ApiContext, ApiHandler, ApiUser, CatchAllHandler } from "./types";
import { validateSchema } from "./validation";

/**
 * Creates an API endpoint handler with all the framework features
 * @param config The API configuration
 * @returns An async handler function for the endpoint
 */
export const createEndpoint = <T>(config: ApiConfig<T>) => {
  // Initialize middleware pipeline
  const middlewarePipeline = buildMiddlewarePipeline(config);

  // Return the endpoint handler
  return async (
    request: Request | CustomRequest,
    routeParams: Record<string, string> = {}
  ): Promise<Response> => {
    // Convert request to CustomRequest if needed
    const req = request instanceof CustomRequest
      ? request
      : CustomRequest.fromRequest(request);

    const startTime = Date.now();
    const requestId = uuidv4();

    // Add request ID to the request object
    req.requestId = requestId;

    // Log the incoming request if logging is enabled
    if (config.logging?.enabled) {
      logRequest(req, config.logging as any);
    }

    try {
      // Handle preflight CORS request
      if (config.cors?.enabled && req.method === "OPTIONS") {
        const corsResponse = corsManager.handlePreflight(req, config.cors);
        if (corsResponse) {
          // Log the CORS preflight response
          if (config.logging?.enabled) {
            logResponse(corsResponse, startTime, req, config.logging as any);
          }
          return corsResponse.toResponse();
        }
      }

      // Execute the middleware pipeline
      const { response, context } = await middlewarePipeline(req, routeParams, startTime, requestId);

      // Apply CORS if enabled
      if (config.cors?.enabled) {
        const origin = req.headers.get("origin");
        corsManager.applyCors(response, origin || null, config.cors);
      }

      // Apply metrics if enabled
      if (config.metrics?.enabled) {
        metricsManager.applyMetricsHeaders(response, config.metrics, context);
      }

      // Log the response if logging is enabled
      if (config.logging?.enabled) {
        logResponse(response, startTime, req, config.logging as any);
      }

      return response.toResponse();
    } catch (error: any) {
      // Log the error if logging is enabled
      if (config.logging?.enabled) {
        logError(error, req, config.logging as any);
      }

      // Convert error to ApiError if it isn't one already
      const apiError = error instanceof ApiError
        ? error
        : new ApiError(
          error instanceof Error ? error.message : String(error),
          error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 500
        );

      // Create error response
      let response = respondError(apiError);

      // Apply CORS in case of error
      if (config.cors?.enabled) {
        const origin = req.headers.get("origin");
        corsManager.applyCors(response, origin || null, config.cors);
      }

      // Apply metrics in case of error
      if (config.metrics?.enabled) {
        response.setHeader("X-Response-Time", `${Date.now() - startTime}ms`);
        response.setHeader("X-Request-ID", requestId);
      }

      return response.toResponse();
    }
  };
};

/**
 * Builds the middleware pipeline based on the provided configuration
 */
function buildMiddlewarePipeline<T>(config: ApiConfig<T>) {
  return async (
    req: CustomRequest,
    routeParams: Record<string, string>,
    startTime: number,
    requestId: string
  ): Promise<{ response: CustomResponse; context: ApiContext }> => {
    // Check health if enabled and requested
    if (config.health?.enabled &&
      req.url.endsWith(config.health.endpoint || '/health') &&
      req.method === 'GET') {
      const healthResponse = await performHealthCheck(config.health);
      return {
        response: healthResponse,
        context: {
          response: healthResponse,
          request: req,
          params: routeParams,
          query: {},
          method: req.method,
          url: req.url,
          originalUrl: req.url,
          ip: req.ip || '',
          body: {},
          headers: Object.fromEntries(req.headers.entries()),
          startTime,
          requestId,
          files: {}
        }
      };
    }

    // Check rate limit if enabled
    if (config.rateLimit?.enabled) {
      await rateLimitManager.checkRateLimit(req, config.rateLimit);
    }

    // Handle authentication
    let user: ApiUser | undefined = undefined;
    if (config.auth) {
      if (config.auth.required) {
        user = await authManager.validateAuth(req, {
          requiredRoles: config.auth.roles,
          requiredPermissions: config.auth.permissions,
          requireAllRoles: config.auth.requireAllRoles,
          requireAllPermissions: config.auth.requireAllPermissions
        });

        if (!user) {
          throw new ApiError("Authentication required", 401);
        }
      } else if (config.auth.optional) {
        // Try to authenticate but don't require it
        try {
          user = await authManager.validateAuth(req);
        } catch (error) {
          // Ignore authentication errors for optional auth
        }
      }
    }

    // Extract and validate request data
    let validatedQuery = {}, validatedBody = {}, validatedParams = {};

    if (config.validation) {
      // Validate URL parameters
      if (config.validation.params) {
        validatedParams = validateSchema(routeParams, config.validation.params);
      }

      // Validate query parameters
      if (config.validation.query) {
        validatedQuery = validateSchema(
          Object.fromEntries(req.searchParams.entries()),
          config.validation.query
        );
      }

      // Validate body for methods that typically include a body
      if (config.validation.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
        try {
          const body = await req.json().catch(() => ({}));
          validatedBody = validateSchema(body, config.validation.body);
        } catch (error) {
          if (error instanceof ApiError) {
            throw error;
          }
          throw new ApiError("Invalid request body", 400);
        }
      }
    }

    // Build the context object
    const context: ApiContext = {
      params: {
        ...routeParams,
        ...(validatedParams || {}),
      },
      query: validatedQuery || {},
      method: req.method,
      url: req.url,
      originalUrl: req.url,
      ip: req.ip || '',
      files: {},
      body: validatedBody || {},
      headers: Object.fromEntries(req.headers.entries()),
      startTime,
      authToken: user ? authManager.extractAuthToken(req) : undefined,
      user,
      requestId,
      request: req,
      response: new CustomResponse(),
    };

    // Set up request timeout if configured
    let timeoutPromise: Promise<never> | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    if (config.timeout) {
      timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new ApiError("Request timeout", 408));
        }, config.timeout);
      });
    }

    try {
      // Define the handler with caching
      const handlerWithCache = async (): Promise<CustomResponse> => {
        // Collect request metrics if enabled
        if (config.metrics?.enabled) {
          collectMetrics(req, config.metrics);
        }

        // Execute the main handler (with timeout if configured)
        const result = timeoutPromise
          ? await Promise.race([config.handler(req, context), timeoutPromise])
          : await config.handler(req, context);

        // Ensure result is a CustomResponse
        return result instanceof CustomResponse
          ? result
          : respond(result);
      };

      // Apply caching if enabled
      let response: CustomResponse;
      if (config.cache && config.cache.enabled && req.method === 'GET') {
        response = await cacheManager.withCache(req, config.cache, handlerWithCache);
      } else {
        response = await handlerWithCache();
      }

      return { response, context };
    } finally {
      // Clear timeout if it was set
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
}

/**
 * Creates a REST API router for handling multiple endpoints
 */
export const createRestRouter = (options: {
  basePath?: string;
  globalMiddleware?: ApiConfig<any>;
  notFoundHandler?: CatchAllHandler;
  errorHandler?: (error: any, req: CustomRequest) => CustomResponse;
}) => {
  const routes: Array<{
    method: string;
    path: string;
    pattern: RegExp;
    paramNames: string[];
    handler: (req: CustomRequest, params: Record<string, string>) => Promise<Response>;
  }> = [];

  const router = {
    /**
     * Add a route handler for GET requests
     */
    get: (path: string, handler: ApiHandler | ApiConfig<any>) =>
      addRoute('GET', path, handler),

    /**
     * Add a route handler for POST requests
     */
    post: (path: string, handler: ApiHandler | ApiConfig<any>) =>
      addRoute('POST', path, handler),

    /**
     * Add a route handler for PUT requests
     */
    put: (path: string, handler: ApiHandler | ApiConfig<any>) =>
      addRoute('PUT', path, handler),

    /**
     * Add a route handler for DELETE requests
     */
    delete: (path: string, handler: ApiHandler | ApiConfig<any>) =>
      addRoute('DELETE', path, handler),

    /**
     * Add a route handler for PATCH requests
     */
    patch: (path: string, handler: ApiHandler | ApiConfig<any>) =>
      addRoute('PATCH', path, handler),

    /**
     * Add a route handler for OPTIONS requests
     */
    options: (path: string, handler: ApiHandler | ApiConfig<any>) =>
      addRoute('OPTIONS', path, handler),

    /**
     * Add a route handler for HEAD requests
     */
    head: (path: string, handler: ApiHandler | ApiConfig<any>) =>
      addRoute('HEAD', path, handler),

    /**
     * Add a route handler for all HTTP methods
     */
    all: (path: string, handler: ApiHandler | ApiConfig<any>) => {
      ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].forEach(method => {
        addRoute(method, path, handler);
      });
      return router;
    },

    /**
     * Handle incoming requests
     */
    handle: async (request: Request | CustomRequest): Promise<Response> => {
      // Convert request to CustomRequest if needed
      const req = request instanceof CustomRequest
        ? request
        : CustomRequest.fromRequest(request);

      // Get URL and method
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // Find matching route
      for (const route of routes) {
        if (route.method !== method && route.method !== 'ALL') continue;

        const match = route.pattern.exec(path);
        if (!match) continue;

        // Extract parameters
        const params: Record<string, string> = {};
        for (let i = 1; i < match.length; i++) {
          const paramName = route.paramNames[i - 1];
          if (paramName) {
            params[paramName] = match[i] || '';
          }
        }

        // Execute the route handler
        try {
          return await route.handler(req, params);
        } catch (error) {
          // Use custom error handler if provided
          if (options.errorHandler) {
            return options.errorHandler(error, req).toResponse();
          }

          // Default error handling
          const apiError = error instanceof ApiError
            ? error
            : new ApiError(
              error instanceof Error ? error.message : String(error),
              error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 500
            );

          return respondError(apiError).toResponse();
        }
      }

      // No route found, use notFoundHandler if provided
      if (options.notFoundHandler) {
        const response = await options.notFoundHandler(req);
        return response.toResponse();
      }

      // Default 404 response
      return respondError(new ApiError("Not Found", 404)).toResponse();
    }
  };

  /**
   * Helper to add a route to the router
   */
  function addRoute(
    method: string,
    path: string,
    handler: ApiHandler | ApiConfig<any>
  ) {
    // Normalize path
    const basePath = options.basePath || '';
    const fullPath = `${basePath}${path}`.replace(/\/+/g, '/');

    // Parse route parameters
    const paramNames: string[] = [];
    const pattern = new RegExp(
      `^${fullPath
        .replace(/\/$/, '') // Remove trailing slash
        .replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
          paramNames.push(name);
          return '([^/]+)';
        })
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')}/?$`
    );

    // Create handler function
    const routeHandler = async (
      req: CustomRequest,
      params: Record<string, string>
    ): Promise<Response> => {
      // Create endpoint handler
      const endpoint = typeof handler === 'function'
        ? createEndpoint({
          ...options.globalMiddleware,
          handler
        })
        : createEndpoint({
          ...options.globalMiddleware,
          ...handler
        });

      // Execute the handler
      return endpoint(req, params);
    };

    // Add route to the routes array
    routes.push({
      method,
      path: fullPath,
      pattern,
      paramNames,
      handler: routeHandler
    });

    return router;
  }

  return router;
};