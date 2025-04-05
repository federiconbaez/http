import { CustomResponse } from "@/lib/server/response";

export class ApiError extends Error {
  statusCode: number;
  warnings?: string[];
  metadata?: Record<string, any>;

  constructor(
    message: string,
    statusCode = 500,
    warnings?: string[],
    metadata?: Record<string, any>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.warnings = warnings;
    this.metadata = metadata;
  }
}

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

export const respondError = (
  error: string | Error | ApiError,
  statusCode = 500,
  warnings?: string[],
  metadata?: Record<string, any>
): CustomResponse => {
  const message = error instanceof Error ? error.message : error;
  const code =
    error instanceof ApiError ? error.statusCode : statusCode;
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
      ...(errorWarnings.length > 0 ? { warnings: errorWarnings } : {}),
      ...(Object.keys(errorMetadata).length > 0 ? { metadata: errorMetadata } : {}),
    },
    { status: code }
  );
};