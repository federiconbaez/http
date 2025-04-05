// src/lib/api-framework/cors.ts
import { CustomResponse } from "@/lib/http";

type CorsOptions = {
  origin?: string | string[];
  methods?: string[];
  credentials?: boolean;
};

export const applyCors = (
  response: CustomResponse,
  options: CorsOptions = {}
): CustomResponse => {
  const origin = options.origin || "*";
  const methods = options.methods || ["GET", "POST", "PUT", "DELETE", "OPTIONS"];

  response.setHeader("Access-Control-Allow-Origin",
    Array.isArray(origin) ? origin.join(",") : origin);

  response.setHeader("Access-Control-Allow-Methods",
    Array.isArray(methods) ? methods.join(",") : methods);

  response.setHeader("Access-Control-Allow-Headers",
    "Content-Type, Authorization");

  if (options.credentials) {
    response.setHeader("Access-Control-Allow-Credentials", "true");
  }

  return response;
};