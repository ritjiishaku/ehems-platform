/**
 * Read paths for payments: what a member sees about their own, and what an
 * admin sees in the verification queue.
 *
 * Neither of these writes a status. Reads live here rather than in the page
 * components so the admin queue's audit entry cannot be forgotten by a route
 * that is refactored later.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { PAYMENT_QUEUE_STATUSES, type PaymentStatus } from './types';

/** Pseudo entity id for the queue-level audit entry written on every admin read. */
const PAYMENT_QUEUE_ENTITY_ID = 'queue';

export type MemberPayment = {
  id: string;
  status: PaymentStatus;
  amountKobo: number;
  currency: string;
  enrolmentId: string | null;
  tierName: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  bankName: string | null;
  transferDate: Date | null;
  proofUploaded: boolean;
  rejectionReason: string | null;
  submittedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
};

export type AdminQueuePayment = MemberPayment & {
  memberName: string;
  memberEmail: string;
  /**
   * The tier's list price, so the queue can show "recorded ₦X / list ₦Y".
   *
   * security.md treats "confirm the amount matches the tier price before
   * verifying" as the control that stops a revenue leak. `verifyPayment` enforces
   * the part the system can check on its own (a payment never has a zero amount,
   * and a zero-cost tier never has a payment at all); the rest — recorded amount
   * against what actually landed in the bank, and against this list price — is the
   * comparison the verifier makes with the number in front of them. A queue that
   * shows only the amount cannot support that check.
   *
   * It is the *list* price, deliberately, not the amount this member was quoted.
   * An upgrade difference (BR-003) and a first-purchase discount (BR-005) both
   * mean a verified amount legitimately differs from the list price, so showing
   * it as if it were a discrepancy would train verifiers to wave real mismatches
   * through.
   */
  tierListPriceKobo: number | null;
  openedByName: string | null;
  underReviewedAt: Date | null;
  verifiedByName: string | null;
  /** The opaque storage key. Never a filesystem path — see `lib/payments/proofs.ts`. */
  proofUrl: string | null;
};

const ADMIN_QUEUE_INCLUDE = {
  user: { select: { name: true, email: true } },
  enrolment: { include: { tier: { select: { name: true, priceKobo: true } } } },
  openedByUser: { select: { name: true } },
  verifiedByUser: { select: { name: true } },
} satisfies Prisma.PaymentInclude;

/**
 * The shared row → shape mapping for both admin lists.
 *
 * One mapper, not two. The queue and the in-review list are the same projection
 * of the same table, and a field added to one and forgotten in the other is the
 * kind of divergence that only shows up as a missing column in a production
 * queue.
 */
function toAdminQueuePayment(
  payment: Prisma.PaymentGetPayload<{ include: typeof ADMIN_QUEUE_INCLUDE }>,
): AdminQueuePayment {
  return {
    id: payment.id,
    status: payment.status,
    amountKobo: payment.amountKobo,
    currency: payment.currency,
    enrolmentId: payment.enrolmentId,
    tierName: payment.enrolment?.tier.name ?? 'Tier purchase',
    tierListPriceKobo: payment.enrolment?.tier.priceKobo ?? null,
    paymentMethod: payment.paymentMethod,
    paymentReference: payment.paymentReference,
    bankName: payment.bankName,
    transferDate: payment.transferDate,
    proofUploaded: payment.proofUrl !== null,
    rejectionReason: payment.rejectionReason,
    submittedAt: payment.submittedAt,
    verifiedAt: payment.verifiedAt,
    createdAt: payment.createdAt,
    memberName: payment.user.name,
    memberEmail: payment.user.email,
    openedByName: payment.openedByUser?.name ?? null,
    underReviewedAt: payment.underReviewedAt,
    verifiedByName: payment.verifiedByUser?.name ?? null,
    proofUrl: payment.proofUrl,
  };
}

/**
 * A member's own payments, newest first.
 *
 * Scoped by `userId` in the query rather than filtered after the fetch, so a
 * member cannot reach another member's payments by passing a different id to a
 * server action.
 */
export async function listPaymentsForMember(userId: string): Promise<MemberPayment[]> {
  const payments = await prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { enrolment: { include: { tier: { select: { name: true } } } } },
  });

  return payments.map((payment) => ({
    id: payment.id,
    status: payment.status,
    amountKobo: payment.amountKobo,
    currency: payment.currency,
    enrolmentId: payment.enrolmentId,
    tierName: payment.enrolment?.tier.name ?? 'Tier purchase',
    paymentMethod: payment.paymentMethod,
    paymentReference: payment.paymentReference,
    bankName: payment.bankName,
    transferDate: payment.transferDate,
    proofUploaded: payment.proofUrl !== null,
    rejectionReason: payment.rejectionReason,
    submittedAt: payment.submittedAt,
    verifiedAt: payment.verifiedAt,
    createdAt: payment.createdAt,
  }));
}

/**
 * The verification queue, oldest first.
 *
 * Two decisions that are not obvious from the query:
 *
 * 1. **It shows `submitted` only** (`PAYMENT_QUEUE_STATUSES`). `under_review`
 *    means somebody has already opened the row. Hiding those is deliberate: the
 *    queue is "nobody has touched this yet", and a second admin picking up a row
 *    that is mid-review is exactly the race the conditional updates guard
 *    against, so the UI should not invite it.
 * 2. **It is audited.** Staff reading a member's financial record is itself an
 *    auditable event (SEC-007, and the ndpa-compliance rule that covers reads).
 *    One entry per page load, not one per row — a per-row entry would bury the
 *    trail under list traffic.
 */
export async function listPaymentsForVerificationQueue(
  actorId: string,
): Promise<AdminQueuePayment[]> {
  return prisma.$transaction(async (tx) => {
    const payments = await tx.payment.findMany({
      where: { status: { in: [...PAYMENT_QUEUE_STATUSES] } },
      orderBy: { createdAt: 'asc' },
      include: ADMIN_QUEUE_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'PAYMENT_QUEUE_VIEWED',
        entityType: 'Payment',
        // `entity_id` is NOT NULL, so a queue-wide read is attributed to a
        // stable pseudo-entity rather than being left unindexed.
        entityId: PAYMENT_QUEUE_ENTITY_ID,
        metadata: { resultCount: payments.length, statuses: [...PAYMENT_QUEUE_STATUSES] },
      },
    });

    return payments.map(toAdminQueuePayment);
  });
}

/**
 * Rows an admin has opened and not yet decided, so a second admin can see that
 * somebody else is mid-review instead of opening the same payment.
 */
export async function listPaymentsInReview(actorId: string): Promise<AdminQueuePayment[]> {
  return prisma.$transaction(async (tx) => {
    const payments = await tx.payment.findMany({
      where: { status: 'under_review' },
      orderBy: { underReviewedAt: 'asc' },
      include: ADMIN_QUEUE_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'PAYMENT_IN_REVIEW_VIEWED',
        entityType: 'Payment',
        entityId: PAYMENT_QUEUE_ENTITY_ID,
        metadata: { resultCount: payments.length },
      },
    });

    return payments.map(toAdminQueuePayment);
  });
}
