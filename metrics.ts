
import { CustomRequest } from "./request";
import { CustomResponse } from "./response";
import { ApiContext, MetricsOptions } from "./types";

/**
 * Metrics manager for collecting and exposing API metrics
 */
export class MetricsManager {
  private metrics: Map<string, any[]> = new Map();
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, () => number> = new Map();

  constructor() {
    // Initialize default metrics
    this.metrics.set('total_requests', []);
    this.metrics.set('response_time', []);
  }

  /**
   * Apply metrics headers to the response
   */
  public applyMetricsHeaders(
    res: CustomResponse<any>,
    options: MetricsOptions,
    context: ApiContext
  ): CustomResponse<any> {
    if (options.headers) {
      res.setHeader('X-Metrics-Enabled', 'true');
      res.setHeader('X-Metrics-Version', '1.0');
    }

    // Use context to set additional headers if needed
    if (context.requestId) {
      res.setHeader('X-Request-ID', context.requestId);
    }

    if (context.method) {
      res.setHeader('X-Request-Method', context.method);
    }

    return res;
  }

  /**
   * Collect a metric
   */
  public collect(name: string, value: any): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push({
      value,
      timestamp: Date.now()
    });

    // Keep only the last 1000 data points
    const metrics = this.metrics.get(name)!;
    if (metrics.length > 1000) {
      this.metrics.set(name, metrics.slice(-1000));
    }
  }

  /**
   * Increment a counter
   */
  public incrementCounter(name: string, value: number = 1): number {
    const current = this.counters.get(name) || 0;
    const newValue = current + value;
    this.counters.set(name, newValue);
    return newValue;
  }

  /**
   * Decrement a counter
   */
  public decrementCounter(name: string, value: number = 1): number {
    const current = this.counters.get(name) || 0;
    const newValue = Math.max(0, current - value); // Prevent negative values
    this.counters.set(name, newValue);
    return newValue;
  }

  /**
   * Set a counter
   */
  public setCounter(name: string, value: number): void {
    this.counters.set(name, value);
  }

  /**
   * Get a counter value
   */
  public getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Record a value in a histogram
   */
  public recordHistogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name)!.push(value);

    // Keep only the last 1000 data points
    const values = this.histograms.get(name)!;
    if (values.length > 1000) {
      this.histograms.set(name, values.slice(-1000));
    }
  }

  /**
   * Get histogram statistics
   */
  public getHistogramStats(name: string): {
    count: number;
    min: number;
    max: number;
    sum: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  } | undefined {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) {
      return undefined;
    }

    // Sort values for percentile calculations
    const sortedValues = [...values].sort((a, b) => a - b);
    const count = sortedValues.length;
    const min = sortedValues[0];
    const max = sortedValues[count - 1];
    const sum = sortedValues.reduce((acc, val) => acc + val, 0);
    const mean = sum / count;
    const median = this.getPercentile(sortedValues, 50);
    const p95 = this.getPercentile(sortedValues, 95);
    const p99 = this.getPercentile(sortedValues, 99);

    return {
      count,
      min,
      max,
      sum,
      mean,
      median,
      p95,
      p99
    };
  }

  /**
   * Calculate percentile from sorted values
   */
  private getPercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];

    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
  }

  /**
   * Register a gauge function
   */
  public registerGauge(name: string, fn: () => number): void {
    this.gauges.set(name, fn);
  }

  /**
   * Get the current value of a gauge
   */
  public getGauge(name: string): number | undefined {
    const gaugeFn = this.gauges.get(name);
    if (!gaugeFn) {
      return undefined;
    }

    try {
      return gaugeFn();
    } catch (error) {
      console.error(`Error getting gauge ${name}:`, error);
      return undefined;
    }
  }

  /**
   * Clear all metrics
   */
  public clearMetrics(): void {
    this.metrics.clear();
    this.counters.clear();
    this.histograms.clear();
    // Don't clear gauges as they are function references
  }

  /**
   * Get metrics data
   */
  public getMetrics(): Record<string, any> {
    const result: Record<string, any> = {
      counters: Object.fromEntries(this.counters),
      histograms: {},
      gauges: {}
    };

    // Add histogram stats
    for (const [name] of this.histograms) {
      result.histograms[name] = this.getHistogramStats(name);
    }

    // Add gauge values
    for (const [name] of this.gauges) {
      result.gauges[name] = this.getGauge(name);
    }

    return result;
  }

  /**
   * Apply metrics middleware to a response
   */
  public applyMetrics(
    req: CustomRequest,
    res: CustomResponse<any>,
    context: ApiContext,
    options: MetricsOptions
  ): CustomResponse<any> {
    if (!options.enabled) {
      return res;
    }

    const requestId = req.headers.get('x-request-id') || req.headers.get('request-id') || req.headers.get('x-request-id');
    if (!requestId) {
      throw new Error('Request ID header is missing');
    }

    // Set start time for the request
    context.startTime = Date.now();
    context.requestId = requestId;
    context.method = req.method;
    context.url = req.url;

    const endTime = Date.now();
    const responseTime = endTime - context.startTime;

    // Record response time
    this.recordHistogram('response_time', responseTime);

    // Increment request counter
    this.incrementCounter('total_requests');

    // Increment status code counter
    this.incrementCounter(`status_${res.getStatus()}`);
    this.incrementCounter(`method_${context.method}`);
    this.incrementCounter(`url_${context.url}`);
    this.incrementCounter(`request_id_${context.requestId}`);

    // Add headers if enabled
    if (options.headers) {
      res.setHeader('X-Response-Time', `${responseTime}ms`);
      res.setHeader('X-Request-ID', context.requestId);
    }

    return res;
  }

  /**
   * Collect request metrics
   */
  public collectRequestMetrics(
    req: CustomRequest,
    options: Partial<MetricsOptions> = {}
  ): () => void {
    if (!options.enabled) {
      return () => { };
    }

    const requestId = req.headers.get('x-request-id') || req.headers.get('request-id') || req.headers.get('x-request-id');
    if (!requestId) {
      throw new Error('Request ID header is missing');
    }

    const startTime = Date.now();

    return () => {
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Record response time
      this.recordHistogram('response_time', responseTime);

      // Increment request counter
      this.incrementCounter('total_requests');
    };
  }
}

// Create a singleton instance
export const metricsManager = new MetricsManager();

/**
 * Apply metrics to a response
 */
export const applyMetrics = (
  req: CustomRequest,
  res: CustomResponse<any>,
  context: ApiContext,
  options: MetricsOptions
): CustomResponse<any> => {
  return metricsManager.applyMetrics(req, res, context, options);
};

// Export convenience function
export const collectMetrics = (
  req: CustomRequest,
  options: Partial<MetricsOptions> = {}
): () => void => {
  return metricsManager.collectRequestMetrics(req, options);
};