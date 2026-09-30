/**
 * The single place a caught error is logged.
 *
 * The reason this is a module and not a `console.error` at each call site is the
 * correlation id. A member who sees "quote reference 8f2a" has to be able to hand
 * that to support, and support has to be able to turn it into one log line. That
 * only works if the id is minted in exactly one place and both the response and
 * the log line carry it.
 */

import crypto from 'node:crypto';

export function correlationId(): string {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Log an unexpected error with a correlation id and return that id.
 *
 * `context` is for correlation, not for payload: an admin id or a payment id is
 * useful in a log line, an NDPA-sensitive member field is not. Callers pass
 * identifiers, never record contents — a stack trace plus a bank reference is
 * already more personal data than a server log should hold.
 */
export function logServerError(error: unknown, context?: Record<string, unknown>): string {
  const id = correlationId();
  const detail =
    error instanceof Error ? { message: error.message, stack: error.stack } : { error };

  if (process.env.NODE_ENV === 'test') {
    // A test asserting on stderr noise is worse than a missing log line.
    return id;
  }

  console.error(`[${id}] unhandled route error`, {
    ...context,
    ...detail,
  });
  return id;
}
