/**
 * The single activation point (AGENTS.md §4, architecture.md).
 *
 * A paid-tier enrolment becomes `active` **only** when a linked payment reaches
 * `verified`. That rule lives here and nowhere else, so there is exactly one
 * code path that can grant entitlement and one place to audit when it was used.
 *
 * Two guards that look redundant and are not:
 *
 * 1. **The payment must already be `verified` in this transaction.** The caller
 *    is `verifyPayment`, which sets the status moments earlier, so re-reading it
 *    looks like ceremony. It is not: it means this function cannot be wired
 *    into a future caller — a refund flow, a data-migration script, a Phase 2
 *    gateway — and grant access to a member who has not paid. The check is on
 *    the row, not on the argument, so it cannot be satisfied by passing a
 *    payment id that was never verified.
 * 2. **Only a `pending_payment` enrolment moves.** Idempotent by design, per
 *    architecture.md. A second call returns `already_active` rather than
 *    re-writing timestamps or clobbering `completed_at` on a finished
 *    enrolment.
 *
 * The zero-cost O'Free exception (D-1) is deliberately **not** here. A free
 * enrolment activates at creation in `createPaidEnrolment`, because it has no
 * payment to key off. Putting that branch in this file would make "activated
 * without a verified payment" reachable from a function whose entire purpose is
 * to be the thing that cannot happen.
 */

import type { Prisma } from '@prisma/client';
import { PAYMENT_STATUSES } from './types';

type Tx = Prisma.TransactionClient;

export type ActivationOutcome =
  | { ok: true; outcome: 'activated' | 'already_active'; enrolmentId: string }
  | { ok: false; reason: 'no_enrolment' | 'payment_not_verified' | 'enrolment_missing' };

export async function activateEnrolment(
  tx: Tx,
  input: { paymentId: string; actorId: string },
): Promise<ActivationOutcome> {
  const payment = await tx.payment.findUnique({
    where: { id: input.paymentId },
    include: { enrolment: { select: { id: true, status: true, tierId: true } } },
  });

  if (!payment) {
    return { ok: false, reason: 'enrolment_missing' };
  }
  if (!payment.enrolmentId || !payment.enrolment) {
    // A payment with no enrolment is legitimate — it is a product payment, and
    // once D-10's Order model lands it will not activate anything either.
    return { ok: false, reason: 'no_enrolment' };
  }
  if (!(PAYMENT_STATUSES as readonly string[]).includes(payment.status)) {
    return { ok: false, reason: 'payment_not_verified' };
  }
  if (payment.status !== 'verified') {
    return { ok: false, reason: 'payment_not_verified' };
  }
  if (payment.enrolment.status !== 'pending_payment') {
    return { ok: true, outcome: 'already_active', enrolmentId: payment.enrolment.id };
  }

  await tx.enrolment.update({
    where: { id: payment.enrolment.id },
    data: { status: 'active' },
  });

  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: 'ENROLMENT_ACTIVATED',
      entityType: 'Enrolment',
      entityId: payment.enrolment.id,
      metadata: {
        paymentId: payment.id,
        tierId: payment.enrolment.tierId,
        amountKobo: payment.amountKobo,
        currency: payment.currency,
        trigger: 'payment_verified',
      },
    },
  });

  return { ok: true, outcome: 'activated', enrolmentId: payment.enrolment.id };
}
