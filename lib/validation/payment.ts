/**
 * Zod schemas for the payment boundaries (AGENTS.md §7).
 *
 * These check **shape only**: a field is a string, a date parses, the file is a
 * `File`. Anything about what a member is *allowed* to do — that a payment must
 * be `pending` or `rejected` before proof can be attached, that a rejection needs
 * a reason, that a transfer cannot be dated in the future — is a business rule
 * and lives in `lib/payments/`, because a schema in this directory ships to the
 * browser and can be bypassed by calling the action directly.
 *
 * The one exception worth naming: the payment method is a `z.enum` over
 * `PAYMENT_METHODS`. That is the PRD's own closed vocabulary (§14.4) rather than
 * a rule the client could sensibly want to change, and an enum also keeps the
 * `<select>` options and the parser from drifting apart.
 */

import { z } from 'zod';
import { MAX_PROOF_BYTES } from '@/lib/payments/proofs';
import { PAYMENT_METHODS } from '@/lib/payments/types';

const ALLOWED_PROOF_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

/** Member-side proof submission, and the D-8 resubmission (same shape). */
export const paymentProofSchema = z.object({
  paymentId: z.string().trim().min(1, 'Select the payment you are submitting proof for.'),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: 'Choose how you paid.' }),
  paymentReference: z
    .string()
    .trim()
    .min(1, 'Enter the reference from your bank or mobile money provider.')
    .max(120, 'Keep the reference under 120 characters.'),
  bankName: z.string().trim().max(120).optional().default(''),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the transfer date as YYYY-MM-DD.'),
  proof: z
    .instanceof(File, { message: 'Upload proof of payment.' })
    .refine((file) => file.size > 0, 'That file is empty.')
    .refine((file) => file.size <= MAX_PROOF_BYTES, 'Proof must be under 5 MB.'),
});

/**
 * Admin decision on a payment.
 *
 * `decision` is the two outcomes an admin can reach from `under_review`; the
 * `submitted → under_review` open step is a separate action because it is not a
 * decision. `reason` is required for a rejection **by shape**, because the
 * `<textarea>` is rendered with `required` and there is exactly one field for
 * it — `lib/payments/` refuses an empty reason regardless, and this only saves
 * the round trip.
 *
 * `password` is NFR-008 re-authentication, checked server-side by
 * `verifyCurrentPassword`. It is a shape requirement only (non-empty, bounded);
 * whether the password is *correct* is an authentication fact, not a schema
 * question, so it lives in the action. The field is 200 characters to match the
 * existing profile-settings re-auth input.
 */
export const paymentDecisionSchema = z.object({
  paymentId: z.string().trim().min(1, 'Select a payment.'),
  decision: z.enum(['verify', 'reject'], { error: 'Choose an outcome.' }),
  reason: z
    .string()
    .trim()
    .max(1000, 'Keep the reason under 1000 characters.')
    .optional()
    .default(''),
  password: z.string().min(1, 'Re-enter your password to confirm.').max(200),
});

export const openPaymentForReviewSchema = z.object({
  paymentId: z.string().trim().min(1, 'Select a payment.'),
});

/**
 * Re-authentication request for opening a proof file.
 *
 * NFR-008 makes viewing a payment proof a sensitive operation. The password is
 * checked with a real Argon2id verify in the action; the schema only requires
 * that something was submitted and bounds its length to match the other re-auth
 * inputs in the app.
 */
export const paymentProofViewSchema = z.object({
  paymentId: z.string().trim().min(1, 'Select a payment.'),
  password: z.string().min(1, 'Re-enter your password to open the proof.').max(200),
});

/**
 * The member's "buy this tier" intent.
 *
 * Only the tier id crosses the boundary. The amount is never accepted from the
 * browser — `lib/payments/createPurchaseIntent` re-derives it from
 * `lib/pricing/`, because a client that can post its own amount can post ₦1.
 */
export const purchaseIntentSchema = z.object({
  tierId: z.string().trim().min(1, 'Choose a tier.'),
});

export type PaymentProofInput = z.infer<typeof paymentProofSchema>;
export type PaymentDecisionInput = z.infer<typeof paymentDecisionSchema>;
export type PurchaseIntentInputForm = z.infer<typeof purchaseIntentSchema>;

/** The MIME list the file input advertises, from one source. */
export const ACCEPTED_PROOF_MIME = ALLOWED_PROOF_MIME.join(',');
