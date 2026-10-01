import { Injectable } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class MetricsRegistry {
  private readonly startedAt = Date.now();
  private totalRequests = 0;
  private totalLatencyMs = 0;
  private maxLatencyMs = 0;
  private readonly byStatusClass = new Map<string, number>();

  record(statusCode: number, durationMs: number): void {
    this.totalRequests += 1;
    this.totalLatencyMs += durationMs;
    this.maxLatencyMs = Math.max(this.maxLatencyMs, durationMs);
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    this.byStatusClass.set(
      statusClass,
      (this.byStatusClass.get(statusClass) ?? 0) + 1,
    );
  }

  middleware() {
    return (_req: Request, res: Response, next: NextFunction): void => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        this.record(
          res.statusCode,
          Number(process.hrtime.bigint() - start) / 1e6,
        );
      });
      next();
    };
  }

  snapshot() {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      requests: {
        total: this.totalRequests,
        byStatusClass: Object.fromEntries(this.byStatusClass),
        averageLatencyMs:
          this.totalRequests === 0
            ? 0
            : Math.round((this.totalLatencyMs / this.totalRequests) * 100) /
              100,
        maxLatencyMs: Math.round(this.maxLatencyMs * 100) / 100,
      },
    };
  }
}
