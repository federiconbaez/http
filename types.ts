// src/lib/api-framework/types.ts
import { CustomRequest } from "../http/request";
import { CustomResponse } from "./response";

// Log levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

// Logger adapter interface
export interface LoggerAdapter {
  log(level: LogLevel, message: string, data?: any): void;
  init?(options: LoggerOptions): void;
}

// Logger configuration
export interface LoggerOptions {
  enabled: boolean;
  logErrorStacks?: boolean;
  logHeaders?: boolean;
  adapter?: string;
  sensitiveHeaders?: string[];
  level: LogLevel;
  format?: 'json' | 'text';
  redactHeaders?: string[];
  redactQueryParams?: string[];
  redactBodyFields?: string[];
  destination?: 'console' | 'file' | ((message: string, level: LogLevel) => void);
  filePath?: string;
}

/**
 * API User interface representing an authenticated user
 */
export interface ApiUser {
  id: string;
  roles: string[];
  permissions?: string[];
  email?: string;
  name?: string;
  metadata?: Record<string, any>;
}

/**
 * API Context interface containing request information
 */
export interface ApiContext {
  params: Record<string, string>;
  headers: Record<string, string>;
  response: CustomResponse;
  request: CustomRequest;
  query: Record<string, any>;
  body: Record<string, any>;
  files?: Record<string, any>;
  method: string;
  url: string;
  originalUrl: string;
  ip?: string;
  startTime: number;
  authToken?: string;
  user?: ApiUser;
  requestId: string;
}

/**
 * API Handler function type
 */
export type ApiHandler<T = any> = (
  request: CustomRequest,
  context: ApiContext
) => Promise<CustomResponse<T> | T>;

/**
 * Catch-all handler for unmatched routes
 */
export type CatchAllHandler = (
  request: CustomRequest
) => CustomResponse | Promise<CustomResponse>;

/**
 * API Response type
 */
export type ApiResponse<T = any> = T;

/**
 * API Result interface for standard response format
 */
export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  warnings?: string[];
  metadata?: Record<string, any>;
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  tokenExpiration: string | number;
  refreshTokenExpiration: string | number;
  jwtSecret?: string;
  refreshSecret?: string;
  issuer: string;
  audience: string;
}

/**
 * Authentication options for requests
 */
export interface AuthOptions {
  required?: boolean;
  permission?: string;
  roles?: string[];
  permissions?: string[];
  optional?: boolean;
  provider?: string;
  requiredRoles?: string[];
  requiredPermissions?: string[];
  requireAllRoles?: boolean;
  requireAllPermissions?: boolean;
}

/**
 * Authentication provider interface
 */
export interface AuthProvider {
  verifyToken: (token: string, config: AuthConfig) => Promise<ApiUser>;
  generateToken: (user: Partial<ApiUser>, config: AuthConfig) => Promise<{
    token: string;
    refreshToken?: string;
    expiresAt: number;
  }>;
  refreshToken?: (refreshToken: string, config: AuthConfig) => Promise<{
    token: string;
    refreshToken?: string;
    expiresAt: number;
  }>;
}

/**
 * Cache entry interface
 */
export interface CacheEntry<T> {
  value: T;
  expires: number;
  createdAt: number;
  tags?: string[];
}

/**
 * Cache options interface
 */
export interface CacheOptions {
  enabled: boolean;
  ttl: number; // tiempo en segundos
  key: string | ((req: CustomRequest) => Promise<string>);
  adapter?: string;
  includeQuery?: boolean;
  includeHeaders?: boolean;
  headerNames?: string[];
  varyByUser?: boolean;
  tags?: string[];
}

/**
 * Cache adapter interface
 */
export interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, options?: { ttl?: number; tags?: string[] }): Promise<void>;
  delete(key: string): Promise<boolean>;
  invalidate(pattern: string): Promise<void>;
  invalidateByTag(tag: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Cache store adapter interface (more specific than CacheAdapter)
 */
export interface CacheStoreAdapter extends CacheAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getStats(): Promise<Record<string, any>>;
}

/**
 * CORS options interface
 */
export interface CorsOptions {
  origin: string | string[];
  methods: string | string[];
  headers: string | string[];
  enabled: boolean;
  credentials: boolean;
  maxAge?: number;
  exposedHeaders?: string | string[];
  preflightSuccessStatus?: number;
}

/**
 * Rate limit options interface
 */
export interface RateLimitOptions {
  enabled: boolean;
  limit: number; // peticiones por ventana
  window: number; // ventana en segundos
  adapter?: string;
  keyFn?: string | ((req: CustomRequest) => string);
  keyGenerator?: (req: CustomRequest) => string;
  name?: string;
  varyByUser?: boolean;
  varyByRoute?: boolean;
  varyByMethod?: boolean;
  message?: string;
  statusCode?: number;
}

/**
 * Rate limit result interface
 */
export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  limit: number;
  reset: number;
  retryAfter: number;
}

/**
 * Rate limit information stored in the request
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  key: string;
}

/**
 * Rate limit adapter interface
 */
export interface RateLimitAdapter {
  increment(key: string, options: RateLimitOptions): Promise<RateLimitResult>;
  get(key: string, options: RateLimitOptions): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

/**
 * Validation schema interface
 */
export interface ValidationSchema<T> {
  validate: (data: any) => { value: T; error?: any };
}

/**
 * Health check options interface
 */
export interface HealthCheckOptions {
  enabled: boolean;
  endpoint?: string;
  checks?: Array<{
    name: string;
    check: () => Promise<boolean>;
    critical?: boolean;
  }>;
  timeout?: number;
}

/**
 * Metrics options interface
 */
export interface MetricsOptions {
  enabled: boolean;
  endpoint?: string;
  headers?: string[];
  tags?: string[];
  includeHeaders?: boolean;
  includeResponseTime?: boolean;
  includePath?: boolean;
  includeMethod?: boolean;
  includeStatusCode?: boolean;
  customDimensions?: (req: CustomRequest, res: CustomResponse) => Record<string, any>;
}

/**
 * Logging options interface
 */
export interface LoggingOptions {
  enabled: boolean;
  level?: 'debug' | 'info' | 'warn' | 'error';
  format?: 'json' | 'text';
  transports?: Array<{
    type: 'console' | 'file' | 'custom';
    options?: Record<string, any>;
  }>;
  redactedFields?: string[];
  includeBody?: boolean;
  includeHeaders?: boolean;
  includeQueryParams?: boolean;
}

/**
 * API Configuration interface
 */
export interface ApiConfig<T = any> {
  handler: ApiHandler<T>;
  adapter?: string;
  auth?: AuthOptions;
  permissions?: {
    requiredRoles?: string[];
    requiredPermissions?: string[];
    requireAllRoles?: boolean;
    requireAllPermissions?: boolean;
  };
  authProvider?: AuthProvider;
  validation?: {
    query?: ValidationSchema<any>;
    body?: ValidationSchema<any>;
    params?: ValidationSchema<any>;
  };
  cache?: CacheOptions;
  rateLimit?: RateLimitOptions;
  cors?: CorsOptions;
  timeout?: number; // milisegundos
  metrics?: MetricsOptions;
  logging?: LoggingOptions;
  health?: HealthCheckOptions;
}

/**
 * Middleware function type
 */
export type MiddlewareFunction = (
  request: CustomRequest,
  context: ApiContext,
  next: () => Promise<CustomResponse>
) => Promise<CustomResponse>;