// src/lib/api-framework/health.ts
import { CustomResponse } from "./response";
import { HealthCheckOptions } from "./types";

/**
 * Health check manager for monitoring API health
 */
export class HealthCheckManager {
  private checks: Array<{
    name: string;
    check: () => Promise<boolean>;
    critical: boolean;
  }> = [];

  /**
   * Add a health check
   */
  public addCheck(
    name: string,
    check: () => Promise<boolean>,
    critical: boolean = false
  ): void {
    this.checks.push({ name, check, critical });
  }

  /**
   * Remove a health check by name
   */
  public removeCheck(name: string): void {
    this.checks = this.checks.filter(check => check.name !== name);
  }

  /**
   * Perform all health checks
   */
  public async performHealthCheck(
    options: HealthCheckOptions = { enabled: true }
  ): Promise<CustomResponse> {
    const startTime = Date.now();
    const results: Record<string, any> = {};
    let allHealthy = true;
    let anyCriticalFailed = false;

    // Get checks from options or use registered checks
    const checksToRun = options.checks
      ? options.checks.map(c => ({
        name: c.name,
        check: c.check,
        critical: c.critical || false
      }))
      : this.checks;

    // Set a timeout if specified
    const timeout = options.timeout || 30000;

    // Run each check with timeout
    for (const { name, check, critical } of checksToRun) {
      try {
        // Create a promise that rejects after the timeout
        const timeoutPromise = new Promise<boolean>((_, reject) => {
          setTimeout(() => reject(new Error(`Health check "${name}" timed out after ${timeout}ms`)), timeout);
        });

        // Race the check against the timeout
        const healthy = await Promise.race([check(), timeoutPromise]);

        results[name] = {
          status: healthy ? 'healthy' : 'unhealthy',
          critical
        };

        if (!healthy) {
          allHealthy = false;
          if (critical) {
            anyCriticalFailed = true;
          }
        }
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : String(error),
          critical
        };

        allHealthy = false;
        if (critical) {
          anyCriticalFailed = true;
        }
      }
    }

    // Calculate response status
    let status = 200;
    if (!allHealthy) {
      status = anyCriticalFailed ? 503 : 207; // 503 Service Unavailable or 207 Multi-Status
    }

    // Add metadata
    const endTime = Date.now();
    const metadata = {
      timestamp: new Date().toISOString(),
      duration: `${endTime - startTime}ms`,
      version: process.env.API_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    // Create response
    return CustomResponse.json(
      {
        status: allHealthy ? 'healthy' : (anyCriticalFailed ? 'critical' : 'degraded'),
        checks: results,
        metadata
      },
      { status }
    );
  }
}

// Create and export a singleton instance
export const healthCheckManager = new HealthCheckManager();

// Add default health checks
healthCheckManager.addCheck('system', async () => {
  // Basic system check (memory usage)
  const memoryUsage = process.memoryUsage();
  const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

  // Consider unhealthy if heap usage is over 90%
  return heapUsedPercentage < 90;
}, false);

// Export convenience function
export const performHealthCheck = async (
  options: HealthCheckOptions = { enabled: true }
): Promise<CustomResponse> => {
  return healthCheckManager.performHealthCheck(options);
};