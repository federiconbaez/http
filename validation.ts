// src/lib/api-framework/validation.ts
import { ApiError } from ".";
import { ValidationSchema } from "./types";

export const validateRequest = <T>(
  data: any,
  schema?: ValidationSchema<T>
): T | undefined => {
  if (!schema) {
    return undefined;
  }

  const result = schema.validate(data);

  if (result.error) {
    throw new ApiError(
      "Validation error",
      400,
      undefined,
      { details: result.error }
    );
  }

  return result.value;
};
