// In-memory rate limiter (fixed window per key). Suitable for a single server.
import { Errors } from './http.ts';

interface Bucket { count: number; resetAt: number }

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
    }, 60_000);
    this.timer.unref();
  }

  /** Returns remaining requests; throws 429 when over the limit. */
  hit(key: string, limit: number, windowMs: number, message?: string): number {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
    }
    b.count++;
    if (b.count > limit) throw Errors.rateLimited(message, Math.ceil((b.resetAt - now) / 1000));
    return limit - b.count;
  }

  reset(key: string) {
    this.buckets.delete(key);
  }

  clear() {
    this.buckets.clear();
  }
}
