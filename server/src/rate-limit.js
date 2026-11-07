// Token-bucket rate limiter keyed by an opaque string (a token hash or a client address).
// take() returns {ok: true} or {ok: false, retryAfter} with retryAfter in whole seconds.

export class RateLimiter {
  /** @param {{rate: number, burst: number, clock?: () => number}} o  rate = tokens per second */
  constructor({ rate, burst, clock = () => Date.now() }) {
    this.rate = rate; this.burst = burst; this.clock = clock;
    this.buckets = new Map();
  }

  take(key, cost = 1) {
    const now = this.clock();
    let b = this.buckets.get(key);
    if (!b) { b = { tokens: this.burst, at: now }; this.buckets.set(key, b); }
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.rate);
    b.at = now;
    if (b.tokens >= cost) { b.tokens -= cost; return { ok: true }; }
    const retryAfter = Math.max(1, Math.ceil((cost - b.tokens) / this.rate));
    if (this.buckets.size > 50000) this.prune(now);
    return { ok: false, retryAfter };
  }

  prune(now) { for (const [k, b] of this.buckets) if (now - b.at > 600000) this.buckets.delete(k); }
}
