import { SetMetadata } from '@nestjs/common';

export type RateLimitGroup =
  'auth' | 'chat' | 'subscriptions' | 'admin' | 'default';

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'rateLimitGroup';

export const RATE_LIMITS: Record<
  RateLimitGroup,
  { perIp: RateLimitRule; perUser: RateLimitRule }
> = {
  auth: {
    perIp: { limit: 20, windowSeconds: 60 },
    perUser: { limit: 30, windowSeconds: 60 },
  },
  chat: {
    perIp: { limit: 60, windowSeconds: 60 },
    perUser: { limit: 10, windowSeconds: 60 },
  },
  subscriptions: {
    perIp: { limit: 60, windowSeconds: 60 },
    perUser: { limit: 20, windowSeconds: 60 },
  },
  admin: {
    perIp: { limit: 30, windowSeconds: 60 },
    perUser: { limit: 10, windowSeconds: 60 },
  },
  default: {
    perIp: { limit: 100, windowSeconds: 60 },
    perUser: { limit: 60, windowSeconds: 60 },
  },
};

export const RateLimit = (group: RateLimitGroup) =>
  SetMetadata(RATE_LIMIT_KEY, group);

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  hit(key: string, rule: RateLimitRule): RateLimitDecision {
    const t = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + rule.windowSeconds * 1000 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (this.buckets.size > 10_000) {
      this.sweep(t);
    }

    return {
      allowed: bucket.count <= rule.limit,
      remaining: Math.max(0, rule.limit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - t) / 1000)),
    };
  }

  private sweep(t: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= t) {
        this.buckets.delete(key);
      }
    }
  }
}
