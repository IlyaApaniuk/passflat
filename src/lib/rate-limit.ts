/**
 * Fixed-window rate limiter shared by the API routes and the auth server
 * actions.
 *
 * Per-instance by design: every serverless instance holds its own Map, so on
 * Vercel the real ceiling is (instances × limit) and a cold start wipes it.
 * Treat it as a first line against a script, not as protection — whatever must
 * hold globally (a paid quota, outbound email, the sender domain's reputation)
 * needs a shared store (Upstash/Redis) or a challenge in front of it.
 */

export interface RateLimitOptions {
  /** Namespaced bucket, e.g. `contact:${ip}` — every caller shares one Map. */
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until this key's window resets; 0 while allowed. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Hard ceiling so a rotating-IP flood cannot grow the Map until the instance OOMs. */
const MAX_KEYS = 10_000;

const buckets = new Map<string, Bucket>();

export function checkRateLimit({
  key,
  limit,
  windowMs,
  now = Date.now(),
}: RateLimitOptions): RateLimitResult {
  // Sweeping on every call is what keeps the Map bounded by *live* traffic
  // rather than by every key ever seen; its cost is bounded by MAX_KEYS.
  for (const [knownKey, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(knownKey);
  }

  const bucket = buckets.get(key);
  if (bucket) {
    if (bucket.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // Nothing expired is left after the sweep, so a full Map means that many live
  // windows. Map order is insertion order, which for a fixed window is also
  // roughly expiry order — dropping the front sheds whatever resets soonest.
  while (buckets.size >= MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }

  buckets.set(key, { count: 1, resetAt: now + windowMs });
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

/** Test isolation for the module-scoped Map. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Test-only: proves expired buckets are dropped rather than merely ignored. */
export function rateLimitKeyCount(): number {
  return buckets.size;
}
