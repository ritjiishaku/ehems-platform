import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/client';
import { activateEnrolment } from '@/lib/payments/activate-enrolment';
import { listPaymentsForVerificationQueue, listPaymentsInReview } from '@/lib/payments/queries';
import {
  createPurchaseIntent,
  openForReview,
  rejectPayment,
  resubmitProof,
  submitProof,
  verifyPayment,
  type ProofDetails,
} from '@/lib/payments/transitions';
import { updatePaymentSettings } from '@/lib/payments/settings';
import { kobo } from '@/lib/pricing/tiers';

/**
 * The manual payment workflow against a real PostgreSQL database.
 *
 * The unit test in `payment-workflow.test.ts` proves the state machine; this one
 * proves the parts that only exist once there are rows: the D-1 activation
 * exception, that verification is the *only* thing that activates an enrolment,
 * that a resubmission reuses the same row, and that every transition leaves an
 * audit trail.
 *
 * Tests share a small number of journeys and assert along the way rather than
 * each building its own fixtures, because a payment walk is a sequence — the
 * order of the `it` blocks is the order of the workflow.
 */

const suffix = randomBytes(4).toString('hex');
let adminId = '';
let memberId = '';
let otherMemberId = '';

const paidTierId = 'tier-basic-iii';
const freeTierId = 'tier-ofree';

function proof(overrides: Partial<ProofDetails> = {}): ProofDetails {
  return {
    paymentMethod: 'bank_transfer',
    paymentReference: 'TRF/2026/0001',
    bankName: 'Access Bank',
    transferDate: new Date('2026-09-20T09:00:00Z'),
    proofUrl: `proof/${suffix}/receipt.enc`,
    ...overrides,
  };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: `pay-admin-${suffix}@example.test`,
      name: 'Payments Admin',
      passwordHash: 'x',
      roleId: 'role-super-admin',
    },
  });
  const member = await prisma.user.create({
    data: {
      email: `pay-member-${suffix}@example.test`,
      name: 'Paying Member',
      passwordHash: 'x',
    },
  });
  const other = await prisma.user.create({
    data: {
      email: `pay-other-${suffix}@example.test`,
      name: 'Other Member',
      passwordHash: 'x',
    },
  });
  adminId = admin.id;
  memberId = member.id;
  otherMemberId = other.id;
});

afterAll(async () => {
  // Payments and enrolments are financial records: they are never deleted by the
  // erasure path, so this test cleans up by removing only the rows it created
  // and anonymising the users, which is the same treatment production gets.
  const members = await prisma.user.findMany({
    where: { email: { endsWith: `@example.test` }, id: { in: [adminId, memberId, otherMemberId] } },
    select: { id: true, enrolments: { select: { id: true } } },
  });
  const enrolmentIds = members.flatMap((m) => m.enrolments.map((e) => e.id));

  if (enrolmentIds.length > 0) {
    await prisma.payment.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
    await prisma.enrolment.deleteMany({ where: { id: { in: enrolmentIds } } });
  }

  for (const id of [adminId, memberId, otherMemberId]) {
    await prisma.user
      .update({
        where: { id },
        data: {
          email: `erased-${id.slice(-6)}-${suffix}@anonymised.invalid`,
          name: 'Erased user',
          deletedAt: new Date(),
        },
      })
      .catch(() => null);
  }
  await prisma.$disconnect();
});

describe('D-1: the zero-cost tier activates on creation and creates no payment', () => {
  it("activates O'Free immediately with no Payment row", async () => {
    const result = await createPurchaseIntent({
      userId: memberId,
      tierId: freeTierId,
      amountKobo: kobo(0),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paymentId).toBeNull();

    const enrolment = await prisma.enrolment.findUniqueOrThrow({
      where: { id: result.enrolmentId },
    });
    expect(enrolment.status).toBe('active');

    const payments = await prisma.payment.count({ where: { enrolmentId: enrolment.id } });
    expect(payments).toBe(0);
  });

  it('refuses an amount that contradicts the tier price', async () => {
    // The guard that makes the D-1 branch safe: a ₦0 payment must only ever
    // belong to a zero-cost tier, and a free enrolment must never be priced.
    const freeWithMoney = await createPurchaseIntent({
      userId: otherMemberId,
      tierId: freeTierId,
      amountKobo: kobo(30_000_000),
    });
    expect(freeWithMoney.ok).toBe(false);

    const paidForFree = await createPurchaseIntent({
      userId: otherMemberId,
      tierId: paidTierId,
      amountKobo: kobo(0),
    });
    expect(paidForFree.ok).toBe(false);
  });
});

describe('a paid purchase waits for a verified payment', () => {
  let paymentId = '';
  let enrolmentId = '';

  it('creates a pending_payment enrolment and a pending payment', async () => {
    const result = await createPurchaseIntent({
      userId: memberId,
      tierId: paidTierId,
      amountKobo: kobo(55_000_000),
    });

    expect(result.ok).toBe(true);
    if (!result.ok || !result.paymentId) return;
    paymentId = result.paymentId;
    enrolmentId = result.enrolmentId;

    const enrolment = await prisma.enrolment.findUniqueOrThrow({ where: { id: enrolmentId } });
    expect(enrolment.status).toBe('pending_payment');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('pending');
    expect(payment.amountKobo).toBe(55_000_000);
    expect(payment.currency).toBe('NGN');
    // D-9: proof fields are null while the row awaits the upload.
    expect(payment.proofUrl).toBeNull();
    expect(payment.paymentReference).toBeNull();
  });

  it('returns the existing pending intent when the member retries the same purchase', async () => {
    const first = await createPurchaseIntent({
      userId: otherMemberId,
      tierId: paidTierId,
      amountKobo: kobo(55_000_000),
    });
    expect(first.ok).toBe(true);
    if (!first.ok || !first.paymentId) return;

    const retry = await createPurchaseIntent({
      userId: otherMemberId,
      tierId: paidTierId,
      amountKobo: kobo(55_000_000),
    });
    expect(retry).toEqual(first);
    expect(
      await prisma.payment.count({ where: { userId: otherMemberId, status: 'pending' } }),
    ).toBe(1);
  });

  it('is invisible to the admin queue until proof is submitted', async () => {
    const queue = await listPaymentsForVerificationQueue(adminId);
    expect(queue.some((row) => row.id === paymentId)).toBe(false);
  });

  it('refuses proof from a member who does not own the payment', async () => {
    const result = await submitProof(paymentId, otherMemberId, proof());
    expect(result.ok).toBe(false);
  });

  it('refuses a transfer dated in the future', async () => {
    const result = await submitProof(
      paymentId,
      memberId,
      proof({ transferDate: new Date(Date.now() + 86_400_000) }),
    );
    expect(result.ok).toBe(false);
  });

  it('refuses a bank transfer with no bank named', async () => {
    const result = await submitProof(paymentId, memberId, proof({ bankName: '  ' }));
    expect(result.ok).toBe(false);
  });

  it('refuses a submission with no reference', async () => {
    const result = await submitProof(paymentId, memberId, proof({ paymentReference: '   ' }));
    expect(result.ok).toBe(false);
  });

  it('accepts the submission and moves pending -> submitted', async () => {
    const result = await submitProof(paymentId, memberId, proof());
    expect(result.ok).toBe(true);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('submitted');
    expect(payment.submittedAt).not.toBeNull();
    expect(payment.proofUrl).toBe(`proof/${suffix}/receipt.enc`);
  });

  it('writes an audit entry for the submission', async () => {
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: paymentId, action: 'PAYMENT_PROOF_SUBMITTED' },
    });
    expect(audit.actorId).toBe(memberId);
  });

  it('appears in the admin queue, and the read is audited', async () => {
    const queue = await listPaymentsForVerificationQueue(adminId);
    expect(queue.some((row) => row.id === paymentId)).toBe(true);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: 'queue', action: 'PAYMENT_QUEUE_VIEWED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.actorId).toBe(adminId);
  });

  it('refuses a verification before an admin opens it', async () => {
    const result = await verifyPayment(paymentId, adminId);
    expect(result.ok).toBe(false);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('submitted');
  });

  it('records the reviewer when the admin opens it', async () => {
    const result = await openForReview(paymentId, adminId);
    expect(result.ok).toBe(true);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('under_review');
    expect(payment.openedBy).toBe(adminId);
    expect(payment.underReviewedAt).not.toBeNull();
  });

  it('leaves an opened payment out of the untouched queue', async () => {
    // Otherwise two admins open the same row and race each other.
    const queue = await listPaymentsForVerificationQueue(adminId);
    expect(queue.some((row) => row.id === paymentId)).toBe(false);

    const inReview = await listPaymentsInReview(adminId);
    expect(inReview.some((row) => row.id === paymentId)).toBe(true);
    expect(inReview.find((row) => row.id === paymentId)?.openedByName).toBe('Payments Admin');
  });

  it('refuses a rejection with no reason', async () => {
    const result = await rejectPayment(paymentId, adminId, '   ');
    expect(result.ok).toBe(false);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('under_review');
  });

  it('rejects with a reason stored on the row for the member to read', async () => {
    const result = await rejectPayment(
      paymentId,
      adminId,
      'The amount does not match the tier price.',
    );
    expect(result.ok).toBe(true);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('rejected');
    expect(payment.rejectionReason).toBe('The amount does not match the tier price.');
  });

  it('leaves the enrolment pending after a rejection', async () => {
    const enrolment = await prisma.enrolment.findUniqueOrThrow({ where: { id: enrolmentId } });
    expect(enrolment.status).toBe('pending_payment');
  });

  it('resubmits on the same row and keeps the rejection reason (D-8)', async () => {
    const before = await prisma.payment.count({ where: { enrolmentId } });

    const result = await resubmitProof(
      paymentId,
      memberId,
      proof({ paymentReference: 'TRF/2026/0002' }),
    );
    expect(result.ok).toBe(true);

    // One row per purchase intent, not one per submission attempt.
    expect(await prisma.payment.count({ where: { enrolmentId } })).toBe(before);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('submitted');
    expect(payment.paymentReference).toBe('TRF/2026/0002');
    // The reason survives the resubmission so the next admin can see the history.
    expect(payment.rejectionReason).toBe('The amount does not match the tier price.');
  });

  it('records the prior reason on the resubmission audit entry', async () => {
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: paymentId, action: 'PAYMENT_PROOF_RESUBMITTED' },
    });
    const metadata = audit.metadata as { priorRejectionReason?: string };
    expect(metadata.priorRejectionReason).toBe('The amount does not match the tier price.');
  });

  it('refuses to resubmit a payment that is not rejected', async () => {
    const result = await resubmitProof(paymentId, memberId, proof());
    expect(result.ok).toBe(false);
  });

  it('activates the enrolment on verification and nothing else does', async () => {
    await openForReview(paymentId, adminId);
    const result = await verifyPayment(paymentId, adminId);
    expect(result.ok).toBe(true);

    const enrolment = await prisma.enrolment.findUniqueOrThrow({ where: { id: enrolmentId } });
    expect(enrolment.status).toBe('active');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('verified');
    expect(payment.verifiedBy).toBe(adminId);
    expect(payment.verifiedAt).not.toBeNull();
    // D-8 said the reason survives a *resubmission*; once verified, leaving it
    // beside a verified payment would mislead the next reader.
    expect(payment.rejectionReason).toBeNull();
  });

  it('writes both the verification and the activation audit entries', async () => {
    const verified = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: paymentId, action: 'PAYMENT_VERIFIED' },
    });
    expect(verified.actorId).toBe(adminId);

    const activated = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: enrolmentId, action: 'ENROLMENT_ACTIVATED' },
    });
    expect(activated.actorId).toBe(adminId);
    const metadata = activated.metadata as { trigger?: string };
    expect(metadata.trigger).toBe('payment_verified');
  });

  it('refuses to verify twice', async () => {
    const result = await verifyPayment(paymentId, adminId);
    expect(result.ok).toBe(false);
  });

  it('makes activation idempotent, because a refund flow may call it twice', async () => {
    const outcome = await prisma.$transaction((tx) =>
      activateEnrolment(tx, { paymentId, actorId: adminId }),
    );
    expect(outcome).toEqual({ ok: true, outcome: 'already_active', enrolmentId });

    const activations = await prisma.auditLog.count({
      where: { entityId: enrolmentId, action: 'ENROLMENT_ACTIVATED' },
    });
    expect(activations).toBe(1);
  });

  it('refuses to activate from an unverified payment', async () => {
    // The guard that survives into Phase 2: a future gateway, a data migration,
    // or a careless script cannot grant entitlement by naming a payment id.
    const second = await createPurchaseIntent({
      userId: otherMemberId,
      tierId: paidTierId,
      amountKobo: kobo(30_000_000),
    });
    expect(second.ok).toBe(true);
    if (!second.ok || !second.paymentId) return;
    const secondPaymentId = second.paymentId;

    const outcome = await prisma.$transaction((tx) =>
      activateEnrolment(tx, { paymentId: secondPaymentId, actorId: adminId }),
    );
    expect(outcome).toEqual({ ok: false, reason: 'payment_not_verified' });

    const enrolment = await prisma.enrolment.findUniqueOrThrow({
      where: { id: second.enrolmentId },
    });
    expect(enrolment.status).toBe('pending_payment');
  });

  it('updates payment settings atomically and audits changed keys without secrets', async () => {
    const currentMode = await prisma.systemSetting.findUnique({
      where: { key: 'payment.instructions.mode' },
      select: { value: true },
    });
    const nextMode = currentMode?.value === 'live' ? 'disabled' : 'live';

    await updatePaymentSettings(adminId, {
      mode: nextMode,
      bankName: 'EHEMS TEST BANK',
      accountName: 'EHEMS TEST ACCOUNT',
      accountNumber: '0000000000',
      referenceFormat: 'TEST-{memberId}',
      acceptAnyBank: true,
      mobileMoneyEnabled: false,
      mobileMoneyProvider: '',
      mobileMoneyNumber: '',
      mobileMoneyAccountName: '',
      supportName: 'EHEMS Test Support',
      supportPhone: '+2348000000000',
      supportEmail: 'payments@example.invalid',
      proofRetentionMonths: 24,
    });

    const setting = await prisma.systemSetting.findUniqueOrThrow({
      where: { key: 'payment.instructions.mode' },
    });
    expect(setting.value).toBe(nextMode);
    expect(setting.updatedBy).toBe(adminId);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'payment.settings.change', actorId: adminId },
      orderBy: { createdAt: 'desc' },
    });
    const metadata = audit.metadata as { changedKeys?: string[]; newMode?: string };
    expect(metadata.changedKeys).toContain('payment.instructions.mode');
    expect(metadata.newMode).toBe(nextMode);
    expect(JSON.stringify(metadata)).not.toContain('0000000000');
  });
});
