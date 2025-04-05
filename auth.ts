// src/lib/api-framework/auth.ts
import { CustomRequest } from "@/lib/http";
import jwt, { SignOptions } from "jsonwebtoken";
import { ApiError } from "./response";
import { ApiUser, AuthConfig, AuthOptions, AuthProvider } from "./types";

/**
 * Class responsible for authentication management
 */
export class AuthManager {
  private providers: Map<string, AuthProvider> = new Map();
  private defaultProvider: string | null = null;
  private config: AuthConfig = {
    tokenExpiration: '1d',
    refreshTokenExpiration: '7d',
    issuer: 'api-framework',
    audience: 'api-users'
  };

  constructor(config?: Partial<AuthConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Register JWT provider by default
    this.registerProvider('jwt', {
      verifyToken: this.verifyJwtToken.bind(this),
      generateToken: this.generateJwtToken.bind(this),
      refreshToken: this.refreshJwtToken.bind(this)
    });
    this.defaultProvider = 'jwt';
  }

  /**
   * Register a new authentication provider
   */
  public registerProvider(name: string, provider: AuthProvider): void {
    this.providers.set(name, provider);
    if (!this.defaultProvider) {
      this.defaultProvider = name;
    }
  }

  /**
   * Set the default authentication provider
   */
  public setDefaultProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Authentication provider '${name}' not registered`);
    }
    this.defaultProvider = name;
  }

  /**
   * Extract auth token from request
   */
  public extractAuthToken(req: CustomRequest): string | undefined {
    // Try Authorization header first
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }

    // Try cookies as fallback
    const token = req.getCookie?.("auth_token");
    if (token) {
      return token;
    }

    return undefined;
  }

  /**
   * Extract refresh token from request
   */
  public extractRefreshToken(req: CustomRequest): string | undefined {
    // Try Authorization header first
    const authHeader = req.headers.get("x-refresh-token");
    if (authHeader) {
      return authHeader;
    }

    // Try cookies as fallback
    const token = req.getCookie?.("refresh_token");
    if (token) {
      return token;
    }

    return undefined;
  }

  /**
   * Validate authentication and permissions
   */
  public async validateAuth(
    req: CustomRequest,
    options?: AuthOptions
  ): Promise<ApiUser | undefined> {
    const providerName = options?.provider || this.defaultProvider;
    if (!providerName) {
      throw new ApiError("No authentication provider configured", 500);
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new ApiError(`Authentication provider '${providerName}' not registered`, 500);
    }

    const token = this.extractAuthToken(req);
    if (!token) {
      return undefined;
    }

    try {
      // Verify token with the selected provider
      const user = await provider.verifyToken(token, this.config);

      // Verify roles if necessary
      if (
        options?.requiredRoles &&
        options.requiredRoles.length > 0 &&
        !this.hasRequiredRoles(user, options.requiredRoles, options.requireAllRoles)
      ) {
        throw new ApiError("Insufficient permissions", 403);
      }

      // Verify permissions if necessary
      if (
        options?.requiredPermissions &&
        options.requiredPermissions.length > 0 &&
        !this.hasRequiredPermissions(user, options.requiredPermissions, options.requireAllPermissions)
      ) {
        throw new ApiError("Insufficient permissions", 403);
      }

      return user;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError("Authentication failed", 401);
    }
  }

  /**
   * Generate a new authentication token
   */
  public async generateToken(
    user: Partial<ApiUser>,
    options?: { provider?: string }
  ): Promise<{ token: string; refreshToken?: string; expiresAt: number }> {
    const providerName = options?.provider || this.defaultProvider;
    if (!providerName) {
      throw new ApiError("No authentication provider configured", 500);
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new ApiError(`Authentication provider '${providerName}' not registered`, 500);
    }

    return provider.generateToken(user, this.config);
  }

  /**
   * Refresh an authentication token
   */
  public async refreshToken(
    refreshToken: string,
    options?: { provider?: string }
  ): Promise<{ token: string; refreshToken?: string; expiresAt: number }> {
    const providerName = options?.provider || this.defaultProvider;
    if (!providerName) {
      throw new ApiError("No authentication provider configured", 500);
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new ApiError(`Authentication provider '${providerName}' not registered`, 500);
    }

    if (!provider.refreshToken) {
      throw new ApiError("Token refresh not supported by this provider", 400);
    }

    return provider.refreshToken(refreshToken, this.config);
  }

  /**
   * Check if user has required roles
   */
  private hasRequiredRoles(
    user: ApiUser,
    requiredRoles: string[],
    requireAll: boolean = false
  ): boolean {
    if (!user.roles || !Array.isArray(user.roles)) {
      return false;
    }

    if (requireAll) {
      return requiredRoles.every(role => user.roles.includes(role));
    } else {
      return requiredRoles.some(role => user.roles.includes(role));
    }
  }

  /**
   * Check if user has required permissions
   */
  private hasRequiredPermissions(
    user: ApiUser,
    requiredPermissions: string[],
    requireAll: boolean = false
  ): boolean {
    if (!user.permissions || !Array.isArray(user.permissions)) {
      return false;
    }

    if (requireAll) {
      return requiredPermissions.every(permission => user.permissions?.includes(permission));
    } else {
      return requiredPermissions.some(permission => user.permissions?.includes(permission));
    }
  }

  // JWT implementation

  /**
   * Verify JWT token
   */
  private async verifyJwtToken(token: string, config: AuthConfig): Promise<ApiUser> {
    try {
      const JWT_SECRET = process.env.JWT_SECRET || config.jwtSecret || 'your-secret-key-change-in-production';

      // Verify and decode the token
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: config.issuer,
        audience: config.audience
      }) as jwt.JwtPayload;

      // Check if token is expired
      if (!decoded || typeof decoded !== 'object' || !decoded.exp || decoded.exp < Date.now() / 1000) {
        throw new ApiError('Token expired', 401);
      }

      // Ensure the token has required user information
      if (!decoded.sub) {
        throw new ApiError('Invalid token format', 401);
      }

      return {
        id: decoded.sub,
        roles: decoded.roles || [],
        permissions: decoded.permissions || [],
        email: decoded.email,
        name: decoded.name,
        metadata: decoded.metadata || {}
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new ApiError('Token expired', 401);
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError('Invalid token', 401);
      }

      throw new ApiError('Authentication failed', 401);
    }
  }

  /**
   * Generate JWT token
   */
  private async generateJwtToken(
    user: Partial<ApiUser>,
    config: AuthConfig
  ): Promise<{ token: string; refreshToken: string; expiresAt: number }> {
    const JWT_SECRET = process.env.JWT_SECRET || config.jwtSecret || 'your-secret-key-change-in-production';
    const REFRESH_SECRET = process.env.REFRESH_SECRET || config.refreshSecret || `${JWT_SECRET}-refresh`;

    if (!user.id) {
      throw new ApiError('User ID is required', 400);
    }

    // Calculate expiration
    const now = Math.floor(Date.now() / 1000);

    // Parse the token expiration duration
    let expiresIn = 86400; // Default to 1 day
    if (typeof config.tokenExpiration === 'string') {
      const match = config.tokenExpiration.match(/^(\d+)([smhdy])$/);
      if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        // Convert to seconds based on unit
        switch (unit) {
          case 's': expiresIn = value; break;
          case 'm': expiresIn = value * 60; break;
          case 'h': expiresIn = value * 3600; break;
          case 'd': expiresIn = value * 86400; break;
          case 'y': expiresIn = value * 86400 * 365; break;
        }
      }
    } else if (typeof config.tokenExpiration === 'number') {
      expiresIn = config.tokenExpiration;
    }

    const expiresAt = now + expiresIn;

    // Create payload
    const payload = {
      sub: user.id,
      roles: user.roles || [],
      permissions: user.permissions || [],
      email: user.email,
      name: user.name,
      metadata: user.metadata || {},
      iss: config.issuer,
      aud: config.audience,
      iat: now,
      exp: expiresAt
    };

    // Generate token
    const token = jwt.sign(payload, JWT_SECRET);

    // Generate refresh token
    const refreshTokenOptions: SignOptions = {
      expiresIn: Number(config.refreshTokenExpiration) || 360 * 24 * 7, // Default to 7 days
    };
    const refreshToken = jwt.sign(
      {
        sub: user.id,
        tokenId: Math.random().toString(36).substring(2, 12),
        iss: config.issuer,
        aud: config.audience,
        iat: now
      },
      REFRESH_SECRET,
      refreshTokenOptions
    );

    return { token, refreshToken, expiresAt };
  }

  /**
   * Refresh JWT token
   */
  private async refreshJwtToken(
    refreshToken: string,
    config: AuthConfig
  ): Promise<{ token: string; refreshToken: string; expiresAt: number }> {
    const JWT_SECRET = process.env.JWT_SECRET || config.jwtSecret || 'your-secret-key-change-in-production';
    const REFRESH_SECRET = process.env.REFRESH_SECRET || config.refreshSecret || `${JWT_SECRET}-refresh`;

    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, REFRESH_SECRET, {
        issuer: config.issuer,
        audience: config.audience
      }) as jwt.JwtPayload;

      if (!decoded.sub) {
        throw new ApiError('Invalid refresh token', 401);
      }

      // Fetch user from database (placeholder)
      // In a real implementation, you would fetch the user from your database
      // using the decoded.sub value
      const user: ApiUser = {
        id: decoded.sub,
        roles: [], // These should come from your database
        permissions: [] // These should come from your database
      };

      // Generate new tokens
      return this.generateJwtToken(user, config);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new ApiError('Refresh token expired', 401);
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError('Invalid refresh token', 401);
      }

      throw new ApiError('Token refresh failed', 401);
    }
  }
}

// Create and export a singleton instance
export const authManager = new AuthManager();

// Export convenience methods
export const extractAuthToken = (req: CustomRequest): string | undefined => {
  return authManager.extractAuthToken(req);
};

export const validateAuth = async (
  req: CustomRequest,
  requiredRoles?: string[]
): Promise<ApiUser | undefined> => {
  return authManager.validateAuth(req, { requiredRoles });
};