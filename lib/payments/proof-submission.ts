/**
 * Proof submission as one operation: validate, encrypt, transition, clean up.
 *
 * The ordering here is the whole point of the file. Each step can fail, and a
 * failure must not leave half a payment behind:
 *
 *   1. `validateProofUpload` reads the bytes and checks type and size (SEC-005).
 *      A 40 MB file is refused before anything is written.
 *   2. `writeProofObject` encrypts and stores, returning an opaque key (SEC-004).
 *   3. The state machine decides whether the transition is legal.
 *   4. If it is not — a double submission, a payment somebody else owns, a
 *      transfer dated in the future — the ciphertext is **deleted**. Otherwise a
 *      refused attempt would leave encrypted receipt images accumulating on disk
 *      with no row pointing at them, and no way to know which are orphans.
 *
 * Step 3 before step 2 would avoid the cleanup, but it would also mean writing a
 * file before knowing the row will accept it, and the row check is the thing
 * that can be refused. Encryption is cheap next to a leaked directory of member
 * receipts, so the order is: prove it is a real submission, then store it.
 *
 * Proof attached to a payment that *did* transition is never deleted by this
 * module. The retention policy owns that decision and has not been confirmed
 * with the client yet (`docs/decisions.md` CR-10).
 */

import { deleteProofObject, validateProofUpload, writeProofObject } from './proofs';
import { resubmitProof, submitProof, type PaymentOutcome, type ProofDetails } from './transitions';
import type { PaymentMethod, PaymentStatus } from './types';

export type ProofUploadInput = {
  paymentId: string;
  userId: string;
  file: File;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  bankName: string | null;
  transferDate: Date;
};

export type ProofUploadOutcome =
  { ok: true; status: PaymentStatus } | { ok: false; message: string };

async function storeAndTransition(
  input: ProofUploadInput,
  action: 'submit' | 'resubmit',
): Promise<ProofUploadOutcome> {
  const checked = await validateProofUpload(input.file);
  if (!checked.ok) return { ok: false, message: checked.message };

  let storageKey: string;
  try {
    ({ storageKey } = await writeProofObject(input.paymentId, checked.bytes));
  } catch (error) {
    // Almost always a missing PAYMENT_PROOF_ENCRYPTION_KEY. Say that rather than
    // surfacing an OpenSSL error the member cannot act on.
    const message =
      error instanceof Error && error.message.includes('PAYMENT_PROOF_ENCRYPTION_KEY')
        ? 'Proof uploads are not available right now. Please contact the EHEMS team.'
        : 'We could not store your proof of payment. Please try again.';
    return { ok: false, message };
  }

  const proof: ProofDetails = {
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    bankName: input.bankName,
    transferDate: input.transferDate,
    proofUrl: storageKey,
  };

  const result: PaymentOutcome<{ status: PaymentStatus }> =
    action === 'submit'
      ? await submitProof(input.paymentId, input.userId, proof)
      : await resubmitProof(input.paymentId, input.userId, proof);

  if (!result.ok) {
    await deleteProofObject(storageKey).catch(() => null);
    return { ok: false, message: result.message };
  }

  return { ok: true, status: result.status };
}

/** `pending → submitted`, with the uploaded file encrypted and stored. */
export async function submitProofUpload(input: ProofUploadInput): Promise<ProofUploadOutcome> {
  return storeAndTransition(input, 'submit');
}

/** `rejected → submitted` on the same row (D-8), with a fresh encrypted file. */
export async function resubmitProofUpload(input: ProofUploadInput): Promise<ProofUploadOutcome> {
  return storeAndTransition(input, 'resubmit');
}
