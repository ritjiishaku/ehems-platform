import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { hashPassword, passwordHashNeedsUpgrade, verifyPassword } from '@/lib/auth/password';

describe('password hashing', () => {
  it('creates verifiable Argon2id hashes', async () => {
    const hash = await hashPassword('member-password');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(passwordHashNeedsUpgrade(hash)).toBe(false);
    expect(await verifyPassword('member-password', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('accepts legacy bcrypt hashes so successful login can upgrade them', async () => {
    const hash = await bcrypt.hash('legacy-password', 4);

    expect(await verifyPassword('legacy-password', hash)).toBe(true);
    expect(passwordHashNeedsUpgrade(hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('accepts legacy PBKDF2 hashes with constant-time digest comparison', async () => {
    const salt = 'legacy-salt';
    const digest = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2('legacy-password', salt, 120_000, 64, 'sha512', (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
    const legacyHash = `${salt}:${digest.toString('hex')}`;

    expect(await verifyPassword('legacy-password', legacyHash)).toBe(true);
    expect(passwordHashNeedsUpgrade(legacyHash)).toBe(true);
    expect(await verifyPassword('wrong-password', legacyHash)).toBe(false);
  });
});
