import { prisma } from '@/lib/db/client';
import { verifyPassword } from './password';

export type ProfileUpdate = {
  name: string;
  phone: string;
  profession: string;
  healthcareSpecialty?: string;
};

export async function verifyCurrentPassword(userId: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return false;
  return verifyPassword(password, user.passwordHash);
}

export async function updateProfile(
  userId: string,
  input: ProfileUpdate,
  context: { ipAddress?: string; userAgent?: string },
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: {
        name: input.name,
        phone: input.phone,
        profession: input.profession,
        healthcareSpecialty: input.healthcareSpecialty || null,
      },
    });
    if (updated.count !== 1) return false;

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'USER_PROFILE_UPDATED',
        entityType: 'User',
        entityId: userId,
        metadata: {
          changedFields: ['name', 'phone', 'profession', 'healthcareSpecialty'],
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      },
    });
    return true;
  });
}
