import crypto from 'node:crypto';
import { prisma } from '../db/client';

/**
 * Attempt throttling for credential endpoints.
 *
 * D-14 confirmed 5 login attempts per 15 minutes and 3 password-reset attempts
 * per hour. These values are kept as code constants so client-editable settings
 * cannot weaken the authentication boundary.
 *
 * Server actions use the PostgreSQL-backed functions below so every application
 * instance shares one budget. The synchronous Map helpers remain deterministic
 * unit-test seams and must not be used by production routes.
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

export type RateLimitEvaluation = {
  activeAttempts: number[];
  verdict: RateLimitVerdict;
};

/** Shared sliding-window decision logic for memory and PostgreSQL stores. */
export function evaluateRateLimit(
  attemptsAt: readonly number[],
  rule: RateLimitRule,
  now: number,
): RateLimitEvaluation {
  const cutoff = now - rule.windowMs;
  const activeAttempts = attemptsAt.filter((at) => at > cutoff).sort((left, right) => left - right);

  if (activeAttempts.length >= rule.limit) {
    const oldest = activeAttempts[0] ?? now;
    return {
      activeAttempts,
      verdict: {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
      },
    };
  }

  return {
    activeAttempts,
    verdict: { allowed: true, remaining: rule.limit - activeAttempts.length, retryAfterSeconds: 0 },
  };
}

const attempts = new Map<string, number[]>();

function digestKey(key: string): string {
  const secret = process.env.AUTH_SESSION_SECRET ?? 'local-development-secret-not-for-production';
  return crypto.createHmac('sha256', secret).update(key).digest('hex');
}

/** Atomically consume one attempt from the shared PostgreSQL sliding window. */
export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): Promise<RateLimitVerdict> {
  const keyHash = digestKey(key);
  const nowDate = new Date(now);

  return prisma.$transaction(async (tx) => {
    await tx.authRateLimitBucket.deleteMany({ where: { expiresAt: { lt: nowDate } } });
    await tx.$executeRaw`
      INSERT INTO "auth_rate_limit_bucket" ("key_hash", "attempts", "expires_at", "updated_at")
      VALUES (
        ${keyHash},
        ARRAY[]::TIMESTAMP(3)[],
        ${new Date(now + rule.windowMs)},
        ${nowDate}
      )
      ON CONFLICT ("key_hash") DO NOTHING
    `;

    // Serialize requests for the same pseudonymous key across app instances.
    await tx.$queryRaw`
      WITH lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${keyHash}, 0))
      )
      SELECT 1 AS acquired FROM lock
    `;

    const bucket = await tx.authRateLimitBucket.findUnique({ where: { keyHash } });
    const evaluation = evaluateRateLimit(
      (bucket?.attempts ?? []).map((attempt) => attempt.getTime()),
      rule,
      now,
    );
    const acceptedAttempt = evaluation.verdict.allowed;
    const attempts = acceptedAttempt
      ? [...evaluation.activeAttempts, now].map((attempt) => new Date(attempt))
      : evaluation.activeAttempts.map((attempt) => new Date(attempt));
    const lastAttempt = attempts[attempts.length - 1] ?? nowDate;
    await tx.authRateLimitBucket.update({
      where: { keyHash },
      data: {
        attempts,
        expiresAt: new Date(lastAttempt.getTime() + rule.windowMs),
      },
    });

    return acceptedAttempt
      ? { ...evaluation.verdict, remaining: rule.limit - attempts.length }
      : evaluation.verdict;
  });
}

/** Clear both the production bucket and local test bucket after successful authentication. */
export async function clearRateLimit(key: string): Promise<void> {
  await prisma.authRateLimitBucket.deleteMany({ where: { keyHash: digestKey(key) } });
  resetRateLimit(key);
}

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
  return evaluateRateLimit(hits, rule, now).verdict;
}

/** Forget a key. Call after a successful authentication so a legitimate user is not penalised for earlier typos. */
export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

/** Test seam. Clears every bucket. */
export function resetAllRateLimits(): void {
  attempts.clear();
}
