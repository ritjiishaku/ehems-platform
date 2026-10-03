/**
 * Public verification identifiers for issued certificates.
 *
 * A `verification_id` is printed on the certificate and quoted by an employer, so
 * it has to survive being read aloud, typed by hand, and pasted into a search box.
 * That rules out the database `cuid`, which is neither memorable nor
 * case-robust. The format is `EHEMS-<year>-<10 chars>`:
 *
 * - A literal prefix so a reader can tell what they are holding before they trust
 *   it, and so a mistyped value fails validation instead of 404ing on every id.
 * - The issue year, because "which cohort was this" is the first question anyone
 *   asks about a certificate.
 * - Ten characters of Crockford base32 (no `I`, `L`, `O`, `U`) from 80 bits of
 *   entropy, which makes guessing a live member's certificate impractical even
 *   though the id is public by design.
 *
 * Uniqueness is enforced by the database, not by this generator: `verificationId`
 * carries a `@unique` constraint. `newVerificationId` cannot promise uniqueness on
 * its own, so `issueCertificates` retries on the constraint violation rather than
 * trusting the entropy to always win.
 */

import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SUFFIX_LENGTH = 10;

/**
 * `randomBytes` is the reason `Math.random` is not used here. This is a
 * public-facing identifier for a credential, and `Math.random` is a seeded PRNG —
 * its output is reproducible from a few observed values, which would let someone
 * walk the sequence to the ids of other members' certificates.
 */
function randomSuffix(length: number): string {
  // Rejection sampling: `byte & 31` is already 0-31, but `byte % 32` would bias the
  // first letters of the alphabet. Modulo bias in a credential alphabet is cheap to
  // avoid and awkward to explain later.
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (out.length === length) break;
      out += CROCKFORD[byte & 31];
    }
  }
  return out;
}

export function newVerificationId(now: Date = new Date()): string {
  return `EHEMS-${now.getUTCFullYear()}-${randomSuffix(SUFFIX_LENGTH)}`;
}

/**
 * Normalise a user-supplied verification id for lookup.
 *
 * Users type these from a printout, so case and surrounding whitespace are noise
 * rather than signal. Separators are kept strict: stripping them would widen the
 * search space for no benefit, and a well-formed id never contains one.
 */
export function normaliseVerificationId(value: string): string {
  return value.trim().toUpperCase();
}

/** Shape check for the public verification form. A db hit is still required. */
export function isWellFormedVerificationId(value: string): boolean {
  return /^EHEMS-\d{4}-[0-9A-HJKMNP-TV-Z]{10}$/.test(normaliseVerificationId(value));
}
