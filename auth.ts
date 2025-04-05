// src/lib/api-framework/auth.ts
import { CustomRequest } from "@/lib/http";
import jwt from "jsonwebtoken";
import { ApiError } from "./response";
import { ApiUser } from "./types";

export const extractAuthToken = (req: CustomRequest): string | undefined => {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return undefined;
  }
  return authHeader.slice(7);
};

export const validateAuth = async (
  req: CustomRequest,
  requiredRoles?: string[]
): Promise<ApiUser | undefined> => {
  const token = extractAuthToken(req);
  if (!token) {
    return undefined;
  }

  try {
    // Implementar con tu sistema de autenticación
    const user = await verifyToken(token);

    // Verificar roles si es necesario
    if (
      requiredRoles &&
      requiredRoles.length > 0 &&
      !requiredRoles.some((role) => user.roles.includes(role))
    ) {
      throw new ApiError("Insufficient permissions", 403);
    }

    return user;
  } catch (error) {
    throw new ApiError("Authentication failed", 401);
  }
};
// Token verification using JWT

// Secret should be in environment variables in production
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function verifyToken(token: string): Promise<ApiUser> {
  try {
    // Verify and decode the token
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    // Check if token is expired
    if (!decoded || typeof decoded !== 'object' || !decoded.exp || decoded.exp < Date.now() / 1000) {
      throw new ApiError('Token expired', 401);
    }

    // Ensure the token has required user information
    if (!decoded.id || !decoded.roles || !Array.isArray(decoded.roles)) {
      throw new ApiError('Invalid token format', 401);
    }

    return {
      id: decoded.id,
      roles: decoded.roles,
      // Add any additional user information from the token
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Invalid authentication token', 401);
  }
}