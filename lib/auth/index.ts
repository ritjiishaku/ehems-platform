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
import { prisma } from '@/lib/db/client';
import { sendNotification } from '@/lib/notifications';
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/ndpa/consent';
import { linkEnrolmentToProgrammes } from '@/lib/programmes';
import { hashPassword, passwordHashNeedsUpgrade, verifyPassword } from './password';
import { ABSOLUTE_SESSION_MS, sessionExpiryAfterActivity } from './session-policy';
import { MemberSafeError } from './member-safe-error';

import { isRoleKey, type RoleKey } from '@/lib/permissions/roles';

export type UserRole = RoleKey; // kept for callers that import this name

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  /** Canonical persisted role key; null means no role and therefore no permissions. */
  role: RoleKey | null;
};

const SESSION_COOKIE = 'ehems_session';
const configuredSessionSecret = process.env.AUTH_SESSION_SECRET;
if (
  process.env.NODE_ENV === 'production' &&
  (!configuredSessionSecret || Buffer.byteLength(configuredSessionSecret) < 32)
) {
  throw new Error('AUTH_SESSION_SECRET must be set to at least 32 characters in production');
}
const SESSION_SECRET = configuredSessionSecret ?? 'local-development-secret-not-for-production';

function sessionRole(roleName: string | null | undefined): RoleKey | null {
  return roleName && isRoleKey(roleName) ? roleName : null;
}

// ---------------------------------------------------------------------------
async function upgradePasswordHash(
  userId: string,
  oldHash: string,
  password: string,
): Promise<void> {
  const newHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, passwordHash: oldHash },
      data: { passwordHash: newHash },
    });
    if (updated.count !== 1) return;

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'USER_PASSWORD_HASH_UPGRADED',
        entityType: 'User',
        entityId: userId,
        metadata: { algorithm: 'argon2id' },
      },
    });
  });
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
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (signatureBytes.length !== expectedBytes.length) return null;
  if (!crypto.timingSafeEqual(signatureBytes, expectedBytes)) return null;

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
  phone: string;
  profession: string;
  healthcareSpecialty?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<SessionUser> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedName = input.name.trim();

  if (!trimmedName || !normalizedEmail || input.password.length < 8) {
    throw new MemberSafeError('Invalid registration details');
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new MemberSafeError('An account with that email address already exists');
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
        phone: input.phone,
        profession: input.profession.trim(),
        healthcareSpecialty: input.healthcareSpecialty?.trim() || null,
        passwordHash,
        // Assign the 'member' role by connecting to the seeded Role row.
        roleRef: { connect: { name: 'member' } },
        userRoles: { create: { roleId: 'role-member' } },
      },
      include: { roleRef: true },
    });

    const freeTier = await tx.tier.findFirst({
      where: { name: "O'Free Levels", isFree: true, active: true },
      orderBy: { displayOrder: 'asc' },
    });
    if (!freeTier) {
      // Registration must not succeed without the D-1 entitlement. Throwing
      // rolls back the user and consent together rather than creating an account
      // whose first-login state depends on a later repair job.
      //
      // Deliberately *not* a MemberSafeError: a missing tier is a server
      // misconfiguration (usually an unseeded database), and naming it to a
      // member would disclose our configuration state. The action logs it and
      // shows a generic failure instead.
      throw new Error("The O'Free tier is not configured");
    }

    const freeEnrolment = await tx.enrolment.create({
      data: {
        userId: created.id,
        tierId: freeTier.id,
        status: 'active',
      },
    });

    // D-1: O'Free activates at creation because it has no payment. It therefore
    // also has to link its programmes here, or `markAttendance` would reject every
    // mark for an O'Free member for want of an `EnrolmentProgramme` row. This is
    // the only O'Free-specific activation branch, which is why it is safe to keep
    // it out of `activateEnrolment`.
    await linkEnrolmentToProgrammes(tx, freeEnrolment.id, freeTier.id);

    await tx.consentRecord.create({
      data: {
        userId: created.id,
        consentType: 'data_processing',
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

    await tx.auditLog.create({
      data: {
        actorId: created.id,
        action: 'ENROLMENT_ACTIVATED',
        entityType: 'Enrolment',
        entityId: freeEnrolment.id,
        metadata: { tierId: freeTier.id, trigger: 'registration_d1_exception' },
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
    role: sessionRole(user.roleRef?.name),
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
    throw new MemberSafeError('Invalid email or password');
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new MemberSafeError('Invalid email or password');
  }

  if (passwordHashNeedsUpgrade(user.passwordHash)) {
    await upgradePasswordHash(user.id, user.passwordHash, input.password);
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
    role: sessionRole(user.roleRef?.name),
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
  const storedTokenHash = Buffer.from(session.tokenHash);
  const providedTokenHash = Buffer.from(tokenHash);
  if (storedTokenHash.length !== providedTokenHash.length) return null;
  if (!crypto.timingSafeEqual(storedTokenHash, providedTokenHash)) return null;

  const now = new Date();
  if (session.expiresAt < now || session.absoluteExpiresAt < now) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => null);
    return null;
  }

  if (session.user.deletedAt) return null;

  const activeRole = sessionRole(session.user.roleRef?.name);
  const renewedExpiry = sessionExpiryAfterActivity(now, activeRole, session.absoluteExpiresAt);
  if (renewedExpiry.getTime() > session.expiresAt.getTime()) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: renewedExpiry },
    });
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: sessionRole(session.user.roleRef?.name),
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
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_SESSION_MS);
  const expiresAt = sessionExpiryAfterActivity(now, user.role, absoluteExpiresAt);

  const session = await prisma.session.create({
    data: { userId: user.id, tokenHash, expiresAt, absoluteExpiresAt },
  });

  cookieStore.set(SESSION_COOKIE, encodeCookieValue(session.id, token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Keep the browser cookie through the absolute cap; the database expiry
    // enforces the shorter inactivity window and is checked on every request.
    maxAge: ABSOLUTE_SESSION_MS / 1000,
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

/** Revoke all of a user's sessions after a password or privilege change. */
export async function invalidateUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
