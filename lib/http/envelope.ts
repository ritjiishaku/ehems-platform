/**
 * The HTTP response envelope and the error → status mapping, defined once.
 *
 * Every route handler returns one of these rather than hand-rolling a
 * `Response.json({ error: 'Something went wrong' }, { status })`. Three reasons
 * that matters, in order of how much damage the alternative does:
 *
 * 1. **Clients depend on the shape.** `{ data }` on success and
 *    `{ error: { code, message, fields } }` on failure is the contract in
 *    api-route-scaffolder. A handler that returns a bare string or a bare array
 *    is a handler every consumer has to special-case.
 * 2. **Status codes stop being arbitrary.** `409` for a state conflict and `422`
 *    for a business-rule violation with a valid body are the difference between
 *    "retry this" and "fix your input". Picking them per handler is how an app
 *    ends up with four different meanings for 400.
 * 3. **Internal messages do not leak.** `serverError` returns a generic body and
 *    logs the real error with a correlation id. The one rule here that is not
 *    negotiable: a client never sees a stack trace, a SQL string, or a Prisma
 *    error message.
 */

import type { ZodError, ZodIssue } from 'zod';
import { logServerError } from './logger';

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'BUSINESS_RULE_VIOLATION'
  | 'INTERNAL_ERROR';

export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string; fields?: Record<string, string[]> };
};

export type ApiSuccessBody<T> = { data: T };

/** Field errors flattened for a form to render next to its inputs. */
function fieldsFromIssues(issues: ZodIssue[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

export function ok<T>(data: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ data } satisfies ApiSuccessBody<T>), {
    status: 200,
    ...init,
    headers: { ...JSON_HEADERS, ...init?.headers },
  });
}

export function created<T>(data: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ data } satisfies ApiSuccessBody<T>), {
    status: 201,
    ...init,
    headers: { ...JSON_HEADERS, ...init?.headers },
  });
}

function fail(
  code: ApiErrorCode,
  message: string,
  status: number,
  fields?: Record<string, string[]>,
): Response {
  const body: ApiErrorBody = { error: { code, message, ...(fields ? { fields } : {}) } };
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function badRequest(error: ZodError): Response {
  return fail(
    'VALIDATION_FAILED',
    'Some of the details you entered need fixing.',
    400,
    fieldsFromIssues(error.issues),
  );
}

export function unauthenticated(message = 'Sign in to continue.'): Response {
  return fail('UNAUTHENTICATED', message, 401);
}

/**
 * 403 when the caller is known but not allowed.
 *
 * Prefer 404 when the *existence* of the thing is itself private — telling an
 * unauthorised caller that payment `abc` exists is a disclosure, even if it is
 * only an existence. The caller decides which, because only the caller knows
 * whether the id was guessable.
 */
export function forbidden(message = 'You do not have access to that.'): Response {
  return fail('FORBIDDEN', message, 403);
}

export function notFound(message = 'Not found.'): Response {
  return fail('NOT_FOUND', message, 404);
}

/** 409 — the request was well-formed but the row is not in a state to accept it. */
export function conflict(message: string): Response {
  return fail('CONFLICT', message, 409);
}

/** 422 — shape was fine, a business rule refused it (BR-00x, D-1, D-8). */
export function businessRule(message: string): Response {
  return fail('BUSINESS_RULE_VIOLATION', message, 422);
}

export function rateLimited(message = 'Too many attempts. Try again shortly.'): Response {
  return fail('RATE_LIMITED', message, 429);
}

/**
 * The 500 path. Logs the real error and returns nothing useful to the caller.
 *
 * The correlation id is the only thing shared between the two: it appears in the
 * response so a member can quote it, and in the server log so support can find
 * the stack. Without it, "it broke" is untraceable; with it, the member never
 * sees anything internal.
 */
export function serverError(error: unknown, context?: Record<string, unknown>): Response {
  const correlationId = logServerError(error, context);
  return fail(
    'INTERNAL_ERROR',
    `Something went wrong on our side. Quote reference ${correlationId}.`,
    500,
  );
}
