// src/lib/api-framework/types.ts
import { CustomResponse } from "../server/response";
import { CustomRequest } from "./request";

// Tipos básicos
export type ApiError = {
  message: string;
  statusCode: number;
  details?: any;
  stack?: string;
};

export type ApiResponseWithHeaders<T = any> = ApiResponse<T> & {
  headers: Record<string, string>;
  statusCode: number;
  status: number;
  setHeader: (name: string, value: string) => void;
  send: (body: ApiResponse<T>) => void;
  json: (body: ApiResponse<T>) => void;
  end: () => void;
  redirect: (url: string, statusCode?: number) => void;
  setStatus: (statusCode: number) => void;
  setCookie: (name: string, value: string, options?: Record<string, any>) => void;
  clearCookie: (name: string) => void;
  getCookie: (name: string) => string | undefined;
  getHeader: (name: string) => string | undefined;
  getQuery: (name: string) => string | undefined;
  getParam: (name: string) => string | undefined;
}

export type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
  metadata?: Record<string, any>;
};

export type ApiHandler<T = any> = (
  request: CustomRequest,
  context: ApiContext
) => Promise<ApiResponse<T>>;

export type ApiResponse<T = any> = CustomResponse<T> & {
  statusCode: number;
  body: ApiResult<T>;
  headers: Record<string, string>;
  status: number;
  params: Record<string, string>;
  param: (name: string) => string | undefined;
  setParams: (params: Record<string, string>) => void;
  setHeader: (name: string, value: string) => void;
  send: (body: ApiResult<T>) => void;
  json: (body: ApiResult<T>) => void;
  end: () => void;
  redirect: (url: string, statusCode?: number) => void;
  setStatus: (statusCode: number) => void;
  setCookie: (name: string, value: string, options?: Record<string, any>) => void;
  clearCookie: (name: string) => void;
  getCookie: (name: string) => string | undefined;
  getHeader: (name: string) => string | undefined;
  getQuery: (name: string) => string | undefined;
  getParam: (name: string) => string | undefined;
  getBody: () => Promise<any>;
  getFiles: () => Promise<Record<string, any>>;
  getIp: () => string;
}

export type ApiContext = {
  params: Record<string, string>;
  headers: Record<string, string>;
  query: Record<string, string>;
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
};

export type ApiUser = {
  id: string;
  roles: string[];
};

export type ValidationSchema<T> = {
  validate: (data: any) => { value: T; error?: any };
};

export type CacheOptions = {
  enabled: boolean;
  ttl: number; // tiempo en segundos
  key?: string | ((req: CustomRequest) => string);
};

export type RateLimitOptions = {
  enabled: boolean;
  limit: number; // peticiones por ventana
  window: number; // ventana en segundos
  keyFn?: (req: CustomRequest) => string; // función para extraer la clave de rate limiting (default: IP)
};

export type ApiConfig<T = any> = {
  handler: ApiHandler<T>;
  auth?: {
    required: boolean;
    roles?: string[];
  };
  validation?: {
    query?: ValidationSchema<any>;
    body?: ValidationSchema<any>;
    params?: ValidationSchema<any>;
  };
  cache?: Promise<CacheOptions> | CacheOptions;
  rateLimit?: RateLimitOptions;
  cors?: {
    enabled: boolean;
    origin?: string | string[];
    methods?: string[];
    credentials?: boolean;
  };
  timeout?: number; // milisegundos
  metrics?: boolean;
};
