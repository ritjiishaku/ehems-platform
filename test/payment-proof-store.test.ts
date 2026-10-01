import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertProofKey,
  deleteProofObject,
  proofStorageKey,
  readProofObject,
  writeProofObject,
} from '@/lib/payments/proofs';

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
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tempRoot, { recursive: true, force: true });
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
