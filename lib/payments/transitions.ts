/**
 * The five payment transitions, and nothing else writes `Payment.status`.
 *
 * architecture.md is explicit: "Never mutate `Payment.status` from a route
 * handler, a component, or a server action. One module owns the machine." Every
 * function here follows the same shape:
 *
 *   1. load the row,
 *   2. ask `state.ts` whether the step is legal,
 *   3. apply the update **conditionally on the status we decided against**,
 *   4. write the audit entry,
 *   5. commit, then notify.
 *
 * Step 3 is the one that is easy to skip. Two admins acting on the same payment
 * at once would both pass step 2 and both write, so a `verified` and a `rejected`
 * could both be recorded against one row. Matching on the status we read makes
 * the second writer a no-op. `lib/ndpa/data-subject-requests.ts` does the same.
 *
 * Notifications fire *after* the commit, never inside the transaction, so a
 * provider failure cannot roll back a payment decision.
 *
 * ## Money
 *
 * Amounts are integer kobo throughout and are computed by `lib/pricing/`, never
 * here. Nothing in this file does arithmetic on an amount — it persists the
 * figure it is handed, which is what keeps BR-003 (upgrades priced off list
 * price) and BR-005 (one first-purchase discount) in one testable module.
 */

import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { sendNotification } from '@/lib/notifications';
import { settleOrderFromVerifiedPayment } from '@/lib/orders';
import type { Kobo } from '@/lib/pricing/types';
import { activateEnrolment } from './activate-enrolment';
import { resolveTransition, type PaymentAction } from './state';
import { isPaymentMethod, type PaymentMethod, type PaymentStatus } from './types';

type Tx = PrismaTypes.TransactionClient;

export type PaymentOutcome<T> = ({ ok: true } & T) | { ok: false; message: string };

/** The proof details a member supplies at submission time. */
export type ProofDetails = {
  paymentMethod: PaymentMethod;
  paymentReference: string;
  bankName: string | null;
  transferDate: Date;
  proofUrl: string;
};

const MAX_REFERENCE_LENGTH = 120;

// ---------------------------------------------------------------------------
// Purchase intent
// ---------------------------------------------------------------------------

export type PurchaseIntentInput = {
  userId: string;
  /** The tier the member is buying. Resolved from the code catalogue, not the body. */
  tierId: string;
  amountKobo: Kobo;
  /** A previous enrolment this purchase is an upgrade from (BR-004). */
  upgradeFromEnrolmentId?: string | null;
};

/**
 * Open a purchase: one enrolment, and for a paid tier one `pending` payment.
 *
 * The zero-cost case (D-1) is the confirmed exception to payment↔enrolment
 * separation: an O'Free enrolment becomes `active` immediately and **no**
 * `Payment` row is created. Creating a ₦0 row and auto-verifying it was the
 * rejected alternative — it pollutes the payment table with non-payments and
 * makes every revenue query wrong.
 *
 * `amountKobo` is passed in from `lib/pricing/` rather than recomputed here so
 * that the list-price and discount rules stay in one pure module with one set of
 * tests. The one thing asserted here is the invariant that makes the D-1 branch
 * safe: a payment exists if and only if the amount is above zero.
 */
export async function createPurchaseIntent(
  input: PurchaseIntentInput,
): Promise<PaymentOutcome<{ enrolmentId: string; paymentId: string | null }>> {
  const tier = await prisma.tier.findUnique({ where: { id: input.tierId } });
  if (!tier) return { ok: false, message: 'That tier is not available.' };

  if (tier.isFree !== (input.amountKobo === 0)) {
    // A price that disagrees with the tier's own free flag is a pricing bug or
    // a tampered amount. Refuse rather than guess which one is right.
    return { ok: false, message: 'That amount does not match the tier price.' };
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || user.deletedAt) return { ok: false, message: 'That account is not available.' };

  const create = () =>
    prisma.$transaction(async (tx) => {
      // A free purchase is idempotent too. Registration creates O'Free, and a
      // member may still click the tier card later; returning the existing active
      // enrolment is correct and avoids a second free entitlement.
      if (tier.isFree) {
        const existingFree = await tx.enrolment.findFirst({
          where: { userId: input.userId, tierId: input.tierId, status: 'active' },
          orderBy: { enrolledAt: 'asc' },
        });
        if (existingFree) {
          return { ok: true as const, enrolmentId: existingFree.id, paymentId: null };
        }
      }

      // A second click, a browser retry, or two tabs should return the one open
      // purchase intent rather than create a second enrolment and payment. The
      // partial database index below makes the same invariant hold under a race.
      if (!tier.isFree) {
        const existingPending = await tx.payment.findFirst({
          where: {
            userId: input.userId,
            status: 'pending',
          },
          select: { id: true, enrolmentId: true, enrolment: { select: { tierId: true } } },
        });
        if (existingPending?.enrolmentId) {
          if (existingPending.enrolment?.tierId !== input.tierId) {
            return {
              ok: false as const,
              message: 'Complete your existing pending payment before starting another purchase.',
            };
          }
          return {
            ok: true as const,
            enrolmentId: existingPending.enrolmentId,
            paymentId: existingPending.id,
          };
        }
      }

      const enrolment = await tx.enrolment.create({
        data: {
          userId: input.userId,
          tierId: input.tierId,
          // D-1: the free tier is active on creation. Everything else waits for a
          // verified payment and is flipped by activateEnrolment().
          status: tier.isFree ? 'active' : 'pending_payment',
          upgradeFromEnrolmentId: input.upgradeFromEnrolmentId ?? null,
        },
      });

      if (tier.isFree) {
        await tx.auditLog.create({
          data: {
            actorId: input.userId,
            action: 'ENROLMENT_ACTIVATED',
            entityType: 'Enrolment',
            entityId: enrolment.id,
            metadata: { tierId: input.tierId, trigger: 'zero_cost_d1_exception' },
          },
        });
        return { ok: true as const, enrolmentId: enrolment.id, paymentId: null };
      }

      const payment = await tx.payment.create({
        data: {
          userId: input.userId,
          enrolmentId: enrolment.id,
          amountKobo: input.amountKobo,
          currency: tier.currency,
          status: 'pending',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: 'PAYMENT_REQUESTED',
          entityType: 'Payment',
          entityId: payment.id,
          metadata: {
            enrolmentId: enrolment.id,
            tierId: input.tierId,
            amountKobo: input.amountKobo,
            currency: tier.currency,
          },
        },
      });

      return { ok: true as const, enrolmentId: enrolment.id, paymentId: payment.id };
    });

  try {
    return await create();
  } catch (error) {
    // The partial unique index is the race-safe backstop. The losing transaction
    // is aborted, so find the winner outside that failed transaction and return
    // it as the idempotent result.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      !tier.isFree
    ) {
      const existingPending = await prisma.payment.findFirst({
        where: {
          userId: input.userId,
          status: 'pending',
        },
        select: { id: true, enrolmentId: true, enrolment: { select: { tierId: true } } },
      });
      if (existingPending?.enrolmentId) {
        if (existingPending.enrolment?.tierId !== input.tierId) {
          return {
            ok: false,
            message: 'Complete your existing pending payment before starting another purchase.',
          };
        }
        return {
          ok: true,
          enrolmentId: existingPending.enrolmentId,
          paymentId: existingPending.id,
        };
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Member transitions
// ---------------------------------------------------------------------------

type OwnedPayment = NonNullable<Awaited<ReturnType<Tx['payment']['findUnique']>>>;

async function loadOwnedPayment(
  tx: Tx,
  paymentId: string,
  userId: string,
): Promise<OwnedPayment | null> {
  const payment = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;
  if (payment.userId !== userId) return null;
  return payment;
}

/**
 * Shared body of `submitProof` and `resubmitProof`.
 *
 * They differ only in which action they ask `state.ts` about, so the proof
 * validation, the conditional update, and the audit entry are written once.
 */
async function applyProof(input: {
  paymentId: string;
  userId: string;
  action: Extract<PaymentAction, 'submit' | 'resubmit'>;
  proof: ProofDetails;
}): Promise<PaymentOutcome<{ status: PaymentStatus }>> {
  const { proof } = input;

  // Shape-level checks that belong to the domain rather than the Zod schema:
  // the schema ships to the browser, so a "bank name is required for a transfer"
  // rule written there is disclosed and bypassable (AGENTS.md §7).
  if (!isPaymentMethod(proof.paymentMethod)) {
    return { ok: false, message: 'Choose how you paid.' };
  }
  if (proof.paymentReference.trim().length === 0) {
    return { ok: false, message: 'Enter the reference your bank or provider gave you.' };
  }
  if (proof.paymentReference.length > MAX_REFERENCE_LENGTH) {
    return { ok: false, message: `Keep the reference under ${MAX_REFERENCE_LENGTH} characters.` };
  }
  if (proof.paymentMethod !== 'cash' && !proof.bankName?.trim()) {
    return { ok: false, message: 'Name the bank or mobile money provider you paid to.' };
  }
  if (!proof.proofUrl.trim()) {
    return { ok: false, message: 'Upload proof of payment before submitting.' };
  }
  if (proof.transferDate.getTime() > Date.now()) {
    return { ok: false, message: 'A transfer date cannot be in the future.' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await loadOwnedPayment(tx, input.paymentId, input.userId);
    if (!payment) {
      return { ok: false as const, message: 'We could not find that payment on your account.' };
    }

    const verdict = resolveTransition(payment.status, input.action);
    if (!verdict.ok) {
      return { ok: false as const, message: verdict.message };
    }

    // Resubmission overwrites the proof but leaves `rejection_reason` in place
    // (D-8): the audit log is the history, and an admin picking this up still
    // needs to see why it last bounced.
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: {
        status: verdict.to,
        paymentMethod: proof.paymentMethod,
        paymentReference: proof.paymentReference.trim(),
        bankName: proof.bankName?.trim() || null,
        transferDate: proof.transferDate,
        proofUrl: proof.proofUrl,
        submittedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      return {
        ok: false as const,
        message: 'Someone else updated this payment a moment ago. Reload and try again.',
      };
    }

    await tx.auditLog.create({
      data: {
        actorId: input.userId,
        action: input.action === 'submit' ? 'PAYMENT_PROOF_SUBMITTED' : 'PAYMENT_PROOF_RESUBMITTED',
        entityType: 'Payment',
        entityId: payment.id,
        metadata: {
          from: payment.status,
          to: verdict.to,
          amountKobo: payment.amountKobo,
          currency: payment.currency,
          paymentMethod: proof.paymentMethod,
          // Recorded on the resubmission too: the reason is deliberately still
          // on the row, and an audit reader needs to see what it was.
          priorRejectionReason: payment.rejectionReason,
        },
      },
    });

    const member = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, name: true },
    });
    const enrolment = payment.enrolmentId
      ? await tx.enrolment.findUnique({
          where: { id: payment.enrolmentId },
          include: { tier: { select: { name: true } } },
        })
      : null;

    return {
      ok: true as const,
      status: verdict.to,
      recipient: member ? { userId: member.id, email: member.email, name: member.name } : null,
      tierName: enrolment?.tier.name ?? 'your tier',
      amountKobo: payment.amountKobo,
    };
  });

  if (!result.ok) return result;

  // After the commit, so a provider outage cannot un-submit the proof.
  if (result.recipient) {
    await sendNotification({
      event: 'PAYMENT_SUBMITTED',
      recipient: result.recipient,
      payload: {
        name: result.recipient.name,
        tierName: result.tierName,
        amountKobo: result.amountKobo,
        paymentId: input.paymentId,
      },
    }).catch(() => null);
  }

  return { ok: true, status: result.status };
}

/** `pending → submitted`. First proof submission. */
export async function submitProof(
  paymentId: string,
  userId: string,
  proof: ProofDetails,
): Promise<PaymentOutcome<{ status: PaymentStatus }>> {
  return applyProof({ paymentId, userId, action: 'submit', proof });
}

/** `rejected → submitted`, on the same row (D-8). */
export async function resubmitProof(
  paymentId: string,
  userId: string,
  proof: ProofDetails,
): Promise<PaymentOutcome<{ status: PaymentStatus }>> {
  return applyProof({ paymentId, userId, action: 'resubmit', proof });
}

// ---------------------------------------------------------------------------
// Admin transitions
// ---------------------------------------------------------------------------

/** `submitted → under_review`. The admin has opened it; nobody has decided yet. */
export async function openForReview(
  paymentId: string,
  adminId: string,
): Promise<PaymentOutcome<{ status: PaymentStatus }>> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return { ok: false as const, message: 'That payment no longer exists.' };

    const verdict = resolveTransition(payment.status, 'open');
    if (!verdict.ok) return { ok: false as const, message: verdict.message };

    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: { status: verdict.to, openedBy: adminId, underReviewedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return {
        ok: false as const,
        message: 'Someone else updated this payment a moment ago. Reload and try again.',
      };
    }

    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'PAYMENT_OPENED_FOR_REVIEW',
        entityType: 'Payment',
        entityId: payment.id,
        metadata: { from: payment.status, to: verdict.to, amountKobo: payment.amountKobo },
      },
    });

    return { ok: true as const, status: verdict.to };
  });
}

/**
 * `under_review → verified`, and the one place an enrolment is activated.
 *
 * The `rejection_reason` is cleared here and only here. D-8 requires the reason
 * to survive a *resubmission* so an admin can see the history on the row; once
 * the payment is verified, leaving "rejected for: wrong amount" sitting next to a
 * verified payment is actively misleading. The audit log still holds the reason.
 */
export async function verifyPayment(
  paymentId: string,
  adminId: string,
): Promise<PaymentOutcome<{ status: PaymentStatus; enrolmentId: string | null }>> {
  return prisma
    .$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return { ok: false as const, message: 'That payment no longer exists.' };

      const verdict = resolveTransition(payment.status, 'verify');
      if (!verdict.ok) return { ok: false as const, message: verdict.message };

      // security.md: "Confirm the amount matches the tier price before verifying.
      // An admin approving a mismatched amount is a revenue leak."
      //
      // This is the half of that check the system can enforce without guessing.
      // The *full* comparison — recorded amount vs what actually landed in the
      // bank — is the human one, and the queue deliberately shows the tier's list
      // price beside the amount for exactly that purpose. What is checkable here
      // is the invariant `createPurchaseIntent` establishes: a payment exists if
      // and only if the amount is above zero, and never for a zero-cost tier
      // (D-1 creates no Payment at all). A row that breaks it is a pricing or
      // data-integrity bug, and verifying it would activate a paid enrolment for
      // free.
      if (payment.amountKobo <= 0) {
        return {
          ok: false as const,
          message: 'This payment records a zero amount, which cannot be verified. Reject it.',
        };
      }
      if (payment.enrolmentId) {
        const enrolmentTier = await tx.enrolment.findUnique({
          where: { id: payment.enrolmentId },
          select: { tier: { select: { isFree: true, name: true } } },
        });
        if (enrolmentTier?.tier.isFree) {
          return {
            ok: false as const,
            message: `${enrolmentTier.tier.name} is a zero-cost tier and should not have a payment. Reject this and raise it with the team.`,
          };
        }
      }

      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: payment.status },
        data: {
          status: verdict.to,
          verifiedAt: new Date(),
          verifiedBy: adminId,
          rejectionReason: null,
        },
      });
      if (claimed.count !== 1) {
        return {
          ok: false as const,
          message: 'Someone else updated this payment a moment ago. Reload and try again.',
        };
      }

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'PAYMENT_VERIFIED',
          entityType: 'Payment',
          entityId: payment.id,
          metadata: {
            from: payment.status,
            to: verdict.to,
            amountKobo: payment.amountKobo,
            currency: payment.currency,
            paymentMethod: payment.paymentMethod,
            paymentReference: payment.paymentReference,
            transferDate: payment.transferDate?.toISOString() ?? null,
          },
        },
      });

      // SEC-007 + AGENTS.md §4: entitlement comes from this, and only this.
      const activation = await activateEnrolment(tx, { paymentId: payment.id, actorId: adminId });
      if (!activation.ok && activation.reason === 'payment_not_verified') {
        // Unreachable: the row was just set to verified above. Throwing rather
        // than returning keeps a broken invariant loud instead of silent.
        throw new Error(`Payment ${payment.id} could not be activated after verification`);
      }

      // The order equivalent of the line above. A product order becomes `paid`
      // here and nowhere else — no admin action does it — so "did the money
      // arrive?" has exactly one answer (FR-049, BR-013).
      const settledOrderId = await settleOrderFromVerifiedPayment(
        tx,
        {
          id: payment.id,
          orderId: payment.orderId,
          userId: payment.userId,
          amountKobo: payment.amountKobo,
        },
        adminId,
      );

      const member = await tx.user.findUnique({
        where: { id: payment.userId },
        select: { id: true, email: true, name: true },
      });
      const enrolment = payment.enrolmentId
        ? await tx.enrolment.findUnique({
            where: { id: payment.enrolmentId },
            include: { tier: { select: { name: true } } },
          })
        : null;

      return {
        ok: true as const,
        status: verdict.to,
        enrolmentId: activation.ok ? activation.enrolmentId : null,
        orderId: settledOrderId ? payment.orderId : null,
        recipient: member ? { userId: member.id, email: member.email, name: member.name } : null,
        tierName: enrolment?.tier.name ?? 'your tier',
      };
    })
    .then(async (result) => {
      if (!result.ok || !result.recipient) return result;
      await sendNotification({
        event: 'PAYMENT_VERIFIED',
        recipient: result.recipient,
        payload: {
          name: result.recipient.name,
          tierName: result.tierName,
          enrolmentId: result.enrolmentId ?? '',
        },
      }).catch(() => null);
      return { ok: true as const, status: result.status, enrolmentId: result.enrolmentId };
    });
}

/**
 * `under_review → rejected`.
 *
 * A reason is mandatory and is stored on the row, not only in the audit log,
 * because it is the thing the member has to act on and the notification quotes
 * it back to them.
 */
export async function rejectPayment(
  paymentId: string,
  adminId: string,
  reason: string,
): Promise<PaymentOutcome<{ status: PaymentStatus }>> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false, message: 'A rejection needs a reason the member can act on.' };
  }

  return prisma
    .$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return { ok: false as const, message: 'That payment no longer exists.' };

      const verdict = resolveTransition(payment.status, 'reject');
      if (!verdict.ok) return { ok: false as const, message: verdict.message };

      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: payment.status },
        data: { status: verdict.to, rejectionReason: trimmed },
      });
      if (claimed.count !== 1) {
        return {
          ok: false as const,
          message: 'Someone else updated this payment a moment ago. Reload and try again.',
        };
      }

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'PAYMENT_REJECTED',
          entityType: 'Payment',
          entityId: payment.id,
          metadata: {
            from: payment.status,
            to: verdict.to,
            amountKobo: payment.amountKobo,
            currency: payment.currency,
            rejectionReason: trimmed,
          },
        },
      });

      const member = await tx.user.findUnique({
        where: { id: payment.userId },
        select: { id: true, email: true, name: true },
      });
      const enrolment = payment.enrolmentId
        ? await tx.enrolment.findUnique({
            where: { id: payment.enrolmentId },
            include: { tier: { select: { name: true } } },
          })
        : null;

      return {
        ok: true as const,
        status: verdict.to,
        recipient: member ? { userId: member.id, email: member.email, name: member.name } : null,
        tierName: enrolment?.tier.name ?? 'your tier',
        reason: trimmed,
      };
    })
    .then(async (result) => {
      if (!result.ok || !result.recipient) return result;
      await sendNotification({
        event: 'PAYMENT_REJECTED',
        recipient: result.recipient,
        payload: {
          name: result.recipient.name,
          tierName: result.tierName,
          rejectionReason: result.reason,
        },
      }).catch(() => null);
      return { ok: true as const, status: result.status };
    });
}
