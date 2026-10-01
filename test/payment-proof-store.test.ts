import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertProofKey,
  deleteProofObject,
  MAX_PROOF_BYTES,
  PROOF_SIZE_LIMIT_MESSAGE,
  proofStorageKey,
  readProofObject,
  validateProofUpload,
  writeProofObject,
} from '@/lib/payments/proofs';
import { submitProofUpload } from '@/lib/payments/proof-submission';

/**
 * The payment proof storage seam (SEC-004).
 *
 * Everything here is about one property: a proof written today must still be
 * readable tomorrow, and the bytes that reach a storage driver must already be
 * ciphertext. The first is why `PAYMENT_PROOF_STORE=local` is refused in
 * production — a Vercel redeploy discards the container filesystem, leaving
 * `Payment.proofUrl` pointing at bytes that no longer exist. The second is why
 * the cipher sits above the driver rather than inside it.
 *
 * The local driver is exercised against a real temp directory rather than a
 * mocked `fs`, because no test in this repo previously wrote to disk and the
 * round trip is the only thing that proves the SEC-004 framing survives a write
 * and a read.
 */

const blob = vi.hoisted(() => ({
  putCalls: [] as Array<{ pathname: string; body: Buffer; options: unknown }>,
  getCalls: [] as Array<{ pathname: string; options: unknown }>,
  delCalls: [] as string[],
  objects: new Map<string, Buffer>(),
  putError: null as Error | null,
}));

vi.mock('@vercel/blob', () => {
  class BlobNotFoundError extends Error {}

  function metadata(pathname: string) {
    return {
      url: `https://store.private.blob.vercel-storage.com/${pathname}`,
      downloadUrl: `https://store.private.blob.vercel-storage.com/${pathname}?download=1`,
      pathname,
      contentDisposition: '',
      cacheControl: '',
      uploadedAt: new Date(0),
      etag: 'etag',
    };
  }

  return {
    BlobNotFoundError,
    put: async (pathname: string, body: Buffer, options: unknown) => {
      if (blob.putError) throw blob.putError;
      blob.putCalls.push({ pathname, body: Buffer.from(body), options });
      blob.objects.set(pathname, Buffer.from(body));
      return { ...metadata(pathname), contentType: 'application/octet-stream' };
    },
    get: async (pathname: string, options: unknown) => {
      blob.getCalls.push({ pathname, options });
      const found = blob.objects.get(pathname);
      if (!found) return null;
      return {
        statusCode: 200 as const,
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(found));
            controller.close();
          },
        }),
        headers: new Headers(),
        blob: {
          ...metadata(pathname),
          contentType: 'application/octet-stream',
          size: found.length,
        },
      };
    },
    del: async (pathname: string) => {
      blob.delCalls.push(pathname);
      if (!blob.objects.has(pathname)) throw new BlobNotFoundError('no such blob');
      blob.objects.delete(pathname);
    },
  };
});

const KEY = crypto.randomBytes(32).toString('base64');
const PAYMENT_ID = 'clx0000000000000000000000';
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.from('pretend this is a receipt body long enough to be interesting'),
]);

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehems-proof-'));
  vi.stubEnv('PAYMENT_PROOF_ENCRYPTION_KEY', KEY);
  vi.stubEnv('PAYMENT_PROOF_STORAGE_DIR', path.join(tempRoot, 'proof'));
  vi.stubEnv('PAYMENT_PROOF_STORE', 'local');
  blob.putCalls.length = 0;
  blob.getCalls.length = 0;
  blob.delCalls.length = 0;
  blob.objects.clear();
  blob.putError = null;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('the proof size ceiling', () => {
  /**
   * Vercel's own quickstart states the hard cap for a server-side blob upload.
   * It is the constraint the validator exists to respect, and the two have
   * drifted before: the limit was 5 MB while the store would only take 4.5 MB, so
   * a member could pass validation and then be failed by the platform with a
   * message they could not act on.
   */
  const PLATFORM_SERVER_UPLOAD_CAP = Math.floor(4.5 * 1000 * 1000);

  it('never exceeds the storage platform server-upload cap', () => {
    expect(MAX_PROOF_BYTES).toBeLessThan(PLATFORM_SERVER_UPLOAD_CAP);
  });

  it('refuses a file above the ceiling before anything is stored', async () => {
    const oversized = new File([new Uint8Array(MAX_PROOF_BYTES + 1)], 'receipt.jpg', {
      type: 'image/jpeg',
    });

    const checked = await validateProofUpload(oversized);

    expect(checked.ok).toBe(false);
    expect(checked.ok === false && checked.message).toBe(PROOF_SIZE_LIMIT_MESSAGE);
  });

  it('accepts a file exactly at the ceiling', async () => {
    // Exactly at the limit, with a real JPEG magic prefix so this exercises the
    // size boundary and not the type check. The boundary is inclusive on purpose:
    // a member whose file is precisely at the limit should be accepted, which is
    // what pins `<=` rather than `<`.
    const atLimit = Buffer.concat([JPEG, Buffer.alloc(MAX_PROOF_BYTES - JPEG.length)]);
    expect(atLimit.length).toBe(MAX_PROOF_BYTES);

    const file = new File([atLimit], 'receipt.jpg', { type: 'image/jpeg' });

    expect((await validateProofUpload(file)).ok).toBe(true);
  });

  it('states the real limit in the message rather than a stale number', () => {
    // This literal said "5 MB" while the constant was 4 MB, which told a member
    // to try again on a file that would still be refused.
    expect(PROOF_SIZE_LIMIT_MESSAGE).toContain(`${Math.floor(MAX_PROOF_BYTES / (1024 * 1024))} MB`);
    expect(PROOF_SIZE_LIMIT_MESSAGE).not.toMatch(/under 5 MB/);
  });
});

describe('proof key validation', () => {
  it('accepts a key produced by proofStorageKey', () => {
    const nonce = crypto.randomBytes(12).toString('hex');
    expect(assertProofKey(proofStorageKey(PAYMENT_ID, nonce))).toBe(
      `proof/${PAYMENT_ID}/${nonce}.enc`,
    );
  });

  it.each([
    ['a traversal segment', 'proof/../../etc/passwd'],
    ['an absolute path', '/etc/passwd'],
    ['a backslash separator', 'proof\\..\\..\\windows\\system32'],
    ['a non-hex nonce', `proof/${PAYMENT_ID}/receipt.enc`],
    ['a short nonce', `proof/${PAYMENT_ID}/abc.enc`],
    ['an uppercase nonce', `proof/${PAYMENT_ID}/${'A'.repeat(24)}.enc`],
    ['the wrong top-level prefix', `notproof/${PAYMENT_ID}/${'a'.repeat(24)}.enc`],
    ['a missing .enc suffix', `proof/${PAYMENT_ID}/${'a'.repeat(24)}`],
    ['an empty key', ''],
  ])('refuses %s', (_label, key) => {
    expect(() => assertProofKey(key)).toThrow(/malformed payment proof key/);
  });

  it('refuses a malformed key before it reaches any driver', async () => {
    vi.stubEnv('PAYMENT_PROOF_STORE', 'blob');
    await expect(readProofObject('proof/../../etc/passwd')).rejects.toThrow(
      /malformed payment proof key/,
    );
    expect(blob.getCalls).toHaveLength(0);
  });
});

describe('the local driver round trip', () => {
  it('encrypts on write and recovers the original bytes on read', async () => {
    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);
    expect(storageKey).toMatch(/^proof\/[A-Za-z0-9_-]+\/[0-9a-f]{24}\.enc$/);

    const restored = await readProofObject(storageKey);
    expect(restored.equals(JPEG)).toBe(true);
  });

  it('never writes plaintext to disk (SEC-004)', async () => {
    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);
    const onDisk = await fs.readFile(path.join(tempRoot, 'proof', storageKey));

    expect(onDisk.equals(JPEG)).toBe(false);
    expect(onDisk.includes(JPEG.subarray(0, 16))).toBe(false);
    // iv (12) || tag (16) || ciphertext
    expect(onDisk.length).toBe(12 + 16 + JPEG.length);
  });

  it('produces different ciphertext for the same plaintext', async () => {
    const first = await writeProofObject(PAYMENT_ID, JPEG);
    const second = await writeProofObject(PAYMENT_ID, JPEG);

    expect(first.storageKey).not.toBe(second.storageKey);
    expect(
      (await fs.readFile(path.join(tempRoot, 'proof', first.storageKey))).equals(
        await fs.readFile(path.join(tempRoot, 'proof', second.storageKey)),
      ),
    ).toBe(false);
  });

  it('deletes a proof and refuses to read it afterwards', async () => {
    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);

    await deleteProofObject(storageKey);

    await expect(fs.stat(path.join(tempRoot, 'proof', storageKey))).rejects.toThrow();
  });

  it('treats deleting an absent proof as a no-op', async () => {
    const nonce = crypto.randomBytes(12).toString('hex');
    await expect(deleteProofObject(proofStorageKey(PAYMENT_ID, nonce))).resolves.toBeUndefined();
  });

  it('refuses a truncated stored proof rather than returning partial plaintext', async () => {
    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);
    const file = path.join(tempRoot, 'proof', storageKey);

    await fs.writeFile(file, Buffer.alloc(12));
    await expect(readProofObject(storageKey)).rejects.toThrow(/truncated/);
  });

  it('fails closed when the encryption key is missing', async () => {
    vi.stubEnv('PAYMENT_PROOF_ENCRYPTION_KEY', '');
    await expect(writeProofObject(PAYMENT_ID, JPEG)).rejects.toThrow(
      /PAYMENT_PROOF_ENCRYPTION_KEY is not set/,
    );
  });
});

describe('driver selection', () => {
  it('refuses the local driver in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PAYMENT_PROOF_STORE', 'local');

    await expect(writeProofObject(PAYMENT_ID, JPEG)).rejects.toThrow(/not permitted in production/);
    // Nothing on disk, so a refused upload leaves no artefact behind.
    await expect(fs.readdir(path.join(tempRoot, 'proof')).catch(() => 'absent')).resolves.toBe(
      'absent',
    );
  });

  it('refuses an unrecognised driver name rather than defaulting to local', async () => {
    vi.stubEnv('PAYMENT_PROOF_STORE', 's3');

    await expect(writeProofObject(PAYMENT_ID, JPEG)).rejects.toThrow(
      /PAYMENT_PROOF_STORE must be "local" or "blob"/,
    );
  });

  it('allows local in a production build only with the explicit ephemeral opt-in', async () => {
    // `next start` is how the Playwright suite serves a real build, and that
    // suite has to write a real proof. The opt-in is what lets it, and its value
    // names exactly what it concedes.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PAYMENT_PROOF_STORE', 'local');
    vi.stubEnv('PAYMENT_PROOF_ALLOW_EPHEMERAL_STORE', '1');

    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);
    expect((await readProofObject(storageKey)).equals(JPEG)).toBe(true);
  });

  it('still refuses local in production when the opt-in is empty', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PAYMENT_PROOF_STORE', 'local');
    vi.stubEnv('PAYMENT_PROOF_ALLOW_EPHEMERAL_STORE', '');

    await expect(writeProofObject(PAYMENT_ID, JPEG)).rejects.toThrow(/not permitted/);
  });

  it('needs no opt-in in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PAYMENT_PROOF_STORE', 'local');
    vi.stubEnv('PAYMENT_PROOF_ALLOW_EPHEMERAL_STORE', '');

    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);
    expect((await readProofObject(storageKey)).equals(JPEG)).toBe(true);
  });

  it('defaults to local when the variable is unset', async () => {
    vi.stubEnv('PAYMENT_PROOF_STORE', '');
    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);
    expect((await readProofObject(storageKey)).equals(JPEG)).toBe(true);
  });

  it('accepts a differently cased driver name', async () => {
    vi.stubEnv('PAYMENT_PROOF_STORE', ' BLOB ');
    await writeProofObject(PAYMENT_ID, JPEG);
    expect(blob.putCalls).toHaveLength(1);
  });
});

describe('the blob driver', () => {
  beforeEach(() => {
    vi.stubEnv('PAYMENT_PROOF_STORE', 'blob');
  });

  it('round trips through the store', async () => {
    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);

    expect((await readProofObject(storageKey)).equals(JPEG)).toBe(true);
  });

  it('stores under exactly the key recorded in Payment.proofUrl', async () => {
    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);

    expect(blob.putCalls).toHaveLength(1);
    expect(blob.putCalls[0].pathname).toBe(storageKey);
  });

  it('hands the store ciphertext, never the member upload', async () => {
    await writeProofObject(PAYMENT_ID, JPEG);

    const stored = blob.putCalls[0].body;
    expect(stored.equals(JPEG)).toBe(false);
    expect(stored.includes(JPEG.subarray(0, 16))).toBe(false);
    expect(stored.length).toBe(12 + 16 + JPEG.length);
  });

  it('uploads as a private blob without suffixing or overwriting', async () => {
    await writeProofObject(PAYMENT_ID, JPEG);

    expect(blob.putCalls[0].options).toMatchObject({
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  });

  it('bypasses the edge cache so an admin never sees a superseded proof', async () => {
    // A member resubmits after rejection (D-8). If the read were cached, the admin
    // could be served the already-rejected receipt and verify against evidence
    // that is no longer the submission in question.
    const first = await writeProofObject(PAYMENT_ID, JPEG);
    const second = await writeProofObject(PAYMENT_ID, Buffer.concat([JPEG, Buffer.from('-v2')]));

    await readProofObject(first.storageKey);
    await readProofObject(second.storageKey);

    for (const call of blob.getCalls) {
      expect(call.options).toMatchObject({ access: 'private', useCache: false });
    }
    expect((await readProofObject(second.storageKey)).toString()).toContain('-v2');
  });

  it('deletes by key', async () => {
    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);

    await deleteProofObject(storageKey);

    expect(blob.delCalls).toEqual([storageKey]);
    expect(blob.objects.has(storageKey)).toBe(false);
  });

  it('treats deleting an absent blob as a no-op', async () => {
    const nonce = crypto.randomBytes(12).toString('hex');

    await expect(deleteProofObject(proofStorageKey(PAYMENT_ID, nonce))).resolves.toBeUndefined();
  });

  it('fails loudly when a stored proof is missing', async () => {
    const { storageKey } = await writeProofObject(PAYMENT_ID, JPEG);
    blob.objects.delete(storageKey);

    await expect(readProofObject(storageKey)).rejects.toThrow(/could not be read/);
  });
});

/**
 * A store that refuses an upload is the one failure a member sees a message for,
 * so what that message says decides whether they retry or give up. These go
 * through `submitProofUpload` rather than the helper directly: the point is what
 * the member is told, not which branch produced it.
 */
describe('what a member is told when storage refuses the upload', () => {
  const input = {
    paymentId: PAYMENT_ID,
    userId: 'user-1',
    file: new File([JPEG], 'receipt.jpg', { type: 'image/jpeg' }),
    paymentMethod: 'bank_transfer' as const,
    paymentReference: 'REF-123',
    bankName: 'Test Bank',
    transferDate: new Date('2026-01-05T09:00:00Z'),
  };

  beforeEach(() => {
    vi.stubEnv('PAYMENT_PROOF_STORE', 'blob');
  });

  it('asks them to retake the photo when the store refuses the size', async () => {
    blob.putError = Object.assign(new Error('request entity too large'), {
      name: 'BlobFileTooLargeError',
    });

    const outcome = await submitProofUpload(input);

    expect(outcome).toEqual({ ok: false, message: PROOF_SIZE_LIMIT_MESSAGE });
  });

  it('points at the operator when the encryption key is missing', async () => {
    // Retrying cannot fix this, so it must not read as "try again".
    vi.stubEnv('PAYMENT_PROOF_ENCRYPTION_KEY', '');

    const outcome = await submitProofUpload(input);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.message).toMatch(/contact the EHEMS team/);
  });

  it('offers a retry for an ordinary store failure', async () => {
    blob.putError = new Error('ECONNRESET');

    const outcome = await submitProofUpload(input);

    expect(outcome).toEqual({
      ok: false,
      message: 'We could not store your proof of payment. Please try again.',
    });
  });

  it('never leaves a half-written object behind when the store refuses', async () => {
    blob.putError = new Error('ECONNRESET');

    await submitProofUpload(input);

    expect(blob.objects.size).toBe(0);
    expect(blob.delCalls).toHaveLength(0);
  });
});
