/**
 * The manual payment state machine (PRD §14.3, architecture.md).
 *
 * ```
 * pending ──submit proof──▶ submitted ──admin opens──▶ under_review
 *                 ▲                                      │
 *                 │                                      │
 *         resubmit (reason kept              ┌─────────────┴─────────────┐
 *         in audit log only)                 ▼                           ▼
 *                 └─────────────────── rejected            verified
 *                                              (activates enrolment)
 * ```
 *
 * Pure and Prisma-free on purpose, for the same reason `dsr-state.ts` is: every
 * status change is decided here and nowhere else, so the rules can be unit
 * tested without a database and a route handler can never quietly widen the
 * machine. `transitions.ts` is the only caller that writes the column.
 *
 * ## Two things this machine refuses that a naive implementation would allow
 *
 * 1. **Rejection only from `under_review`.** §14.2 puts the admin's open step
 *    between the queue and the decision, so a payment cannot be rejected by
 *    somebody who never looked at it. That is one extra click and it is what
 *    makes `opened_by` and `under_reviewed_at` mean something.
 * 2. **Verification only from `under_review`.** A payment cannot be approved
 *    straight out of the member's own submission, which would make the
 *    verification queue decorative.
 *
 * Resubmission (D-8) is the single back edge: `rejected → submitted` on the
 * *same row*, never a second `Payment`. The rejection reason is not cleared —
 * the audit log is the history, and a resubmitted row still carries why it
 * last bounced.
 */

import { PAYMENT_STATUSES, type PaymentStatus } from './types';

export type PaymentAction = 'submit' | 'open' | 'verify' | 'reject' | 'resubmit';

export const PAYMENT_TRANSITIONS: Readonly<
  Record<PaymentStatus, Partial<Record<PaymentAction, PaymentStatus>>>
> = {
  pending: { submit: 'submitted' },
  submitted: { open: 'under_review' },
  under_review: { verify: 'verified', reject: 'rejected' },
  // D-8: the same row goes back into the queue. `rejection_reason` is preserved.
  rejected: { resubmit: 'submitted' },
  verified: {},
};

/** Statuses that close a payment. They cannot be left. */
export const PAYMENT_TERMINAL_STATUSES: readonly PaymentStatus[] = ['verified'];

export type PaymentTransitionProblem =
  | { kind: 'unknown_status'; status: string }
  | { kind: 'unknown_action'; action: string }
  | { kind: 'terminal'; from: PaymentStatus }
  | { kind: 'not_allowed'; from: PaymentStatus; action: PaymentAction };

export type PaymentTransitionResult =
  | { ok: true; to: PaymentStatus }
  | { ok: false; problem: PaymentTransitionProblem; message: string };

/**
 * Decide whether `action` is legal from `from`, without touching the database.
 *
 * Returns a problem rather than throwing: a state machine is a gate, and the
 * caller turns a refusal into a user-facing message.
 */
export function resolveTransition(from: string, action: string): PaymentTransitionResult {
  if (!(PAYMENT_STATUSES as readonly string[]).includes(from)) {
    return {
      ok: false,
      problem: { kind: 'unknown_status', status: from },
      message: 'This payment has a status the system does not recognise.',
    };
  }
  if (!isPaymentAction(action)) {
    return {
      ok: false,
      problem: { kind: 'unknown_action', action },
      message: 'That is not a valid step for a payment.',
    };
  }

  const current = from as PaymentStatus;
  const to = PAYMENT_TRANSITIONS[current][action];
  if (!to) {
    return PAYMENT_TERMINAL_STATUSES.includes(current)
      ? {
          ok: false,
          problem: { kind: 'terminal', from: current },
          message: `This payment is already ${current} and cannot change.`,
        }
      : {
          ok: false,
          problem: { kind: 'not_allowed', from: current, action },
          message: `A ${current} payment cannot be ${PAST_TENSE[action]}.`,
        };
  }

  return { ok: true, to };
}

function isPaymentAction(value: string): value is PaymentAction {
  return (
    value === 'submit' ||
    value === 'open' ||
    value === 'verify' ||
    value === 'reject' ||
    value === 'resubmit'
  );
}

/** Readable phrasing for a refusal, keyed by the action that was refused. */
const PAST_TENSE: Record<PaymentAction, string> = {
  submit: 'submitted',
  open: 'opened for review',
  verify: 'verified',
  reject: 'rejected',
  resubmit: 'resubmitted',
};

/** Every action a given status permits. Drives what the admin UI renders. */
export function allowedActions(from: string): PaymentAction[] {
  if (!(PAYMENT_STATUSES as readonly string[]).includes(from)) return [];
  const row = PAYMENT_TRANSITIONS[from as PaymentStatus];
  return (['submit', 'open', 'verify', 'reject', 'resubmit'] as const).filter((a) => row[a]);
}
