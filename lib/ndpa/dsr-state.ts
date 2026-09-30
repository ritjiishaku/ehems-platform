/**
 * The data subject request state machine (SEC-013).
 *
 * Pure and Prisma-free on purpose: every status transition is decided here, so
 * the rules can be unit tested without a database and so a route handler never
 * writes `status` on its own. This mirrors the `lib/payments/` rule in
 * AGENTS.md §6 — status changes flow through one place.
 *
 * Two rules are not in the PRD and are recorded as technical decisions rather
 * than client requirements:
 *
 * 1. **Terminal states are final.** `completed` and `rejected` have no outgoing
 *    transitions, so an admin cannot silently reopen or overwrite a recorded
 *    outcome. A member who wants something different submits a new request, and
 *    both rows stay in the history.
 * 2. **A closing outcome needs notes.** The skill requires a recorded reason for
 *    a rejection; this module extends the same requirement to `completed`, since
 *    a request closed with no record of what was actually done is not a
 *    defensible answer to a statutory deadline. Relaxable if the client
 *    disagrees — it is one predicate in `validateTransition`.
 */

import { DATA_SUBJECT_REQUEST_STATUSES, type DataSubjectRequestStatus } from './types';

/** The only status changes the system permits, keyed by the current status. */
export const DSR_TRANSITIONS: Readonly<
  Record<DataSubjectRequestStatus, readonly DataSubjectRequestStatus[]>
> = {
  pending: ['in_progress', 'rejected'],
  in_progress: ['completed', 'rejected'],
  completed: [],
  rejected: [],
};

/** Statuses that close a request. They set `resolvedAt` and require notes. */
export const DSR_TERMINAL_STATUSES: readonly DataSubjectRequestStatus[] = ['completed', 'rejected'];

/**
 * The NDPA allows one month to answer; treat it as 30 days.
 *
 * Surfaced in the admin view so a request aging past the window is visible
 * before it becomes a breach of the deadline, not after.
 */
export const DSR_RESPONSE_WINDOW_DAYS = 30;
export const DSR_RESPONSE_WINDOW_MS = DSR_RESPONSE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type DsrTransitionProblem =
  | { kind: 'unknown_status'; status: string }
  | { kind: 'terminal'; from: DataSubjectRequestStatus }
  | { kind: 'not_allowed'; from: DataSubjectRequestStatus; to: DataSubjectRequestStatus }
  | { kind: 'notes_required'; to: DataSubjectRequestStatus };

export type DsrTransitionResult =
  { ok: true } | { ok: false; problem: DsrTransitionProblem; message: string };

/**
 * Decide whether `from` → `to` may happen, and with what notes.
 *
 * Returns a problem rather than throwing, so a caller can turn it into a user
 * facing message. The state machine is a gate, not a validator that crashes the
 * request.
 */
export function validateTransition(
  from: string,
  to: string,
  notes: string | null | undefined,
): DsrTransitionResult {
  if (!(DATA_SUBJECT_REQUEST_STATUSES as readonly string[]).includes(from)) {
    return {
      ok: false,
      problem: { kind: 'unknown_status', status: from },
      message: 'This request has a status the system does not recognise.',
    };
  }
  if (!(DATA_SUBJECT_REQUEST_STATUSES as readonly string[]).includes(to)) {
    return {
      ok: false,
      problem: { kind: 'unknown_status', status: to },
      message: 'That is not a valid outcome for a data request.',
    };
  }

  const current = from as DataSubjectRequestStatus;
  const next = to as DataSubjectRequestStatus;

  if (!DSR_TRANSITIONS[current].includes(next)) {
    return DSR_TERMINAL_STATUSES.includes(current)
      ? {
          ok: false,
          problem: { kind: 'terminal', from: current },
          message: `A ${current} request is closed. Ask the member to submit a new request.`,
        }
      : {
          ok: false,
          problem: { kind: 'not_allowed', from: current, to: next },
          message: `A ${current} request cannot move to ${next}.`,
        };
  }

  if (DSR_TERMINAL_STATUSES.includes(next) && !notes?.trim()) {
    return {
      ok: false,
      problem: { kind: 'notes_required', to: next },
      message:
        next === 'rejected'
          ? 'A rejection needs a recorded reason.'
          : 'Record what was done before completing this request.',
    };
  }

  return { ok: true };
}

/** Whole days since the request was made, used for the 30-day deadline view. */
export function daysSinceRequested(requestedAt: Date, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - requestedAt.getTime()) / (24 * 60 * 60 * 1000)));
}

/** Has this request run past the one-month response window? */
export function isOverdue(requestedAt: Date, now: number = Date.now()): boolean {
  return now - requestedAt.getTime() > DSR_RESPONSE_WINDOW_MS;
}
