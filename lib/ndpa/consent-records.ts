import { prisma } from '@/lib/db/client';

export type ConsentRequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

/** Withdraw a member-owned consent record without deleting its history. */
export async function withdrawConsent(
  userId: string,
  consentId: string,
  context: ConsentRequestContext,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const record = await tx.consentRecord.findFirst({
      where: { id: consentId, userId },
    });
    if (!record) return false;
    if (record.withdrawnAt) return true;

    const withdrawnAt = new Date();
    const updated = await tx.consentRecord.updateMany({
      where: { id: consentId, userId, withdrawnAt: null },
      data: { withdrawnAt },
    });
    if (updated.count !== 1) return true;

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'CONSENT_WITHDRAWN',
        entityType: 'ConsentRecord',
        entityId: consentId,
        metadata: {
          consentType: record.consentType,
          consentVersion: record.consentVersion,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      },
    });

    return true;
  });
}
