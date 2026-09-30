'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole, requireSession } from '@/lib/auth/rbac';
import { parseWatDateInput } from '@/lib/format';
import {
  createPurchaseIntent,
  getPaymentInstructions,
  priceTierForMember,
  resubmitProofUpload,
  submitProofUpload,
} from '@/lib/payments';
import { isTierId } from '@/lib/pricing/tiers';
import { paymentProofSchema, purchaseIntentSchema } from '@/lib/validation/payment';

/**
 * Member-side payment actions.
 *
 * These three functions contain no business logic. Each one authorises, parses,
 * delegates, and turns the result into a redirect. Three reasons that matters:
 *
 * 1. **No amount crosses the boundary.** `startPurchaseAction` takes a tier id
 *    and nothing else; `priceTierForMember` re-derives the figure from
 *    `lib/pricing/`. `purchaseIntentSchema` has no amount field on purpose — a
 *    form that accepted one is a form a member can edit to ₦1.
 * 2. **The file is validated, encrypted, and only then does the status move.**
 *    That is `lib/payments/proof-submission.ts`; this file never sees the bytes.
 * 3. **Ownership is checked inside the transaction**, in `submitProof`, not here.
 *    A member who posts another member's payment id gets a refusal, not a
 *    transition.
 *
 * Every branch ends in `redirect()`, including the error branches, so a
 * double-submitted form cannot replay an action.
 */

function withError(message: string): never {
  redirect(`/dashboard/payments?error=${encodeURIComponent(message)}`);
}

export async function startPurchaseAction(formData: FormData): Promise<void> {
  const member = await requireRole('member', 'mentor', 'admin', 'super_admin');
  await assertSameOrigin();

  const parsed = purchaseIntentSchema.safeParse({ tierId: formData.get('tierId') });
  if (!parsed.success) {
    withError('Choose a tier to continue.');
  }
  if (!isTierId(parsed.data.tierId)) {
    // BR-016. A retired or invented tier id never reaches the pricing code.
    withError('That tier is not available.');
  }

  const priced = await priceTierForMember(member.id, parsed.data.tierId);
  if (!priced) {
    withError('That tier is not available right now. Please contact the EHEMS team.');
  }

  if (!priced.isFree) {
    const instructions = await getPaymentInstructions();
    if (!instructions.state.acceptsUploads || !instructions.configured) {
      withError('Payment instructions are not available yet. Please contact the EHEMS team.');
    }
  }

  const result = await createPurchaseIntent({
    userId: member.id,
    tierId: priced.tierId,
    amountKobo: priced.amountKobo,
    upgradeFromEnrolmentId: priced.upgradeFromEnrolmentId,
  });

  if (!result.ok) {
    withError(result.message);
  }

  // D-1: a zero-cost enrolment activates on creation and has no payment to wait
  // on, so there is no proof step to send them to.
  redirect(
    result.paymentId
      ? `/dashboard/payments?focus=${encodeURIComponent(result.paymentId)}&sent=1`
      : '/dashboard/payments?started=1',
  );
}

export async function submitPaymentProofAction(formData: FormData): Promise<void> {
  const member = await requireSession();
  await assertSameOrigin();

  const instructions = await getPaymentInstructions();
  if (!instructions.state.acceptsUploads || !instructions.configured) {
    withError('Payment proof uploads are not available right now. Please contact the EHEMS team.');
  }

  const parsed = parseProofForm(formData);
  if (!parsed.ok) withError(parsed.message);

  const result = await submitProofUpload({
    paymentId: parsed.value.paymentId,
    userId: member.id,
    file: parsed.value.proof,
    paymentMethod: parsed.value.paymentMethod,
    paymentReference: parsed.value.paymentReference,
    bankName: parsed.value.bankName || null,
    transferDate: parsed.value.transferDate,
  });

  if (!result.ok) withError(result.message);
  redirect('/dashboard/payments?sent=1');
}

export async function resubmitPaymentProofAction(formData: FormData): Promise<void> {
  const member = await requireSession();
  await assertSameOrigin();

  const instructions = await getPaymentInstructions();
  if (!instructions.state.acceptsUploads || !instructions.configured) {
    withError('Payment proof uploads are not available right now. Please contact the EHEMS team.');
  }

  const parsed = parseProofForm(formData);
  if (!parsed.ok) withError(parsed.message);

  const result = await resubmitProofUpload({
    paymentId: parsed.value.paymentId,
    userId: member.id,
    file: parsed.value.proof,
    paymentMethod: parsed.value.paymentMethod,
    paymentReference: parsed.value.paymentReference,
    bankName: parsed.value.bankName || null,
    transferDate: parsed.value.transferDate,
  });

  if (!result.ok) withError(result.message);
  redirect('/dashboard/payments?resent=1');
}

type ProofFormResult = { ok: true; value: ProofFormValue } | { ok: false; message: string };

type ProofFormValue = {
  paymentId: string;
  paymentMethod: 'bank_transfer' | 'mobile_money' | 'cash';
  paymentReference: string;
  bankName: string;
  transferDate: Date;
  proof: File;
};

/**
 * Shape check, then the one thing Zod cannot own.
 *
 * `parseWatDateInput` is not a schema concern: it has to be a real calendar date
 * (`2026-02-31` is not one) and the result has to be a `Date` the transitions can
 * compare against `Date.now()`. Keeping it here means a rule that ships to the
 * browser is never the only enforcement of it.
 */
function parseProofForm(formData: FormData): ProofFormResult {
  const parsed = paymentProofSchema.safeParse({
    paymentId: formData.get('paymentId'),
    paymentMethod: formData.get('paymentMethod'),
    paymentReference: formData.get('paymentReference'),
    bankName: formData.get('bankName') ?? '',
    transferDate: formData.get('transferDate'),
    proof: formData.get('proof'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Check your details and try again.',
    };
  }

  const transferDate = parseWatDateInput(parsed.data.transferDate);
  if (!transferDate) {
    return { ok: false, message: 'Enter the transfer date as YYYY-MM-DD.' };
  }

  return {
    ok: true,
    value: {
      paymentId: parsed.data.paymentId,
      // The enum already guaranteed one of the three; restated so `ProofFormValue`
      // needs no cast and a future fourth method cannot slip through untyped.
      paymentMethod: parsed.data.paymentMethod,
      paymentReference: parsed.data.paymentReference,
      bankName: parsed.data.bankName,
      transferDate,
      proof: parsed.data.proof,
    },
  };
}
