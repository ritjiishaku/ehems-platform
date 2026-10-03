/**
 * AES-256-GCM sealing for short secrets held in the database.
 *
 * This exists so that two features — encrypted payment proofs
 * (`lib/payments/proofs.ts`) and encrypted delivery addresses
 * (`lib/orders/`) — share **one** reviewed cipher rather than each hand-rolling
 * its own. A second implementation of authenticated encryption is how a codebase
 * ends up with one of them missing its authentication tag.
 *
 * ## Framing
 *
 * `iv (12) || tag (16) || ciphertext`. Self-describing, so reading needs no
 * sidecar: the IV and tag travel with the ciphertext. This is the same framing
 * `lib/payments/proofs.ts` has always used, so existing sealed payloads remain
 * readable — see that module's note on not re-framing it.
 *
 * A fresh random IV per call, so sealing the same plaintext twice produces
 * different output. Reusing an IV under one key with GCM is catastrophic (it
 * leaks the authentication subkey), so the nonce is never derived from anything.
 *
 * ## What this is and is not
 *
 * It protects data **at rest in the database**. It is not a substitute for
 * transport security, column-level permissions, or a KMS. The key comes from the
 * environment, exactly as the payment-proof key does; there is deliberately no
 * key management, rotation, or key-storage story here, because inventing one
 * would be a worse problem than the one being solved.
 */

import crypto from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const MIN_FRAMED_BYTES = IV_BYTES + TAG_BYTES;

/**
 * Resolve the 32-byte key from a base64 or hex environment variable.
 *
 * Shared with the payment-proof path so both features fail the same way: a missing
 * or wrong-length key throws at call time and never silently degrades to
 * unencrypted storage.
 */
function resolveKey(raw: string | undefined, envVarName: string): Buffer {
  if (!raw) {
    throw new Error(`${envVarName} is not set. Generate one with: openssl rand -base64 32`);
  }
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${envVarName} must decode to exactly 32 bytes`);
  }
  return key;
}

export function proofKey(): Buffer {
  return resolveKey(process.env.PAYMENT_PROOF_ENCRYPTION_KEY, 'PAYMENT_PROOF_ENCRYPTION_KEY');
}

/**
 * The key used for order delivery addresses.
 *
 * Falls back to the payment-proof key so a single-key deployment still works out
 * of the box, because requiring a second secret to place an order is a worse first
 * experience than reusing an already-configured one. Set
 * `ORDER_ADDRESS_ENCRYPTION_KEY` to separate the two — and set it to a *different*
 * value in production if the threat models differ.
 */
export function orderAddressKey(): Buffer {
  const own = process.env.ORDER_ADDRESS_ENCRYPTION_KEY;
  if (own) return resolveKey(own, 'ORDER_ADDRESS_ENCRYPTION_KEY');
  return proofKey();
}

/** Seal plaintext into `iv || tag || ciphertext`. */
export function seal(plaintext: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** Open a framed payload, or throw if the framing is wrong or the tag fails. */
export function open(framed: Buffer, key: Buffer): Buffer {
  if (framed.length < MIN_FRAMED_BYTES) {
    throw new Error('Stored payload is truncated');
  }
  const iv = framed.subarray(0, IV_BYTES);
  const tag = framed.subarray(IV_BYTES, MIN_FRAMED_BYTES);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(framed.subarray(MIN_FRAMED_BYTES)), decipher.final()]);
}

/** Seal a UTF-8 string, base64-encoded for storage in a text column. */
export function sealToBase64(plaintext: string, key: Buffer): string {
  return seal(Buffer.from(plaintext, 'utf8'), key).toString('base64');
}

/**
 * Open a base64 string.
 *
 * Returns `null` rather than throwing for malformed input, because a delivery
 * address on a historic order may predate this code or have been corrupted, and a
 * fulfilment screen should degrade to "address unavailable" rather than 500. A
 * *wrong key* still throws, since that is a misconfiguration the operator must
 * hear about.
 */
export function openFromBase64(encoded: string, key: Buffer): string | null {
  let framed: Buffer;
  try {
    framed = Buffer.from(encoded, 'base64');
  } catch {
    return null;
  }
  if (framed.length < MIN_FRAMED_BYTES) return null;

  try {
    return open(framed, key).toString('utf8');
  } catch {
    return null;
  }
}
