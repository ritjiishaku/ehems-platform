import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  argon2id,
  hash as argon2Hash,
  needsRehash as argon2NeedsRehash,
  verify as argon2Verify,
} from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

/** Verify Argon2id and legacy bcrypt/PBKDF2 hashes during the migration period. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('$argon2')) {
    try {
      return await argon2Verify(storedHash, password);
    } catch {
      return false;
    }
  }

  if (storedHash.includes(':')) {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;

    const expectedHash = Buffer.from(hash, 'hex');
    if (expectedHash.length !== 64) return false;
    const candidateHash = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(password, salt, 120_000, 64, 'sha512', (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      });
    });

    return crypto.timingSafeEqual(candidateHash, expectedHash);
  }

  try {
    return await bcrypt.compare(password, storedHash);
  } catch {
    return false;
  }
}

export function passwordHashNeedsUpgrade(storedHash: string): boolean {
  if (!storedHash.startsWith('$argon2id$')) return true;
  return argon2NeedsRehash(storedHash, ARGON2_OPTIONS);
}
