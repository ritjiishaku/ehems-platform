import { describe, expect, it, beforeEach } from 'vitest';
import {
  checkRateLimit,
  LOGIN_RATE_LIMIT,
  recordAttempt,
  resetAllRateLimits,
  resetRateLimit,
  PASSWORD_RESET_RATE_LIMIT,
} from '@/lib/auth/rate-limit';

describe('rate limiting', () => {
  beforeEach(() => {
    resetAllRateLimits();
  });

  it('allows an attempt while under the limit', () => {
    expect(checkRateLimit('k', LOGIN_RATE_LIMIT).allowed).toBe(true);
  });

  it('trips once the limit is reached', () => {
    const key = 'login:1.2.3.4:a@example.com';
    for (let i = 0; i < LOGIN_RATE_LIMIT.limit; i += 1) {
      expect(checkRateLimit(key, LOGIN_RATE_LIMIT).allowed).toBe(true);
      recordAttempt(key, LOGIN_RATE_LIMIT);
    }

    const blocked = checkRateLimit(key, LOGIN_RATE_LIMIT);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('reports a countdown that matches the window', () => {
    const key = 'login:1.2.3.4:b@example.com';
    const now = 1_000_000;
    for (let i = 0; i < LOGIN_RATE_LIMIT.limit; i += 1) {
      recordAttempt(key, LOGIN_RATE_LIMIT, now);
    }

    // 60s into a 15-minute window, the oldest attempt still has 14 minutes left.
    const blocked = checkRateLimit(key, LOGIN_RATE_LIMIT, now + 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(LOGIN_RATE_LIMIT.windowMs / 1000 - 60);
  });

  it('frees the key once the window slides past', () => {
    const key = 'login:1.2.3.4:c@example.com';
    const now = 1_000_000;
    for (let i = 0; i < LOGIN_RATE_LIMIT.limit; i += 1) {
      recordAttempt(key, LOGIN_RATE_LIMIT, now);
    }
    expect(checkRateLimit(key, LOGIN_RATE_LIMIT, now).allowed).toBe(false);
    expect(checkRateLimit(key, LOGIN_RATE_LIMIT, now + LOGIN_RATE_LIMIT.windowMs + 1).allowed).toBe(
      true,
    );
  });

  it('keeps separate keys independent, so one attacker cannot lock out another', () => {
    const attacker = 'login:6.6.6.6:victim@example.com';
    const other = 'login:7.7.7.7:someone@example.com';
    for (let i = 0; i < LOGIN_RATE_LIMIT.limit; i += 1) {
      recordAttempt(attacker, LOGIN_RATE_LIMIT);
    }
    expect(checkRateLimit(attacker, LOGIN_RATE_LIMIT).allowed).toBe(false);
    expect(checkRateLimit(other, LOGIN_RATE_LIMIT).allowed).toBe(true);
  });

  it('clears a key after a successful sign-in so earlier typos are forgiven', () => {
    const key = 'login:8.8.8.8:me@example.com';
    for (let i = 0; i < LOGIN_RATE_LIMIT.limit; i += 1) {
      recordAttempt(key, LOGIN_RATE_LIMIT);
    }
    expect(checkRateLimit(key, LOGIN_RATE_LIMIT).allowed).toBe(false);

    resetRateLimit(key);
    expect(checkRateLimit(key, LOGIN_RATE_LIMIT).allowed).toBe(true);
  });

  it('applies a separate, tighter budget to password resets', () => {
    expect(PASSWORD_RESET_RATE_LIMIT.windowMs).toBeGreaterThan(LOGIN_RATE_LIMIT.windowMs);
  });

  it('does not grow the bucket without bound as the window slides', () => {
    const key = 'login:9.9.9.9:long@example.com';
    const now = 1_000_000;
    for (let i = 0; i < 100; i += 1) {
      recordAttempt(key, LOGIN_RATE_LIMIT, now + i * 10_000);
    }
    // 100 attempts across ~16 minutes cannot all sit in a 15-minute window.
    expect(checkRateLimit(key, LOGIN_RATE_LIMIT, now + 990_000).allowed).toBe(false);
  });
});
