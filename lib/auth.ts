/**
 * EHEMS authentication layer — Phase 2A
 *
 * Session storage moved from the in-memory USERS Map to PostgreSQL via
 * Prisma. The cookie now stores a session ID + a random token; the token hash
 * is stored in the `session` table so the raw token never persists.
 *
 * Security properties maintained from Phase 1:
 *   - HttpOnly, SameSite=Lax, Secure in production
 *   - HMAC signature over the cookie value (tamper detection)
 *   - Timing-safe comparison for both HMAC and password verification
 *
 * New in Phase 2A:
 *   - Sessions are persisted in the DB (survive server restarts)
 *   - absoluteExpiresAt caps sessions at 30 days regardless of activity
 *   - Session rotation on sign-in (old session deleted, new one inserted)
 *   - signOut deletes the DB row, not just the cookie
 *
 * Pending Phase 5:
 *   - ConsentRecord capture at registration
 *   - Rate limiting (5 attempts / 15 min for login)
 *   - CSRF header check on every non-GET mutation
 *   - Password reset flow
 */

import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/client';

export type UserRole = 'member' | 'admin' | 'super-admin';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

const SESSION_COOKIE = 'ehems_session';
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET ?? 'dev-secret-change-me-in-production';

// Session lifetimes (match SystemSetting seeds)
const MEMBER_SESSION_DAYS = 7;
const ABSOLUTE_SESSION_DAYS = 30;

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2 — Phase 5 will migrate to argon2id per AGENTS.md §2)
// ---------------------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.pbkdf2Sync(password, salt, 120_000, 64, 'sha512').toString('hex');
  return `${salt}:${digest}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.pbkdf2Sync(password, salt, 120_000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

// ---------------------------------------------------------------------------
// Cookie encoding — session ID + token, signed with HMAC
// ---------------------------------------------------------------------------

function signValue(value: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function encodeCookieValue(sessionId: string, token: string): string {
  const payload = `${sessionId}.${token}`;
  return `${payload}.${signValue(payload)}`;
}

function decodeCookieValue(cookie: string): { sessionId: string; token: string } | null {
  const parts = cookie.split('.');
  // Format: sessionId.token.signature  — sessionId and token are cuid/hex, no dots
  if (parts.length !== 3) return null;
  const [sessionId, token, signature] = parts;
  if (!sessionId || !token || !signature) return null;

  const expected = signValue(`${sessionId}.${token}`);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  return { sessionId, token };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<SessionUser> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedName = input.name.trim();

  if (!trimmedName || !normalizedEmail || input.password.length < 8) {
    throw new Error('Invalid registration details');
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new Error('An account with that email address already exists');
  }

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: trimmedName,
      passwordHash: hashPassword(input.password),
      role: 'member',
    },
  });

  return { id: user.id, email: user.email, name: user.name, role: user.role as UserRole };
}

export async function authenticateUser(input: {
  email: string;
  password: string;
}): Promise<SessionUser> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || user.deletedAt) {
    // Constant-time: still run the hash even on miss to avoid timing oracle
    hashPassword(input.password);
    throw new Error('Invalid email or password');
  }

  if (!verifyPassword(input.password, user.passwordHash)) {
    throw new Error('Invalid email or password');
  }

  return { id: user.id, email: user.email, name: user.name, role: user.role as UserRole };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE)?.value;
  if (!cookieValue) return null;

  const decoded = decodeCookieValue(cookieValue);
  if (!decoded) return null;

  const { sessionId, token } = decoded;
  const tokenHash = hashToken(token);

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session) return null;
  if (!crypto.timingSafeEqual(Buffer.from(session.tokenHash), Buffer.from(tokenHash))) return null;

  const now = new Date();
  if (session.expiresAt < now || session.absoluteExpiresAt < now) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => null);
    return null;
  }

  if (session.user.deletedAt) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as UserRole,
  };
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}

export async function signIn(user: SessionUser): Promise<void> {
  const cookieStore = await cookies();

  // Delete any existing session for this user before creating a new one
  // (session rotation on login)
  const existingCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (existingCookie) {
    const decoded = decodeCookieValue(existingCookie);
    if (decoded) {
      await prisma.session.delete({ where: { id: decoded.sessionId } }).catch(() => null);
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + MEMBER_SESSION_DAYS * 24 * 60 * 60 * 1000);
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_SESSION_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      absoluteExpiresAt,
    },
  });

  cookieStore.set(SESSION_COOKIE, encodeCookieValue(session.id, token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MEMBER_SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE)?.value;

  if (cookieValue) {
    const decoded = decodeCookieValue(cookieValue);
    if (decoded) {
      await prisma.session.delete({ where: { id: decoded.sessionId } }).catch(() => null);
    }
  }

  cookieStore.delete(SESSION_COOKIE);
}
