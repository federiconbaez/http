// src/lib/api-framework/response.ts
/**
 * Enhanced HTTP response class with additional functionality
 */
export class CustomResponse<T = any> {
  /**
   * Response status code
   */
  private statusCode: number;

  /**
   * Response headers
   */
  private headers: Map<string, string>;

  /**
   * Response body
   */
  private body: T | null;

  /**
   * Response cookies
   */
  private cookies: Map<string, { value: string; options: CookieOptions }>;

  /**
   * Create a new CustomResponse
   */
  constructor(body: T | null = null, options: ResponseOptions = {}) {
    this.statusCode = options.status || 200;
    this.headers = new Map();
    this.body = body;
    this.cookies = new Map();

    // Set default headers
    this.setHeader('Content-Type', options.contentType || 'application/json');

    // Add custom headers
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        this.setHeader(key, value);
      }
    }
  }

  /**
   * Get the response body
   */
  public getStatus(): number {
    return this.statusCode;
  }

  /**
   * Set a response header
   */
  public setHeader(name: string, value: string): CustomResponse<T> {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  /**
   * Get a response header
   */
  public getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }

  /**
   * Get all response headers
   */
  public next(): CustomResponse<T> {
    this.setStatus(200);
    return this;
  }

  /**
   * Get all response headers
   */
  public getHeaders(): Map<string, string> {
    return new Map(this.headers);
  }

  /**
   * Set multiple headers at once
   */
  public setHeaders(headers: Record<string, string>): CustomResponse<T> {
    for (const [key, value] of Object.entries(headers)) {
      this.setHeader(key, value);
    }
    return this;
  }

  /**
   * Set the response status code
   */
  public setStatus(code: number): CustomResponse<T> {
    this.statusCode = code;
    return this;
  }

  /**
   * Set the response body
   */
  public setBody(body: T): CustomResponse<T> {
    this.body = body;
    return this;
  }

  /**
   * Set a cookie
   */
  public setCookie(
    name: string,
    value: string,
    options: CookieOptions = {}
  ): CustomResponse<T> {
    this.cookies.set(name, { value, options });
    return this;
  }

  /**
   * Clear a cookie
   */
  public clearCookie(name: string, options: CookieOptions = {}): CustomResponse<T> {
    return this.setCookie(name, '', {
      ...options,
      expires: new Date(0)
    });
  }

  /**
   * Redirect to another URL
   */
  public redirect(url: string, statusCode: number = 302): CustomResponse<T> {
    this.setHeader('Location', url);
    this.setStatus(statusCode);
    return this;
  }

  /**
   * Send a JSON response
   */
  public json<U = any>(body: U): CustomResponse<U> {
    return new CustomResponse<U>(body, {
      status: this.statusCode,
      contentType: 'application/json',
      headers: Object.fromEntries(this.headers.entries())
    });
  }

  /**
   * Send a text response
   */
  public text(body: string): CustomResponse<string> {
    return new CustomResponse<string>(body, {
      status: this.statusCode,
      contentType: 'text/plain',
      headers: Object.fromEntries(this.headers.entries())
    });
  }

  /**
   * Send an HTML response
   */
  public html(body: string): CustomResponse<string> {
    return new CustomResponse<string>(body, {
      status: this.statusCode,
      contentType: 'text/html',
      headers: Object.fromEntries(this.headers.entries())
    });
  }

  /**
   * Send a response with no content
   */
  public noContent(): CustomResponse<null> {
    return new CustomResponse<null>(null, {
      status: 204,
      headers: Object.fromEntries(this.headers.entries())
    });
  }

  /**
   * Convert to a standard Response object
   */
  public toResponse(): Response {
    // Format cookies
    const cookieHeaders: string[] = [];
    for (const [name, { value, options }] of this.cookies.entries()) {
      cookieHeaders.push(this.serializeCookie(name, value, options));
    }

    // Set cookies in headers
    if (cookieHeaders.length > 0) {
      for (const cookie of cookieHeaders) {
        this.headers.set('set-cookie', cookie);
      }
    }

    // Prepare headers for Response
    const headers = new Headers();
    for (const [key, value] of this.headers.entries()) {
      headers.set(key, value);
    }

    // Handle null body for 204 responses
    if (this.statusCode === 204) {
      return new Response(null, {
        status: this.statusCode,
        headers
      });
    }

    // Serialize body based on content type
    let body: string | null = null;
    const contentType = this.headers.get('content-type');

    if (this.body !== null && this.body !== undefined) {
      if (contentType && contentType.includes('application/json')) {
        body = JSON.stringify(this.body);
      } else if (typeof this.body === 'string') {
        body = this.body;
      } else {
        // Default to JSON for objects
        body = JSON.stringify(this.body);
      }
    }

    return new Response(body, {
      status: this.statusCode,
      headers
    });
  }

  /**
   * Convert cookie to a Set-Cookie header value
   */
  private serializeCookie(
    name: string,
    value: string,
    options: CookieOptions = {}
  ): string {
    const encodedValue = encodeURIComponent(value);
    let cookie = `${name}=${encodedValue}`;

    if (options.maxAge !== undefined) {
      cookie += `; Max-Age=${options.maxAge}`;
    }

    if (options.expires) {
      cookie += `; Expires=${options.expires.toUTCString()}`;
    }

    if (options.path) {
      cookie += `; Path=${options.path}`;
    } else {
      cookie += '; Path=/';
    }

    if (options.domain) {
      cookie += `; Domain=${options.domain}`;
    }

    if (options.secure) {
      cookie += '; Secure';
    }

    if (options.httpOnly) {
      cookie += '; HttpOnly';
    }

    if (options.sameSite) {
      cookie += `; SameSite=${options.sameSite}`;
    }

    return cookie;
  }

  /**
   * Create a JSON response
   */
  public static json<T>(
    body: T,
    options: ResponseOptions = {}
  ): CustomResponse<T> {
    return new CustomResponse<T>(body, {
      ...options,
      contentType: 'application/json'
    });
  }

  /**
   * Create a text response
   */
  public static text(
    body: string,
    options: ResponseOptions = {}
  ): CustomResponse<string> {
    return new CustomResponse<string>(body, {
      ...options,
      contentType: 'text/plain'
    });
  }

  /**
   * Create an HTML response
   */
  public static html(
    body: string,
    options: ResponseOptions = {}
  ): CustomResponse<string> {
    return new CustomResponse<string>(body, {
      ...options,
      contentType: 'text/html'
    });
  }

  /**
   * Create an empty response
   */
  public static empty(
    statusCode: number = 204
  ): CustomResponse<null> {
    return new CustomResponse<null>(null, {
      status: statusCode
    });
  }

  /**
   * Create a redirect response
   */
  public static redirect(
    url: string,
    statusCode: number = 302
  ): CustomResponse<null> {
    return new CustomResponse<null>(null, {
      status: statusCode,
      headers: { Location: url }
    });
  }
}

/**
 * API Error class for handling errors
 */
export class ApiError extends Error {
  /**
   * HTTP status code for the error
   */
  statusCode: number;

  /**
   * Optional warning messages
   */
  warnings?: string[];

  /**
   * Optional metadata for the error
   */
  metadata?: Record<string, any>;

  /**
   * Error code for API clients
   */
  code?: string;

  /**
   * Create a new ApiError
   */
  constructor(
    message: string,
    statusCode = 500,
    code?: string,
    warnings?: string[],
    metadata?: Record<string, any>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.warnings = warnings;
    this.metadata = metadata;

    // Set name for better error identification
    this.name = 'ApiError';

    // Capture stack trace
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Create a successful API response
 */
export const respond = <T>(
  data: T,
  statusCode = 200,
  warnings?: string[],
  metadata?: Record<string, any>
): CustomResponse => {
  return CustomResponse.json(
    {
      success: true,
      data,
      ...(warnings && warnings.length > 0 ? { warnings } : {}),
      ...(metadata ? { metadata } : {}),
    },
    { status: statusCode }
  );
};

/**
 * Create an error API response
 */
export const respondError = (
  error: string | Error | ApiError,
  statusCode = 500,
  warnings?: string[],
  metadata?: Record<string, any>
): CustomResponse => {
  const message = error instanceof Error ? error.message : error;
  const code =
    error instanceof ApiError ? error.statusCode : statusCode;
  const errorCode =
    error instanceof ApiError && error.code ? error.code : undefined;
  const errorWarnings =
    error instanceof ApiError && error.warnings
      ? error.warnings
      : warnings || [];
  const errorMetadata =
    error instanceof ApiError && error.metadata
      ? error.metadata
      : metadata || {};

  return CustomResponse.json(
    {
      success: false,
      error: message,
      ...(errorCode ? { code: errorCode } : {}),
      ...(errorWarnings.length > 0 ? { warnings: errorWarnings } : {}),
      ...(Object.keys(errorMetadata).length > 0 ? { metadata: errorMetadata } : {}),
    },
    { status: code }
  );
};

/**
 * Response options interface
 */
interface ResponseOptions {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
}

/**
 * Cookie options interface
 */
interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}