/**
 * Payment proof storage: encrypted at rest (SEC-004), validated on the way in
 * (SEC-005).
 *
 * ## Why the file is encrypted here rather than in a route handler
 *
 * SEC-004 says proof files are encrypted at rest. A payment receipt is a bank
 * statement fragment: it shows a balance, a name, and a habit of spending. It is
 * NDPA sensitive data, and it is also the single most useful document in the
 * building for someone who wants to impersonate a member. So the bytes are
 * encrypted here, before they reach any storage driver, and the
 * `Payment.proofUrl` column stores an opaque storage key — never a filesystem
 * path or a bucket pathname a caller could hand back to the server.
 *
 * AES-256-GCM rather than a bare cipher because it authenticates as well as
 * encrypts: a truncated or swapped proof file fails the tag check instead of
 * decrypting to garbage an admin then verifies by eye.
 *
 * ## Why there are two storage drivers
 *
 * Phase 1 began with a local directory, because hosting was still PENDING
 * (`docs/decisions.md` CR-04) and a directory is the smallest thing that
 * satisfies "encrypted at rest" honestly. Hosting is now Vercel, and a Vercel
 * function's filesystem does not survive a redeploy. That is not a slow
 * degradation: the container is discarded, `Payment.proofUrl` keeps pointing at
 * bytes that no longer exist, and the member's financial evidence is gone with no
 * error anywhere in the system.
 *
 * So storage is a driver behind `PAYMENT_PROOF_STORE`, and the choice is
 * enforced rather than documented: `local` in production throws at the first
 * operation instead of quietly losing receipts. `local` remains the default
 * because it is what dev, CI, and the Playwright suite use.
 *
 * Two properties are deliberate:
 *
 *   - **Encryption happens above the driver, never inside it.** Every driver
 *     only ever receives AES-256-GCM ciphertext. Bucket access control is
 *     therefore defence in depth rather than the control that makes storing
 *     member receipts lawful, and swapping drivers cannot weaken SEC-004.
 *   - **`@vercel/blob` is imported dynamically.** It must not enter the bundle
 *     of a route that only needs `detectProofType`, and a top-level import would
 *     also pull it into every test that imports this module.
 *
 * The exported surface is unchanged — `writeProofObject`, `readProofObject`,
 * `deleteProofObject`, `proofStorageKey` — and the key format is unchanged, so
 * no caller and no row needs to be touched by the switch.
 *
 * ## What is deliberately absent
 *
 * No virus scanning. SEC-005 asks for it, and it is a real requirement, but
 * there is no scanner in this repo and shipping a "scan" that shells out to a
 * binary that may not exist on the deployment host is worse than saying so. The
 * file never executes and never leaves the encrypted store, and the size and
 * type limits below are the part that can be enforced honestly today. Recorded
 * as a gap, not silently ticked off.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** 5 MB. A phone photo of a receipt is 1-3 MB; a 10 MB file is not a receipt. */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/**
 * SEC-005, the type allow-list.
 *
 * By declared MIME type *and* by magic number. A `.jpg` that is really a Windows
 * executable passes the first check and fails the second, and the extension is
 * not evidence of anything.
 */
const ALLOWED_TYPES = [
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'], magic: [0xff, 0xd8, 0xff] },
  {
    mime: 'image/png',
    extensions: ['.png'],
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { mime: 'image/webp', extensions: ['.webp'], magic: [0x52, 0x49, 0x46, 0x46] },
  { mime: 'image/heic', extensions: ['.heic'], magic: [0x66, 0x74, 0x79, 0x70] },
  { mime: 'application/pdf', extensions: ['.pdf'], magic: [0x25, 0x50, 0x44, 0x46] },
] as const;

export type ProofRejection =
  { ok: false; message: string } | { ok: true; bytes: Buffer; declaredMime: string };

const ALLOWED_MIME = new Set<string>(ALLOWED_TYPES.map((t) => t.mime));

function storageRoot(): string {
  return process.env.PAYMENT_PROOF_STORAGE_DIR ?? path.join(process.cwd(), '.storage', 'proof');
}

/**
 * The 32-byte key, from `PAYMENT_PROOF_ENCRYPTION_KEY` (base64 or hex).
 *
 * Read at call time rather than at module load so a test can set it, and so a
 * production process that is missing it fails on the first upload with a
 * message that says what to do, instead of at boot with a stack trace.
 */
function encryptionKey(): Buffer {
  const raw = process.env.PAYMENT_PROOF_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'PAYMENT_PROOF_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32',
    );
  }
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('PAYMENT_PROOF_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

function startsWithMagic(bytes: Buffer, magic: readonly number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}

/** webp is RIFF-framed, so the magic check also confirms the WEBP fourCC. */
function magicMatches(bytes: Buffer, mime: string): boolean {
  const type = ALLOWED_TYPES.find((candidate) => candidate.mime === mime);
  if (!type) return false;
  if (mime === 'image/webp') {
    return (
      startsWithMagic(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  if (mime === 'image/heic') {
    return startsWithMagic(bytes, [0x66, 0x74, 0x79, 0x70]);
  }
  return startsWithMagic(bytes, type.magic);
}

/**
 * Validate an uploaded proof file. Returns the bytes to store, or a reason.
 *
 * Takes a `File`, not a request, so a caller cannot smuggle a path or a URL
 * through: the only thing this reads is the bytes the browser actually sent.
 */
export async function validateProofUpload(file: File): Promise<ProofRejection> {
  if (file.size === 0) {
    return { ok: false, message: 'That file is empty. Upload a photo or PDF of your receipt.' };
  }
  if (file.size > MAX_PROOF_BYTES) {
    return {
      ok: false,
      message: `Proof must be under ${Math.floor(MAX_PROOF_BYTES / (1024 * 1024))} MB. Photograph the receipt again at a lower resolution.`,
    };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      message: 'Upload proof as a JPEG, PNG, WebP, HEIC, or PDF file.',
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!magicMatches(bytes, file.type)) {
    return {
      ok: false,
      message: 'That file does not look like the image type it claims to be.',
    };
  }
  return { ok: true, bytes, declaredMime: file.type };
}

/**
 * The MIME type of already-decrypted proof bytes, derived from the bytes.
 *
 * ## Why this exists rather than a stored column
 *
 * Serving a file needs a `Content-Type`, and the obvious design is to record the
 * uploader's declared type on the row and reuse it. That is wrong twice over: it
 * needs a migration to add the column, and more importantly it makes the *stored*
 * value load-bearing for a security decision. A row whose `proofMimeType` says
 * `image/jpeg` for something that is not a JPEG gets rendered as an image in an
 * admin's browser.
 *
 * AES-GCM already guarantees these are the exact bytes the member uploaded —
 * the tag check in `readProofObject` would have thrown otherwise — and they were
 * magic-checked on the way in. So re-deriving the type from them is both free
 * and strictly safer than trusting anything recorded. An unrecognised set of
 * bytes returns null and the caller refuses to serve, which is the right failure
 * direction: a proof nobody can classify is not a proof to show to staff.
 */
export function detectProofMime(bytes: Buffer): string | null {
  for (const type of ALLOWED_TYPES) {
    if (magicMatches(bytes, type.mime)) {
      return type.mime;
    }
  }
  return null;
}

/**
 * The MIME type and a matching filename extension, or null.
 *
 * The extension comes from the same allow-list entry that produced the MIME type,
 * so a WebP can never be served as `photo.jpg` and a renamed `.pdf` can never be
 * handed to the browser as a PDF. A caller that guessed the extension from the
 * content type would get one of those wrong, which is why they are returned
 * together.
 */
export function detectProofType(bytes: Buffer): { mime: string; extension: string } | null {
  for (const type of ALLOWED_TYPES) {
    if (magicMatches(bytes, type.mime)) {
      return { mime: type.mime, extension: type.extensions[0] };
    }
  }
  return null;
}

/** The opaque key stored in `Payment.proofUrl`. */
export function proofStorageKey(paymentId: string, nonce: string): string {
  return `proof/${paymentId}/${nonce}.enc`;
}

/**
 * Refuse anything that is not a key this module could have produced.
 *
 * `proofStorageKey` is the only legitimate producer, but `readProofObject` and
 * `deleteProofObject` also receive keys read back out of the database, so this
 * is the trust boundary between stored data and the storage driver.
 *
 * A shape check rather than a prefix check because it is stronger where it
 * counts: `..`, absolute paths, and encoded separators cannot survive it, which
 * is what a filesystem driver needs. It also means a driver that treats keys as
 * opaque strings cannot be handed a key with a separator in an unexpected place.
 */
const PROOF_KEY_PATTERN = /^proof\/[A-Za-z0-9_-]+\/[0-9a-f]{24}\.enc$/;

export function assertProofKey(key: string): string {
  if (!PROOF_KEY_PATTERN.test(key)) {
    throw new Error('Refusing to use a malformed payment proof key');
  }
  return key;
}

function localPathFor(key: string): string {
  const root = storageRoot();
  const full = path.resolve(root, key);
  // Kept in addition to `assertProofKey`: the shape check is the real boundary,
  // and this is the check that would still hold if that regex were ever relaxed.
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('Refusing to read outside the payment proof store');
  }
  return full;
}

/**
 * The three operations the payment proof store has to support, and nothing else.
 *
 * Deliberately narrow: no listing, no metadata, no partial reads. There is no
 * product requirement that needs them, and every extra method is a way for a
 * driver to leak or clobber evidence that is supposed to be immutable.
 */
type ProofStore = {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  del(key: string): Promise<void>;
};

/**
 * The pre-Vercel driver, and still the default. Dev, CI, and Playwright all use
 * it.
 *
 * The `turbopackIgnore` comments below are load-bearing and their placement is
 * counter-intuitive: the annotation has to sit on a *bare variable* handed
 * straight to the fs function. Putting it inside the `path.join(...)` argument —
 * which is what Next's own warning message tells you to do — is silently ignored
 * (vercel/next.js#95125). Without them, the tracer cannot bound a
 * runtime-computed path, falls back to tracing the entire project, and ships
 * every source file plus `public/` in the server output.
 *
 * Kept on this driver even though production no longer runs it, because a
 * developer machine still will.
 */
function localProofStore(): ProofStore {
  return {
    async put(key, bytes) {
      const full = localPathFor(key);
      const dir = path.dirname(full);
      await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
      await fs.writeFile(/* turbopackIgnore: true */ full, bytes, { mode: 0o600 });
    },
    async get(key) {
      return fs.readFile(/* turbopackIgnore: true */ localPathFor(key));
    },
    async del(key) {
      await fs.rm(/* turbopackIgnore: true */ localPathFor(key), { force: true });
    },
  };
}

/**
 * Vercel Blob, private store, authenticated by OIDC.
 *
 * Private rather than public is defence in depth: the payload is already
 * ciphertext, so a leaked store URL would not disclose a receipt, but a public
 * store would still hand an unauthenticated read of member financial data to
 * anyone who obtained the URL.
 *
 * `addRandomSuffix` stays false so the blob pathname is exactly the key stored in
 * `Payment.proofUrl`, and `allowOverwrite` stays false so a nonce collision fails
 * loudly instead of replacing evidence that is already on file.
 */
async function blobProofStore(): Promise<ProofStore> {
  const { BlobNotFoundError, del, get, put } = await import('@vercel/blob');

  return {
    async put(key, bytes) {
      await put(key, bytes, {
        access: 'private',
        // The payload is ciphertext, so the extension-derived type would be
        // meaningless. The served type is re-derived from the decrypted bytes by
        // `detectProofType` and never from anything recorded here.
        contentType: 'application/octet-stream',
        addRandomSuffix: false,
        allowOverwrite: false,
        // Reads below bypass the cache entirely, so this only bounds how long a
        // stale write can linger at the edge. One minute is the documented floor.
        cacheControlMaxAge: 60,
      });
    },
    async get(key) {
      const result = await get(key, { access: 'private', useCache: false });
      // 304 means "unchanged since your ifNoneMatch", which cannot happen here
      // because no ETag is sent. Treat it as unreadable rather than as success,
      // so an unexpected status can never decrypt as an empty buffer.
      if (!result || result.statusCode !== 200) {
        throw new Error('Stored proof could not be read');
      }
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    },
    async del(key) {
      // Idempotent, to match the local driver's `force: true`. This is only ever
      // reached while cleaning up after a refused transition.
      await del(key).catch((error: unknown) => {
        if (!(error instanceof BlobNotFoundError)) throw error;
      });
    },
  };
}

type ProofStoreName = 'local' | 'blob';

function configuredStoreName(): ProofStoreName {
  const raw = process.env.PAYMENT_PROOF_STORE?.trim().toLowerCase();
  if (!raw) return 'local';
  if (raw === 'local' || raw === 'blob') return raw;
  throw new Error(`PAYMENT_PROOF_STORE must be "local" or "blob"; received "${raw}".`);
}

/**
 * The opt-in that permits `local` in a production build.
 *
 * It exists because "production" and "a real deployment" are not the same thing.
 * `next start` sets `NODE_ENV=production`, which is how the Playwright suite
 * serves a real build — and that suite has to upload a real proof through the UI
 * and read it back as an admin, which needs a filesystem it can write to.
 *
 * The value is deliberately specific about what it concedes: proofs written
 * under it are lost when the process is replaced. Nothing in a real deployment
 * sets it, so a production host that forgot `PAYMENT_PROOF_STORE=blob` still
 * fails loudly rather than quietly accumulating unrecoverable evidence.
 */
const EPHEMERAL_STORE_ACK = 'PAYMENT_PROOF_ALLOW_EPHEMERAL_STORE';

/**
 * The active driver, resolved per operation rather than at module load so a test
 * can change `PAYMENT_PROOF_STORE`, and so a misconfiguration surfaces on the
 * first upload with a message that says what to do — matching how
 * `encryptionKey()` behaves.
 */
async function proofStore(): Promise<ProofStore> {
  const name = configuredStoreName();

  if (
    name === 'local' &&
    process.env.NODE_ENV === 'production' &&
    !process.env[EPHEMERAL_STORE_ACK]
  ) {
    throw new Error(
      'PAYMENT_PROOF_STORE=local is not permitted in production. The container ' +
        'filesystem does not survive a redeploy, so encrypted payment proofs would be ' +
        'lost while Payment.proofUrl keeps pointing at them. Set PAYMENT_PROOF_STORE=blob ' +
        'and connect a private Vercel Blob store to this project. Set ' +
        `${EPHEMERAL_STORE_ACK}=1 only for a throwaway local build that will be discarded.`,
    );
  }

  return name === 'blob' ? await blobProofStore() : localProofStore();
}

/**
 * iv (12) || tag (16) || ciphertext, so reading needs no sidecar metadata.
 *
 * Framing and cipher live above the storage driver so that every driver receives
 * ciphertext and none of them can be swapped for one that stores plaintext.
 */
function encryptPayload(bytes: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptPayload(raw: Buffer): Buffer {
  if (raw.length < 28) {
    throw new Error('Stored proof is truncated');
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
}

/**
 * Encrypt and store the proof. Returns the key to put in `Payment.proofUrl`.
 *
 * A fresh random nonce per submission, so resubmitting after a rejection
 * (D-8) does not silently overwrite the artefact an admin might still be
 * looking at, and so the same plaintext never produces the same ciphertext.
 */
export async function writeProofObject(
  paymentId: string,
  bytes: Buffer,
): Promise<{ storageKey: string }> {
  const nonce = crypto.randomBytes(12).toString('hex');
  const storageKey = assertProofKey(proofStorageKey(paymentId, nonce));

  const store = await proofStore();
  await store.put(storageKey, encryptPayload(bytes));

  return { storageKey };
}

/** Decrypt a stored proof. Callers must authorise first; this does not. */
export async function readProofObject(storageKey: string): Promise<Buffer> {
  const store = await proofStore();
  return decryptPayload(await store.get(assertProofKey(storageKey)));
}

/**
 * Remove a stored proof.
 *
 * Only ever called to clean up after a refused transition. A proof attached to a
 * submitted or verified payment is financial evidence and is never deleted by
 * this system — the retention policy owns that, and it has not been confirmed
 * with the client yet.
 */
export async function deleteProofObject(storageKey: string): Promise<void> {
  const store = await proofStore();
  await store.del(assertProofKey(storageKey));
}
