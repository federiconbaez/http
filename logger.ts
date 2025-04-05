// src/lib/api-framework/logger.ts
import { CustomRequest } from "@/lib/http/request";
import { CustomResponse } from "./response";
import { LogLevel, LoggerAdapter, LoggerOptions } from "./types";

/**
 * Logger manager for handling API request/response logging
 */
export class LoggerManager {
  private adapters: Map<string, LoggerAdapter> = new Map();
  private defaultAdapter: string | null = null;

  constructor() {
    // Register console adapter by default
    this.registerAdapter('console', new ConsoleLoggerAdapter());
    this.defaultAdapter = 'console';
  }

  /**
   * Register a new logger adapter
   */
  public registerAdapter(name: string, adapter: LoggerAdapter): void {
    this.adapters.set(name, adapter);
    if (!this.defaultAdapter) {
      this.defaultAdapter = name;
    }
  }

  /**
   * Set the default logger adapter
   */
  public setDefaultAdapter(name: string): void {
    if (!this.adapters.has(name)) {
      throw new Error(`Logger adapter '${name}' not registered`);
    }
    this.defaultAdapter = name;
  }

  /**
   * Get a logger adapter
   */
  public getAdapter(name?: string): LoggerAdapter {
    const adapterName = name || this.defaultAdapter;
    if (!adapterName) {
      throw new Error('No default logger adapter configured');
    }

    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Logger adapter '${adapterName}' not registered`);
    }

    return adapter;
  }

  /**
   * Log an incoming request
   */
  public logRequest(req: CustomRequest, options: LoggerOptions): void {
    if (!options.enabled) {
      return;
    }

    const adapter = this.getAdapter(options.adapter);
    const minLevel = options.level || 'info';

    if (!this.shouldLog(LogLevel.INFO, minLevel)) {
      return;
    }

    const logData = {
      type: 'request',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      query: Object.fromEntries(req.searchParams.entries()),
      headers: options.logHeaders ? this.sanitizeHeaders(req.headers, options.sensitiveHeaders) : undefined,
      ip: req.ip,
      userAgent: req.userAgent,
    };

    adapter.log(LogLevel.INFO, `API Request: ${req.method} ${req.path}`, logData);
  }

  /**
   * Log a response
   */
  public logResponse(res: CustomResponse, startTime: number, req: CustomRequest, options: LoggerOptions): void {
    if (!options.enabled) {
      return;
    }

    const adapter = this.getAdapter(options.adapter);
    const minLevel = options.level || 'info';

    if (!this.shouldLog(LogLevel.INFO, minLevel)) {
      return;
    }

    const duration = Date.now() - startTime;

    // Get status code from response
    let statusCode = 200;
    try {
      // This assumes the response has a statusCode property or method to get it
      statusCode = typeof res.getStatus === 'function'
        ? res.getStatus()
        : (res as any).statusCode || 200;
    } catch (error) {
      // If we can't get the status code, just use the default
    }

    const logData = {
      type: 'response',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      statusCode,
      duration,
      headers: options.logHeaders ? this.sanitizeHeaders(new Headers(), options.sensitiveHeaders) : undefined,
    };

    adapter.log(LogLevel.INFO, `API Response: ${req.method} ${req.path} ${statusCode} ${duration}ms`, logData);
  }

  /**
   * Log an error
   */
  public logError(error: any, req: CustomRequest, options: LoggerOptions): void {
    if (!options.enabled) {
      return;
    }

    const adapter = this.getAdapter(options.adapter);
    const minLevel = options.level || 'info';

    if (!this.shouldLog(LogLevel.ERROR, minLevel)) {
      return;
    }

    const statusCode = error.statusCode || 500;
    const errorMessage = error.message || 'Unknown error';

    const logData = {
      type: 'error',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      statusCode,
      error: {
        message: errorMessage,
        stack: options.logErrorStacks ? error.stack : undefined,
        code: error.code,
        name: error.name,
      },
    };

    adapter.log(LogLevel.ERROR, `API Error: ${req.method} ${req.path} ${statusCode} - ${errorMessage}`, logData);
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4,
    };

    return levels[level] >= levels[minLevel];
  }

  /**
   * Sanitize headers to remove sensitive information
   */
  private sanitizeHeaders(headers: Headers, sensitiveHeaders: string[] = []): Record<string, string> {
    const result: Record<string, string> = {};
    const defaultSensitiveHeaders = [
      'authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'x-auth-token',
      'x-refresh-token',
      'password',
      'secret',
      'token',
    ];

    const allSensitiveHeaders = [...defaultSensitiveHeaders, ...sensitiveHeaders].map(h => h.toLowerCase());

    for (const [key, value] of headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (allSensitiveHeaders.includes(lowerKey)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}

/**
 * Console logger adapter implementation
 */
class ConsoleLoggerAdapter implements LoggerAdapter {
  /**
   * Log a message
   */
  public log(level: LogLevel, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logFn = this.getConsoleMethod(level);

    if (data) {
      logFn(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);
    } else {
      logFn(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Get the appropriate console method for the log level
   */
  private getConsoleMethod(level: LogLevel): (message?: any, ...optionalParams: any[]) => void {
    switch (level) {
      case 'debug':
        return console.debug;
      case 'info':
        return console.info;
      case 'warn':
        return console.warn;
      case 'error':
      case 'fatal':
        return console.error;
      default:
        return console.log;
    }
  }
}

/**
 * Factory function to create a file logger adapter
 * This is just an example and requires a file system module
 */
export const createFileLoggerAdapter = (options: {
  directory: string;
  filename?: string;
  maxSize?: number;
  maxFiles?: number;
}): LoggerAdapter => {
  // This would be implemented with a file system module
  return {
    log(level: LogLevel, message: string, data?: any): void {
      // Implementation would write to file
      if (options.filename) {
        // Write to file logic
        console.log(`[FILE] [${level.toUpperCase()}] ${message} ${data}`);
      } else {
        // Fallback to console if no filename is provided

        console.log(`[FILE] [${level.toUpperCase()}] ${message} ${data}`);
      }
    }
  };
};

// Create and export a singleton instance
export const logger = new LoggerManager();

// Export convenience functions
export const logRequest = (
  req: CustomRequest,
  options: LoggerOptions
): void => {
  return logger.logRequest(req, options);
};

export const logResponse = (
  res: CustomResponse,
  startTime: number,
  req: CustomRequest,
  options: LoggerOptions
): void => {
  return logger.logResponse(res, startTime, req, options);
};

export const logError = (
  error: any,
  req: CustomRequest,
  options: LoggerOptions
): void => {
  return logger.logError(error, req, options);
};