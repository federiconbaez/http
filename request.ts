// src/lib/http/request.ts
export class CustomRequest {
  public readonly url: string;
  public readonly method: string;
  public readonly headers: Headers;
  public readonly nextUrl: URL;
  public readonly ip?: string;
  private readonly _rawRequest: Request;
  private _cachedBody: any = null;
  private _bodyUsed: boolean = false;

  constructor(request: Request, ip?: string) {
    this._rawRequest = request;
    this.url = request.url;
    this.method = request.method;
    this.headers = new Headers(request.headers);
    this.nextUrl = new URL(request.url);
    this.ip = ip;
  }

  /**
   * Obtiene un parámetro específico de la URL
   */
  public param(name: string): string | null {
    return this.nextUrl.searchParams.get(name);
  }

  public entries(): [string, string][] {
    return Array.from(this.nextUrl.searchParams.entries());
  }

  /**
   * Acceso a los parámetros de la URL
   */
  get searchParams(): URLSearchParams {
    return this.nextUrl.searchParams;
  }

  /**
   * Verifica si el cuerpo ya ha sido utilizado
   */
  get bodyUsed(): boolean {
    return this._bodyUsed || this._rawRequest.bodyUsed;
  }

  /**
   * Clona la petición
   */
  public clone(): CustomRequest {
    return new CustomRequest(this._rawRequest.clone(), this.ip);
  }

  /**
   * Obtiene el cuerpo como texto
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
   * Obtiene el cuerpo como JSON
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
   * Obtiene el cuerpo como FormData
   */
  public async formData(): Promise<FormData> {
    if (this._bodyUsed) {
      throw new Error('Body already read');
    }

    this._bodyUsed = true;
    return await this._rawRequest.formData();
  }

  /**
   * Obtiene el cuerpo como ArrayBuffer
   */
  public async arrayBuffer(): Promise<ArrayBuffer> {
    if (this._bodyUsed) {
      throw new Error('Body already read');
    }

    this._bodyUsed = true;
    return await this._rawRequest.arrayBuffer();
  }

  /**
   * Obtiene el cuerpo como Blob
   */
  public async blob(): Promise<Blob> {
    if (this._bodyUsed) {
      throw new Error('Body already read');
    }

    this._bodyUsed = true;
    return await this._rawRequest.blob();
  }

  /**
   * Comprueba si la solicitud acepta un tipo MIME específico
   */
  public accepts(mimeType: string): boolean {
    const acceptHeader = this.headers.get('accept') || '';
    return acceptHeader.includes(mimeType) || acceptHeader.includes('*/*');
  }

  /**
   * Comprueba si la solicitud es AJAX
   */
  public get isAjax(): boolean {
    return this.headers.get('x-requested-with') === 'XMLHttpRequest';
  }

  /**
   * Obtiene el idioma preferido del navegador
   */
  public get preferredLanguage(): string | null {
    return this.headers.get('accept-language')?.split(',')[0] || null;
  }

  /**
   * Comprueba si la solicitud es segura (HTTPS)
   */
  public get isSecure(): boolean {
    return this.nextUrl.protocol === 'https:';
  }

  /**
   * Obtiene la referencia de la solicitud
   */
  public get referer(): string | null {
    return this.headers.get('referer');
  }

  /**
   * Obtiene el user agent
   */
  public get userAgent(): string | null {
    return this.headers.get('user-agent');
  }

  /**
   * Crea una instancia de CustomRequest a partir de una solicitud estándar
   */
  public static fromRequest(request: Request, ip?: string): CustomRequest {
    return new CustomRequest(request, ip);
  }

  /**
   * Convierte los datos a un objeto CustomRequest
   */
  public static fromFetchEvent(event: any): CustomRequest {
    const request = event.request;
    const ip = event.clientAddress ||
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('cf-connecting-ip') ||
      '0.0.0.0';

    return new CustomRequest(request, ip);
  }
}

