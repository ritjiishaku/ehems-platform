/**
 * The payment vocabulary, mirrored from PRD §14.3 / §14.4 / §16.4.
 *
 * These constants are deliberately independent of `@prisma/client`. `state.ts`
 * must stay importable without a database so the state machine can be unit
 * tested, and the admin pages must be able to render a status label without
 * booting Prisma. `test/payment-workflow.test.ts` asserts that this union and
 * the generated `PaymentStatus` enum have exactly the same members, so the copy
 * cannot drift from the column.
 *
 * Five statuses, per §14.3. Do not rename, add, or collapse them.
 */

export const PAYMENT_STATUSES = [
  'pending',
  'submitted',
  'under_review',
  'verified',
  'rejected',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Awaiting proof',
  submitted: 'Submitted',
  under_review: 'Under review',
  verified: 'Verified',
  rejected: 'Rejected',
};

/**
 * A payment sitting in the admin's queue: submitted but not yet opened.
 *
 * `under_review` is deliberately absent. §14.2 puts the admin's *open* step
 * between the queue and the decision, and architecture.md says `under_review`
 * "is set when an admin opens the payment in the verification queue — not on
 * submission". A queue that showed under-review rows would hide the fact that
 * somebody had already picked them up.
 */
export const PAYMENT_QUEUE_STATUSES: readonly PaymentStatus[] = ['submitted'];

/** Statuses a member cannot change. `verified` is an outcome, not a step. */
export const PAYMENT_MEMBER_ACTIONABLE_STATUSES: readonly PaymentStatus[] = ['pending', 'rejected'];

/** PRD §14.4. `cash` is an in-person handover the admin records by hand. */
export const PAYMENT_METHODS = ['bank_transfer', 'mobile_money', 'cash'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  mobile_money: 'Mobile money',
  cash: 'Cash',
};

/**
 * PRD §16.2 enrolment statuses.
 *
 * `Enrolment.status` is a plain `String` column, not a Prisma enum, because
 * changing that column type is a separate migration with its own data
 * implications. Until then this union is the single place the allowed values
 * are written down, and the only writer of the column is
 * `activate-enrolment.ts` / the completion service.
 */
export const ENROLMENT_STATUSES = [
  'pending_payment',
  'active',
  'completed',
  'expired',
  'cancelled',
] as const;

export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];

export const ENROLMENT_STATUS_LABELS: Record<EnrolmentStatus, string> = {
  pending_payment: 'Awaiting payment',
  active: 'Active',
  completed: 'Completed',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/**
 * BR-008, the completion gate.
 *
 * Attendance is a cached percentage, so the number is an input to the decision
 * rather than the decision itself. 60% is the PRD's floor, not a target, and an
 * admin marks completion by hand regardless (BR-009) — this constant exists so
 * the gate is one number in one file rather than a literal in a route handler.
 */
export const MINIMUM_ATTENDANCE_PERCENT = 60;
