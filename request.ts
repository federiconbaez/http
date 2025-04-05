// src/lib/http/request.ts
import { ApiUser, RateLimitInfo } from "./types";

/**
 * Enhanced HTTP request class that extends the native Request object
 * with additional functionality
 */
export class CustomRequest {
  /**
   * Original URL of the request
   */
  public readonly url: string;

  /**
   * HTTP method
   */
  public readonly method: string;

  /**
   * Request headers
   */
  public readonly headers: Headers;

  /**
   * Parsed URL object
   */
  public readonly nextUrl: URL;

  /**
   * Client IP address
   */
  public readonly ip?: string;

  /**
   * Unique request ID
   */
  public requestId: string;

  /**
   * Authenticated user (if available)
   */
  public user?: ApiUser;

  /**
   * Rate limit information (set during rate limit checks)
   */
  public rateLimitInfo?: RateLimitInfo;

  /**
   * Raw request object
   */
  private readonly _rawRequest: Request;

  /**
   * Cached body content
   */
  private _cachedBody: any = null;

  /**
   * Flag indicating if body has been read
   */
  private _bodyUsed: boolean = false;

  /**
   * Storage for request cookies
   */
  private _cookies: Map<string, string> | null = null;

  /**
   * Create a new CustomRequest
   */
  constructor(request: Request, ip?: string, requestId?: string) {
    this._rawRequest = request;
    this.url = request.url;
    this.method = request.method;
    this.headers = new Headers(request.headers);
    this.nextUrl = new URL(request.url);
    this.ip = ip;
    this.requestId = requestId || crypto.randomUUID();
  }

  /**
   * Get a specific parameter from the URL
   */
  public param(name: string): string | null {
    return this.nextUrl.searchParams.get(name);
  }

  /**
   * Get all search parameters as entries
   */
  public entries(): [string, string][] {
    return Array.from(this.nextUrl.searchParams.entries());
  }

  /**
   * Access to the URL search parameters
   */
  get searchParams(): URLSearchParams {
    return this.nextUrl.searchParams;
  }

  /**
   * Check if the request body has been read
   */
  get bodyUsed(): boolean {
    return this._bodyUsed || this._rawRequest.bodyUsed;
  }

  /**
   * Get the raw request object
   */
  get raw(): Request {
    return this._rawRequest;
  }

  /**
   * Create a clone of the request
   */
  public clone(): CustomRequest {
    return new CustomRequest(this._rawRequest.clone(), this.ip, this.requestId);
  }

  /**
   * Get the request body as text
   */
  public async text(): Promise<string> {
    if (this._bodyUsed) {
      throw new Error('Body already read');
    }

    if (typeof this._cachedBody === 'string') {
      return this._cachedBody;
    }

    this._bodyUsed = true;
    this._cachedBody = await this._rawRequest.text();
    return this._cachedBody;
  }

  /**
   * Get the request body as JSON
   */
  public async json<T = any>(): Promise<T> {
    if (this._bodyUsed && typeof this._cachedBody !== 'string') {
      throw new Error('Body already read');
    }

    if (this._cachedBody && typeof this._cachedBody !== 'string') {
      return this._cachedBody as T;
    }

    const text = await this.text();
    try {
      this._cachedBody = JSON.parse(text);
      return this._cachedBody as T;
    } catch (e) {
      throw new Error('Invalid JSON');
    }
  }

  /**
   * Get the request body as FormData
   */
  public async formData(): Promise<FormData> {
    if (this._bodyUsed) {
      throw new Error('Body already read');
    }

    this._bodyUsed = true;
    return await this._rawRequest.formData();
  }

  /**
   * Get the request body as ArrayBuffer
   */
  public async arrayBuffer(): Promise<ArrayBuffer> {
    if (this._bodyUsed) {
      throw new Error('Body already read');
    }

    this._bodyUsed = true;
    return await this._rawRequest.arrayBuffer();
  }

  /**
   * Get the request body as Blob
   */
  public async blob(): Promise<Blob> {
    if (this._bodyUsed) {
      throw new Error('Body already read');
    }

    this._bodyUsed = true;
    return await this._rawRequest.blob();
  }

  /**
   * Check if the request accepts a specific MIME type
   */
  public accepts(mimeType: string): boolean {
    const acceptHeader = this.headers.get('accept') || '';
    return acceptHeader.includes(mimeType) || acceptHeader.includes('*/*');
  }

  /**
   * Check if the request is an AJAX request
   */
  public get isAjax(): boolean {
    return this.headers.get('x-requested-with') === 'XMLHttpRequest';
  }

  /**
   * Get the preferred language from the request
   */
  public get preferredLanguage(): string | null {
    return this.headers.get('accept-language')?.split(',')[0] || null;
  }

  /**
   * Check if the request is secure (HTTPS)
   */
  public get isSecure(): boolean {
    return this.nextUrl.protocol === 'https:';
  }

  /**
   * Get the referrer of the request
   */
  public get referer(): string | null {
    return this.headers.get('referer');
  }

  /**
   * Get the user agent of the request
   */
  public get userAgent(): string | null {
    return this.headers.get('user-agent');
  }

  /**
   * Get the content type of the request
   */
  public get contentType(): string | null {
    return this.headers.get('content-type');
  }

  /**
   * Get the content length of the request
   */
  public get contentLength(): number | null {
    const length = this.headers.get('content-length');
    return length ? parseInt(length, 10) : null;
  }

  /**
   * Get the host of the request
   */
  public get host(): string {
    return this.nextUrl.host;
  }

  /**
   * Get the hostname of the request
   */
  public get hostname(): string {
    return this.nextUrl.hostname;
  }

  /**
   * Get the port of the request
   */
  public get port(): string {
    return this.nextUrl.port;
  }

  /**
   * Get the path of the request
   */
  public get path(): string {
    return this.nextUrl.pathname;
  }

  /**
   * Get the query string of the request
   */
  public get queryString(): string {
    return this.nextUrl.search;
  }

  /**
   * Get the value of a cookie
   */
  public getCookie(name: string): string | undefined {
    if (!this._cookies) {
      this._parseCookies();
    }
    return this._cookies?.get(name);
  }

  /**
   * Get all cookies as an object
   */
  public getCookies(): Record<string, string> {
    if (!this._cookies) {
      this._parseCookies();
    }
    return Object.fromEntries(this._cookies || []);
  }

  /**
   * Parse cookies from the request
   */
  private _parseCookies(): void {
    const cookieHeader = this.headers.get('cookie') || '';
    this._cookies = new Map();

    if (cookieHeader) {
      const pairs = cookieHeader.split(';');

      for (const pair of pairs) {
        const [name, ...rest] = pair.trim().split('=');
        const value = rest.join('=');

        if (name && value !== undefined) {
          this._cookies.set(name, decodeURIComponent(value));
        }
      }
    }
  }

  /**
   * Create a CustomRequest from a standard Request
   */
  public static fromRequest(request: Request, ip?: string): CustomRequest {
    return new CustomRequest(request, ip);
  }

  /**
   * Create a CustomRequest from a fetch event
   */
  public static fromFetchEvent(event: any): CustomRequest {
    const request = event.request;
    const ip = event.clientAddress ||
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('cf-connecting-ip') ||
      '0.0.0.0';

    return new CustomRequest(request, ip);
  }

  /**
   * Create a CustomRequest from a Next.js API request
   */
  public static fromNextApiRequest(req: any): CustomRequest {
    // Create a standard Request object from the Next.js request
    const headers = new Headers();

    if (req.headers) {
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
        }
      }
    }

    // Construct URL from req
    const protocol = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const url = `${protocol}://${host}${req.url}`;

    // Create a Request object
    const request = new Request(url, {
      method: req.method || 'GET',
      headers,
      // Body handling would need to be more complex in a real implementation
    });

    // Get IP
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.connection?.remoteAddress ||
      '0.0.0.0';

    return new CustomRequest(request, ip);
  }
}