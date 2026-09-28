/**
 * EHEMS session layer — Phase 2A / Phase 5
 *
 * Session storage moved from the in-memory USERS Map to PostgreSQL via Prisma.
 * The cookie carries a session id plus a random token; only the token's SHA-256
 * reaches the database, so the raw token is never persisted.
 *
 * Security properties:
 *   - HttpOnly, SameSite=Lax, Secure in production
 *   - HMAC signature over the cookie value (tamper detection)
 *   - Timing-safe comparison for the HMAC, the token hash, and the password
 *   - Registration writes the user, the consent record, and the audit entry in
 *     one transaction, so a user can never exist without its consent record
 *   - Notifications fire after the transaction commits, never inside it
 *
 * Route guards live in ./rbac, the Origin check in ./csrf, and attempt
 * throttling in ./rate-limit. This module only issues and reads sessions.
 */

import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/client';
import { sendNotification } from '@/lib/notifications';
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/ndpa/consent';

import type { RoleKey } from '@/lib/permissions/roles';

export type UserRole = RoleKey; // kept for callers that import this name

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  /** Code-safe role key, e.g. 'member' | 'admin' | 'superAdmin'. Defaults to 'visitor' when no role is assigned. */
  role: RoleKey;
};

const SESSION_COOKIE = 'ehems_session';
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET ?? 'dev-secret-change-me-in-production';

// Session lifetimes. These must stay in step with the SystemSetting rows seeded
// in prisma/seed.ts (session_lifetime_member_days, session_absolute_cap_days).
const MEMBER_SESSION_DAYS = 7;
const ABSOLUTE_SESSION_DAYS = 30;

// ---------------------------------------------------------------------------
// Password hashing (bcrypt)
// ---------------------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.includes(':')) {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const candidate = crypto.pbkdf2Sync(password, salt, 120_000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
  }
  return bcrypt.compare(password, storedHash);
}

// ---------------------------------------------------------------------------
// Cookie encoding — session id + token, signed with HMAC
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
  ipAddress?: string;
  userAgent?: string;
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

  const passwordHash = await hashPassword(input.password);
  const requestContext = { ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null };

  // One transaction: a user without its consent record would be a SEC-011
  // breach, and a consent record without its user would be an orphan.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: normalizedEmail,
        name: trimmedName,
        passwordHash,
        // Assign the 'member' role by connecting to the seeded Role row.
        roleRef: { connect: { name: 'member' } },
        userRoles: { create: { roleId: 'role-member' } },
      },
      include: { roleRef: true },
    });

    await tx.consentRecord.create({
      data: {
        userId: created.id,
        consentVersion: CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
      },
    });

    // AuditLog is append-only and carries no ip_address column, so the request
    // context lives in metadata rather than being dropped.
    await tx.auditLog.create({
      data: {
        actorId: created.id,
        action: 'USER_REGISTERED',
        entityType: 'User',
        entityId: created.id,
        metadata: {
          email: created.email,
          name: created.name,
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent,
        },
      },
    });

    return created;
  });

  // After the commit, so a provider failure cannot roll back the account.
  await sendNotification({
    event: 'WELCOME_REGISTRATION',
    recipient: { userId: user.id, email: user.email, name: user.name },
    payload: { name: user.name },
  }).catch(() => null);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: (user.roleRef?.name ?? 'visitor') as RoleKey,
  };
}

export async function authenticateUser(input: {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<SessionUser> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { roleRef: true },
  });

  // Hash a throwaway password when the account is unknown so the response time
  // does not reveal whether the address is registered.
  if (!user || user.deletedAt) {
    await hashPassword(input.password);
    throw new Error('Invalid email or password');
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'USER_LOGGED_IN',
      entityType: 'User',
      entityId: user.id,
      metadata: { ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null },
    },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: (user.roleRef?.name ?? 'visitor') as RoleKey,
  };
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
    include: { user: { include: { roleRef: true } } },
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
    role: (session.user.roleRef?.name ?? 'visitor') as RoleKey,
  };
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}

export async function signIn(user: SessionUser): Promise<void> {
  const cookieStore = await cookies();

  // Session rotation: the previous row goes before the new one is created.
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
    data: { userId: user.id, tokenHash, expiresAt, absoluteExpiresAt },
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
