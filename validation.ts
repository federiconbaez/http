// src/lib/api-framework/validation.ts
import { ApiError } from "./response";
import { ValidationSchema } from "./types";

/**
 * Validates data against a schema
 * @param data The data to validate
 * @param schema The validation schema
 * @returns The validated data
 * @throws ApiError if validation fails
 */
export const validateSchema = <T>(
  data: any,
  schema: ValidationSchema<T>
): T => {
  const result = schema.validate(data);

  if (result.error) {
    throw new ApiError(
      "Validation error",
      400,
      "VALIDATION_ERROR",
      undefined,
      { details: formatValidationError(result.error) }
    );
  }

  return result.value;
};

/**
 * Formats validation error for better readability
 * @param error The validation error to format
 * @returns A formatted error object
 */
function formatValidationError(error: any): Record<string, any> {
  // Handle Joi validation errors
  if (error && error.details && Array.isArray(error.details)) {
    const errorDetails = error.details.map((detail: any) => ({
      message: detail.message,
      path: detail.path,
      type: detail.type
    }));

    return {
      message: "Validation failed",
      errors: errorDetails
    };
  }

  // Handle Zod validation errors
  if (error && error.errors && Array.isArray(error.errors)) {
    const errorDetails = error.errors.map((detail: any) => ({
      message: detail.message,
      path: detail.path,
      code: detail.code
    }));

    return {
      message: "Validation failed",
      errors: errorDetails
    };
  }

  // Handle Yup validation errors
  if (error && error.inner && Array.isArray(error.inner)) {
    const errorDetails = error.inner.map((detail: any) => ({
      message: detail.message,
      path: detail.path,
      type: detail.type
    }));

    return {
      message: "Validation failed",
      errors: errorDetails
    };
  }

  // Handle generic errors
  return {
    message: error.message || "Validation failed",
    details: error
  };
}

/**
 * Creates a simple validation schema for basic types
 * @param type The type of validation
 * @param options Additional validation options
 * @returns A validation schema
 */
export const createSchema = <T>(
  type: 'string' | 'number' | 'boolean' | 'object' | 'array',
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    min?: number;
    max?: number;
    enum?: any[];
    default?: any;
    properties?: Record<string, ValidationSchema<any>>;
    items?: ValidationSchema<any>;
  } = {}
): ValidationSchema<T> => {
  return {
    validate: (data: any) => {
      let value = data;
      let error = undefined;

      // Apply default value if undefined
      if (value === undefined && options.default !== undefined) {
        value = options.default;
      }

      // Check required
      if (options.required && (value === undefined || value === null)) {
        return {
          value,
          error: {
            message: 'Value is required',
            details: [{ message: 'Value is required', type: 'required' }]
          }
        };
      }

      // Skip validation if value is undefined or null
      if (value === undefined || value === null) {
        return { value };
      }

      // Type validation
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== type && !(type === 'array' && actualType === 'object' && Array.isArray(value))) {
        return {
          value,
          error: {
            message: `Expected ${type}, received ${actualType}`,
            details: [{ message: `Expected ${type}, received ${actualType}`, type: 'type' }]
          }
        };
      }

      // String validation
      if (type === 'string' && typeof value === 'string') {
        if (options.minLength !== undefined && value.length < options.minLength) {
          error = {
            message: `String must be at least ${options.minLength} characters`,
            details: [{ message: `String must be at least ${options.minLength} characters`, type: 'minLength' }]
          };
        } else if (options.maxLength !== undefined && value.length > options.maxLength) {
          error = {
            message: `String must be at most ${options.maxLength} characters`,
            details: [{ message: `String must be at most ${options.maxLength} characters`, type: 'maxLength' }]
          };
        } else if (options.pattern && !options.pattern.test(value)) {
          error = {
            message: 'String does not match pattern',
            details: [{ message: 'String does not match pattern', type: 'pattern' }]
          };
        }
      }

      // Number validation
      if (type === 'number' && typeof value === 'number') {
        if (options.min !== undefined && value < options.min) {
          error = {
            message: `Number must be greater than or equal to ${options.min}`,
            details: [{ message: `Number must be greater than or equal to ${options.min}`, type: 'min' }]
          };
        } else if (options.max !== undefined && value > options.max) {
          error = {
            message: `Number must be less than or equal to ${options.max}`,
            details: [{ message: `Number must be less than or equal to ${options.max}`, type: 'max' }]
          };
        }
      }

      // Enum validation
      if (options.enum && !options.enum.includes(value)) {
        error = {
          message: `Value must be one of: ${options.enum.join(', ')}`,
          details: [{ message: `Value must be one of: ${options.enum.join(', ')}`, type: 'enum' }]
        };
      }

      // Object validation
      if (type === 'object' && typeof value === 'object' && !Array.isArray(value) && options.properties) {
        const errorDetails: any[] = [];
        const validatedObject: Record<string, any> = {};

        for (const [propName, propSchema] of Object.entries(options.properties)) {
          const propResult = propSchema.validate(value[propName]);
          validatedObject[propName] = propResult.value;

          if (propResult.error) {
            errorDetails.push({
              message: propResult.error.message,
              path: [propName],
              type: propResult.error.type
            });
          }
        }

        if (errorDetails.length > 0) {
          error = {
            message: 'Object validation failed',
            details: errorDetails
          };
        } else {
          value = validatedObject;
        }
      }

      // Array validation
      if (type === 'array' && Array.isArray(value) && options.items) {
        const errorDetails: any[] = [];
        const validatedArray: any[] = [];

        for (let i = 0; i < value.length; i++) {
          const itemResult = options.items.validate(value[i]);
          validatedArray[i] = itemResult.value;

          if (itemResult.error) {
            errorDetails.push({
              message: itemResult.error.message,
              path: [i],
              type: itemResult.error.type
            });
          }
        }

        if (errorDetails.length > 0) {
          error = {
            message: 'Array validation failed',
            details: errorDetails
          };
        } else {
          value = validatedArray;
        }
      }

      return { value, error };
    }
  };
};

/**
 * Creates a validation schema for a string
 */
export const string = (options: {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: string[];
  default?: string;
} = {}): ValidationSchema<string> => {
  return createSchema<string>('string', options);
};

/**
 * Creates a validation schema for a number
 */
export const number = (options: {
  required?: boolean;
  min?: number;
  max?: number;
  enum?: number[];
  default?: number;
} = {}): ValidationSchema<number> => {
  return createSchema<number>('number', options);
};

/**
 * Creates a validation schema for a boolean
 */
export const boolean = (options: {
  required?: boolean;
  default?: boolean;
} = {}): ValidationSchema<boolean> => {
  return createSchema<boolean>('boolean', options);
};

/**
 * Creates a validation schema for an object
 */
export const object = <T>(
  properties: Record<string, ValidationSchema<any>>,
  options: {
    required?: boolean;
    default?: T;
  } = {}
): ValidationSchema<T> => {
  return createSchema<T>('object', { ...options, properties });
};

/**
 * Creates a validation schema for an array
 */
export const array = <T>(
  items: ValidationSchema<T>,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    default?: T[];
  } = {}
): ValidationSchema<T[]> => {
  return createSchema<T[]>('array', { ...options, items });
};

/**
 * Validates data against a specified type
 */
export const validateRequest = <T>(
  data: any,
  schema?: ValidationSchema<T>
): T => {
  if (!schema) {
    return data as T;
  }

  return validateSchema(data, schema);
};