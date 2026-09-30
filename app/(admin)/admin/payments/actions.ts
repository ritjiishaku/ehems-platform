'use server';

/**
 * Admin payment verification actions.
 *
 * Authorisation here is `hasPermission(admin, 'payment.verify')`, **not** the
 * direct `requireRole('admin', 'super_admin')` the data-request actions use. PRD
 * §4.2 has a `Verify payment` row, so there is a permission key to check and the
 * matrix is the authority — D-18's direct role check was only justified by the
 * *absence* of a row. Two different answers to "who may verify a payment"
 * depending on which file you read would be worse than either.
 *
 * Ownership is deliberately not a check here: a payment belongs to the
 * institution, not to the member, so any verifier may act on any row. The status
 * machine, not an authoriser, is what stops two admins deciding the same payment
 * twice.
 *
 * NFR-008: verifying or rejecting a payment re-requires the admin's password.
 * Opening a payment for review does not — it moves no money and is reversible by
 * the same verifier who opened it, so a re-auth prompt on every queue click would
 * be friction that trains people to type their password carelessly. The decision
 * itself is the irreversible, money-adjacent half.
 */

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { verifyCurrentPassword } from '@/lib/auth/profile';
import { requireRole } from '@/lib/auth/rbac';
import { hasPermission } from '@/lib/permissions';
import { openForReview, rejectPayment, verifyPayment } from '@/lib/payments';
import { issueProofGrant } from '@/lib/payments/proof-grants';
import {
  openPaymentForReviewSchema,
  paymentDecisionSchema,
  paymentProofViewSchema,
} from '@/lib/validation/payment';

async function requireVerifier() {
  const admin = await requireRole('admin', 'super_admin');
  if (!hasPermission(admin, 'payment.verify')) {
    redirect('/admin?error=not-permitted');
  }
  return admin;
}

export async function openPaymentForReviewAction(formData: FormData): Promise<void> {
  const admin = await requireVerifier();
  await assertSameOrigin();

  const parsed = openPaymentForReviewSchema.safeParse({ paymentId: formData.get('paymentId') });
  if (!parsed.success) {
    redirect('/admin/payments?error=invalid-request');
  }

  const result = await openForReview(parsed.data.paymentId, admin.id);
  if (!result.ok) {
    redirect(`/admin/payments?error=${encodeURIComponent(result.message)}`);
  }
  redirect('/admin/payments?opened=1');
}

export async function decidePaymentAction(formData: FormData): Promise<void> {
  const admin = await requireVerifier();
  await assertSameOrigin();

  const parsed = paymentDecisionSchema.safeParse({
    paymentId: formData.get('paymentId'),
    decision: formData.get('decision'),
    reason: formData.get('reason') ?? '',
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) {
    redirect('/admin/payments?error=invalid-request');
  }

  // NFR-008, enforced here. `verifyCurrentPassword` runs a real Argon2id verify,
  // so a stolen session cookie alone is not enough to move money. A failed
  // re-auth deliberately says nothing about whether the payment exists.
  if (!(await verifyCurrentPassword(admin.id, parsed.data.password))) {
    redirect('/admin/payments?error=reauthentication-failed');
  }

  const result =
    parsed.data.decision === 'verify'
      ? await verifyPayment(parsed.data.paymentId, admin.id)
      : await rejectPayment(parsed.data.paymentId, admin.id, parsed.data.reason);

  if (!result.ok) {
    redirect(`/admin/payments?error=${encodeURIComponent(result.message)}`);
  }
  redirect(
    parsed.data.decision === 'verify' ? '/admin/payments?verified=1' : '/admin/payments?rejected=1',
  );
}

/**
 * Mint a 60-second grant so the browser can fetch the proof file.
 *
 * NFR-008 lists "viewing a member's payment proof file" as a sensitive
 * operation, and a `<a href>` cannot prompt for a password. So the password is
 * collected here, checked with a real Argon2id verify, and exchanged for a
 * signed short-lived grant that the route handler accepts. The grant is bound to
 * this payment *and* this admin, so it cannot be replayed against another
 * receipt or handed to a colleague who happens to hold the same permission.
 *
 * The proof is not read here. This action only decides whether the next request
 * is allowed to try.
 */
export async function viewPaymentProofAction(formData: FormData): Promise<void> {
  const admin = await requireVerifier();
  await assertSameOrigin();

  const parsed = paymentProofViewSchema.safeParse({
    paymentId: formData.get('paymentId'),
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) {
    redirect('/admin/payments?error=invalid-request');
  }

  if (!(await verifyCurrentPassword(admin.id, parsed.data.password))) {
    redirect('/admin/payments?error=reauthentication-failed');
  }

  const grant = issueProofGrant(parsed.data.paymentId, admin.id);
  redirect(
    `/api/payment-proof/${encodeURIComponent(parsed.data.paymentId)}?grant=${encodeURIComponent(grant)}`,
  );
}
