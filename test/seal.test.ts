import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  open as unseal,
  openFromBase64,
  orderAddressKey,
  proofKey,
  seal,
  sealToBase64,
} from '@/lib/crypto/seal';

const KEY = crypto.randomBytes(32);
const OTHER_KEY = crypto.randomBytes(32);

describe('seal framing and round-trip', () => {
  it('round-trips a UTF-8 string', () => {
    const secret = '12 Adeola Street, Yaba, Lagos';
    expect(unseal(seal(Buffer.from(secret, 'utf8'), KEY), KEY).toString('utf8')).toBe(secret);
  });

  it('round-trips non-ASCII, which a naive latin1 or byte-per-char would mangle', () => {
    const secret = 'Àkàn — Ọ̀bọ́ Lagos ₦450,000';
    expect(unseal(seal(Buffer.from(secret, 'utf8'), KEY), KEY).toString('utf8')).toBe(secret);
  });

  it('round-trips an empty plaintext', () => {
    expect(unseal(seal(Buffer.alloc(0), KEY), KEY).toString('utf8')).toBe('');
  });

  it('round-trips through the base64 helper used by text columns', () => {
    const secret = 'Suite 4, Plot 22, Ajose';
    expect(openFromBase64(sealToBase64(secret, KEY), KEY)).toBe(secret);
  });

  it('produces iv(12) || tag(16) then ciphertext, so reading needs no sidecar', () => {
    const framed = seal(Buffer.from('hello world', 'utf8'), KEY);
    expect(framed.length).toBe(12 + 16 + 'hello world'.length);
  });
});

describe('a fresh nonce per call', () => {
  it('never repeats ciphertext for identical plaintext', () => {
    // Deterministic ciphertext under a reused GCM nonce leaks the authentication
    // subkey, so two seals of the same address must differ. A member with the same
    // delivery address on two orders must not be linkable by comparing columns.
    const a = seal(Buffer.from('same address', 'utf8'), KEY);
    const b = seal(Buffer.from('same address', 'utf8'), KEY);
    expect(a.equals(b)).toBe(false);
    expect(a.subarray(0, 12).equals(b.subarray(0, 12))).toBe(false);
  });

  it('uses a distinct IV per seal across many calls', () => {
    const ivs = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      ivs.add(seal(Buffer.from('x'), KEY).subarray(0, 12).toString('hex'));
    }
    expect(ivs.size).toBe(200);
  });
});

describe('authenticated encryption rejects tampering', () => {
  it('detects a flipped ciphertext bit', () => {
    const framed = seal(Buffer.from('1 Ana Street, Lagos', 'utf8'), KEY);
    const tampered = Buffer.from(framed);
    tampered[tampered.length - 1] ^= 0x01;
    expect(() => unseal(tampered, KEY)).toThrow();
  });

  it('detects a flipped tag bit', () => {
    const framed = seal(Buffer.from('1 Ana Street, Lagos', 'utf8'), KEY);
    const tampered = Buffer.from(framed);
    tampered[20] ^= 0x80;
    expect(() => unseal(tampered, KEY)).toThrow();
  });

  it('detects a swapped IV, which would otherwise re-key the cipher', () => {
    const framed = seal(Buffer.from('1 Ana Street, Lagos', 'utf8'), KEY);
    const tampered = Buffer.from(framed);
    tampered[0] ^= 0xff;
    expect(() => unseal(tampered, KEY)).toThrow();
  });

  it('refuses a payload sealed under a different key', () => {
    const framed = seal(Buffer.from('private', 'utf8'), KEY);
    expect(() => unseal(framed, OTHER_KEY)).toThrow();
  });

  it('refuses a truncated payload rather than reading out of bounds', () => {
    expect(() => unseal(Buffer.alloc(27), KEY)).toThrow('truncated');
  });
});

describe('openFromBase64 degrades instead of throwing on bad data', () => {
  it('returns null for empty input', () => {
    expect(openFromBase64('', KEY)).toBeNull();
  });

  it('returns null for base64 that is not a framed payload', () => {
    expect(openFromBase64(Buffer.from('not encrypted at all').toString('base64'), KEY)).toBeNull();
  });

  it('returns null for a payload that fails authentication', () => {
    const encoded = sealToBase64('address', KEY);
    const raw = Buffer.from(encoded, 'base64');
    raw[raw.length - 2] ^= 0x01;
    expect(openFromBase64(raw.toString('base64'), KEY)).toBeNull();
  });
});

describe('key resolution', () => {
  const original = {
    proof: process.env.PAYMENT_PROOF_ENCRYPTION_KEY,
    order: process.env.ORDER_ADDRESS_ENCRYPTION_KEY,
  };

  it('accepts base64 and hex encodings of the same 32 bytes', () => {
    const raw = KEY.toString('hex');
    process.env.PAYMENT_PROOF_ENCRYPTION_KEY = raw;
    expect(proofKey().equals(KEY)).toBe(true);
    process.env.PAYMENT_PROOF_ENCRYPTION_KEY = KEY.toString('base64');
    expect(proofKey().equals(KEY)).toBe(true);
  });

  it('refuses a key that is not 32 bytes', () => {
    process.env.PAYMENT_PROOF_ENCRYPTION_KEY = crypto.randomBytes(16).toString('base64');
    expect(() => proofKey()).toThrow('exactly 32 bytes');
  });

  it('refuses a missing key rather than storing plaintext', () => {
    delete process.env.PAYMENT_PROOF_ENCRYPTION_KEY;
    expect(() => proofKey()).toThrow('is not set');
  });

  it('falls back to the proof key so a single-secret deployment still works', () => {
    delete process.env.ORDER_ADDRESS_ENCRYPTION_KEY;
    process.env.PAYMENT_PROOF_ENCRYPTION_KEY = KEY.toString('base64');
    expect(orderAddressKey().equals(KEY)).toBe(true);
  });

  it('prefers a dedicated order key when one is configured', () => {
    process.env.ORDER_ADDRESS_ENCRYPTION_KEY = OTHER_KEY.toString('base64');
    expect(orderAddressKey().equals(OTHER_KEY)).toBe(true);
  });

  afterRestore();

  function afterRestore() {
    if (original.proof === undefined) delete process.env.PAYMENT_PROOF_ENCRYPTION_KEY;
    else process.env.PAYMENT_PROOF_ENCRYPTION_KEY = original.proof;
    if (original.order === undefined) delete process.env.ORDER_ADDRESS_ENCRYPTION_KEY;
    else process.env.ORDER_ADDRESS_ENCRYPTION_KEY = original.order;
  }
});
