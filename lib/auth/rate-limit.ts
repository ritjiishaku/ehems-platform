/**
 * Attempt throttling for credential endpoints.
 *
 * The numbers are the proposed defaults in `.agents/rules/security.md`, mirrored
 * by the `login_max_attempts` and `login_lockout_minutes` SystemSetting seeds.
 * They are not contractual until D-14 is answered, so they are module constants
 * rather than a client-editable settings read.
 *
 * Storage is per-process and in memory. On a single Node instance that is enough
 * to blunt online guessing; across several instances it is not, because each
 * keeps its own counters. Moving to Postgres or Redis is a change to this file
 * alone — `checkRateLimit`'s signature is the only thing callers know about.
 */

export type RateLimitRule = {
  /** Attempts permitted inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export const LOGIN_RATE_LIMIT: RateLimitRule = { limit: 5, windowMs: 15 * 60 * 1000 };
export const PASSWORD_RESET_RATE_LIMIT: RateLimitRule = { limit: 3, windowMs: 60 * 60 * 1000 };

export type RateLimitVerdict = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window frees a slot. Zero when allowed. */
  retryAfterSeconds: number;
};

const attempts = new Map<string, number[]>();

function prune(key: string, windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  const kept = (attempts.get(key) ?? []).filter((at) => at > cutoff);
  if (kept.length === 0) {
    attempts.delete(key);
  } else {
    attempts.set(key, kept);
  }
  return kept;
}

/** Count an attempt without deciding whether it is allowed. Call after every attempt, successful or not. */
export function recordAttempt(key: string, rule: RateLimitRule, now = Date.now()): void {
  attempts.set(key, [...prune(key, rule.windowMs, now), now]);
}

/** Whether the next attempt is permitted. Does not mutate state. */
export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): RateLimitVerdict {
  const hits = prune(key, rule.windowMs, now);
  if (hits.length < rule.limit) {
    return { allowed: true, remaining: rule.limit - hits.length, retryAfterSeconds: 0 };
  }
  const oldest = hits[0] ?? now;
  const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
  return { allowed: false, remaining: 0, retryAfterSeconds };
}

/** Forget a key. Call after a successful authentication so a legitimate user is not penalised for earlier typos. */
export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

/** Test seam. Clears every bucket. */
export function resetAllRateLimits(): void {
  attempts.clear();
}
