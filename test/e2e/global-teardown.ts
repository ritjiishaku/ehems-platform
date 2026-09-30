import { PrismaClient } from '@prisma/client';

/** Restore the fail-closed mode after payment E2E changed it for the journey. */
export default async function globalTeardown(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.systemSetting.upsert({
      where: { key: 'payment.instructions.mode' },
      create: {
        key: 'payment.instructions.mode',
        value: 'disabled',
        description: 'test | live | disabled. Payment instructions are fail-closed by default.',
        updatedBy: 'e2e:global-teardown',
      },
      update: { value: 'disabled', updatedBy: 'e2e:global-teardown' },
    });
  } finally {
    await prisma.$disconnect();
  }
}
