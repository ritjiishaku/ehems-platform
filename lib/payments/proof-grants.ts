/**
 * Short-lived signed grants for serving a payment proof file.
 *
 * ## Why this exists
 *
 * Two requirements pull against each other here. NFR-008 says viewing a member's
 * payment proof needs re-authentication, and security.md says proofs are served
 * "via signed, expiring URLs". A plain `<a href="/proof/123">` satisfies neither:
 * a GET cannot prompt for a password, and a bare id in a URL is a bearer token
 * that leaks through the Referer header, browser history, and any proxy log on
 * the way to the file.
 *
 * So the proof bytes are served by a route handler that will not act on a session
 * cookie alone. It requires a grant, and the only way to get one is to type the
 * admin's password. The grant is HMAC-signed and expires in 60 seconds, which is
 * long enough to open a file and short enough that a copied URL is worthless
 * within the time it takes to notice.
 *
 * ## What the signature binds
 *
 * `paymentId`, `actorId`, and `expiry`, all three. Binding the payment is what
 * stops a grant issued for one receipt being replayed against another. Binding
 * the actor is what stops a grant being shared between two admins who both hold
 * the permission. Binding the expiry is what stops a captured grant being used
 * later.
 *
 * ## Why this is not MFA
 *
 * It is a password re-entry, not a second factor. NFR-008 allows either. It is
 * worth being honest that this defends against a walked-away browser and a
 * copied URL, not against an attacker who has the password.
 */

import crypto from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';

/**
 * 60 seconds.
 *
 * Long enough to click through to a file, short enough that a URL captured from
 * a proxy log is dead before anyone could act on it. The cost of a longer window
 * is that the grant stops being a re-auth step and becomes a bearer token.
 */
export const PROOF_GRANT_TTL_MS = 60 * 1000;

function signingSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SESSION_SECRET must be set to at least 32 characters');
  }
  return secret;
}

function signature(payload: string): string {
  return crypto.createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

/**
 * Mint a grant for one admin to view one payment's proof, valid for 60 seconds.
 */
export function issueProofGrant(
  paymentId: string,
  actorId: string,
  now: number = Date.now(),
): string {
  const payload = [paymentId, actorId, String(now + PROOF_GRANT_TTL_MS)].join('.');
  return `${payload}.${signature(payload)}`;
}

export type ProofGrantCheck = { ok: true } | { ok: false; message: string };

/**
 * Verify a grant for a specific payment and actor.
 *
 * Every rejection returns the same message. Distinguishing "expired" from
 * "wrong payment" from "bad signature" would turn this into an oracle for probing
 * which payment ids exist.
 */
export function verifyProofGrant(
  token: string,
  paymentId: string,
  actorId: string,
  now: number = Date.now(),
): ProofGrantCheck {
  const parts = token.split('.');
  if (parts.length !== 4) {
    return { ok: false, message: 'That proof link is not valid.' };
  }

  const [grantedPaymentId, grantedActorId, expiry, providedSignature] = parts;
  const payload = [grantedPaymentId, grantedActorId, expiry].join('.');

  const expected = Buffer.from(signature(payload));
  const provided = Buffer.from(providedSignature);
  // `timingSafeEqual` throws on a length mismatch, so compare lengths first and
  // return the same refusal either way.
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, message: 'That proof link is not valid.' };
  }

  if (grantedPaymentId !== paymentId || grantedActorId !== actorId) {
    return { ok: false, message: 'That proof link is not valid.' };
  }

  if (!/^\d+$/.test(expiry) || Number(expiry) < now) {
    return { ok: false, message: 'That proof link has expired. Open the payment again.' };
  }

  return { ok: true };
}
