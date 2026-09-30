import crypto from 'node:crypto';
import { prisma } from '@/lib/db/client';
import { sendNotification } from '@/lib/notifications';
import { hashPassword } from './password';

const RESET_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

export function createPasswordResetUrl(baseUrl: string, token: string): string {
  const base = new URL(baseUrl);
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') {
    throw new Error('APP_BASE_URL must use HTTPS in production');
  }

  const resetUrl = new URL('/reset-password', base);
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
}

/** Always expose the same response to the caller, whether or not the user exists. */
export async function requestPasswordReset(email: string, baseUrl: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.deletedAt) return;

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_LIFETIME_MS);
  const resetUrl = createPasswordResetUrl(baseUrl, token);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt },
    });
    await tx.auditLog.create({
      data: {
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user.id,
        metadata: { expiresAt: expiresAt.toISOString() },
      },
    });
  });

  const delivery = await sendNotification({
    event: 'PASSWORD_RESET',
    recipient: { userId: user.id, email: user.email, name: user.name },
    payload: { name: user.name, resetUrl },
  }).catch(() => null);

  if (!delivery?.success) {
    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id: user.id, passwordResetTokenHash: tokenHash },
        data: { passwordResetTokenHash: null, passwordResetExpiresAt: null },
      });
      await tx.auditLog.create({
        data: {
          action: 'PASSWORD_RESET_EMAIL_FAILED',
          entityType: 'User',
          entityId: user.id,
          metadata: { reason: 'notification_delivery_failed' },
        },
      });
    });
  }
}

/** Consume a reset token once, change the hash, and invalidate all sessions. */
export async function completePasswordReset(token: string, password: string): Promise<boolean> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { passwordResetTokenHash: tokenHash } });
  if (
    !user ||
    user.deletedAt ||
    !user.passwordResetExpiresAt ||
    user.passwordResetExpiresAt <= now
  ) {
    return false;
  }

  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: user.id,
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: now },
        deletedAt: null,
      },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    if (updated.count !== 1) return false;

    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'PASSWORD_RESET_COMPLETED',
        entityType: 'User',
        entityId: user.id,
      },
    });
    return true;
  });
}
