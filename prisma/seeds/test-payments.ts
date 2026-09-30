/**
 * SEED TEST DATA ONLY — never run against production.
 *
 * Every value is deliberately non-functional. The explicit opt-in is required
 * even outside production so nobody can accidentally make a local database look
 * live by running the wrong seed command.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'test-payments seed refused: NODE_ENV is production. This seed contains non-functional payment details.',
    );
  }
  if (process.env.DATABASE_URL?.toLowerCase().includes('prod')) {
    throw new Error('test-payments seed refused: DATABASE_URL looks like production.');
  }
  if (process.env.ALLOW_TEST_PAYMENT_SEED !== 'true') {
    throw new Error('test-payments seed refused: set ALLOW_TEST_PAYMENT_SEED=true to proceed.');
  }
}

export const TEST_PAYMENT_SETTINGS = [
  { key: 'payment.bank.name', value: 'EHEMS TEST BANK - DO NOT USE', description: 'Staging value. Replaced before launch.' },
  { key: 'payment.bank.account_name', value: 'EHEMS TEST ACCOUNT - DO NOT SEND MONEY', description: 'Staging value. Replaced before launch.' },
  { key: 'payment.bank.account_number', value: '0000000000', description: 'Invalid NUBAN. Any real transfer will fail.' },
  { key: 'payment.bank.reference_format', value: 'TEST-{memberId}', description: 'Staging reference pattern.' },
  { key: 'payment.bank.accept_any_bank', value: 'true', description: null },
  { key: 'payment.mobile_money.enabled', value: 'false', description: 'Disabled in staging. Flip when provider confirmed.' },
  { key: 'payment.mobile_money.provider', value: 'TEST PROVIDER', description: null },
  { key: 'payment.mobile_money.number', value: '0000000000', description: 'Reserved test range.' },
  { key: 'payment.mobile_money.account_name', value: 'EHEMS TEST - DO NOT SEND', description: null },
  { key: 'payment.support.name', value: 'EHEMS Test Support', description: null },
  { key: 'payment.support.phone', value: '+2348000000000', description: 'Reserved test range. Not a live number.' },
  { key: 'payment.support.email', value: 'payments-test@ehems.example', description: '.example TLD cannot receive mail.' },
  { key: 'payment.proof.retention_months', value: '24', description: null },
  { key: 'payment.instructions.mode', value: 'test', description: 'test | live | disabled. Governs payment visibility and uploads.' },
] as const;

async function main(): Promise<void> {
  assertNotProduction();

  for (const setting of TEST_PAYMENT_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: { ...setting, updatedBy: 'seed:test-payments' },
      update: { value: setting.value, description: setting.description, updatedBy: 'seed:test-payments' },
    });
  }

  console.log(`Seeded ${TEST_PAYMENT_SETTINGS.length} test payment settings.`);
  console.log('MODE: test - non-functional destination; test banner will be shown.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
