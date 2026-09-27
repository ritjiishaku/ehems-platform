/**
 * EHEMS Phase 2A Seed
 *
 * Seeds only the entities that are confirmed and unblocked. The tier and
 * certificate catalogues are blocked on D-3 and D-5 respectively and are
 * NOT seeded here — seeding them before decisions are recorded would set the
 * client's first-login view to unconfirmed data.
 *
 * What is seeded:
 *   - CommunityLink rows (general access — all tiers; one placeholder)
 *   - RetentionPolicy rows per data category (SEC-016)
 *   - SystemSetting defaults
 *
 * Run: npm run db:seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding EHEMS Phase 2A data…');

  // -------------------------------------------------------------------------
  // CommunityLink — general access placeholder
  // -------------------------------------------------------------------------
  // The actual WhatsApp/Telegram URLs are data, not code (AGENTS.md §7).
  // D-17 (Probation Room ordering) is unresolved, so no URL is seeded yet.
  // An admin will fill in the URL via the admin panel once D-17 is answered.
  // -------------------------------------------------------------------------
  await prisma.communityLink.upsert({
    where: { id: 'seed-general-community' },
    update: {},
    create: {
      id: 'seed-general-community',
      name: 'EHEMS General Community',
      url: '', // Admin must update via admin panel once D-17 is resolved
      accessLevel: 'general',
      tierName: null, // null = all tiers
      active: false, // Inactive until URL is set
    },
  });

  // -------------------------------------------------------------------------
  // RetentionPolicy — SEC-016
  // -------------------------------------------------------------------------
  // Periods are conservative defaults, not client-confirmed values.
  // D-14 flags that NFRs including retention windows are pending confirmation.
  // Update expiryDays once the client confirms them.
  // -------------------------------------------------------------------------
  const retentionPolicies = [
    {
      id: 'seed-retention-user',
      category: 'user_account',
      expiryDays: 2555, // ~7 years from account creation
      description: 'User account data. Erasure after data_retention_until.',
    },
    {
      id: 'seed-retention-consent',
      category: 'consent_record',
      expiryDays: 2555, // 7 years — consent records must outlive the account
      description: 'Consent records including withdrawal. Never deleted, only expired.',
    },
    {
      id: 'seed-retention-payment',
      category: 'payment_proof',
      expiryDays: 2555, // 7 years — financial record-keeping requirement
      description: 'Payment proof files and payment records.',
    },
    {
      id: 'seed-retention-audit',
      category: 'audit_log',
      expiryDays: 3650, // 10 years — audit logs outlive most other data
      description: 'Append-only audit log. Must outlive the records it audits.',
    },
    {
      id: 'seed-retention-attendance',
      category: 'attendance_record',
      expiryDays: 3650, // 10 years — must outlive certificates (BR-010)
      description: 'Attendance records. Must outlive the certificates they support.',
    },
    {
      id: 'seed-retention-session',
      category: 'session',
      expiryDays: 30, // Sessions expire per the session.absolute_expires_at column
      description: 'Authentication sessions.',
    },
    {
      id: 'seed-retention-notification',
      category: 'notification',
      expiryDays: 365,
      description: 'Sent notification log.',
    },
  ];

  for (const policy of retentionPolicies) {
    await prisma.retentionPolicy.upsert({
      where: { id: policy.id },
      update: { expiryDays: policy.expiryDays, description: policy.description },
      create: policy,
    });
  }

  // -------------------------------------------------------------------------
  // SystemSetting defaults
  // -------------------------------------------------------------------------
  const settings = [
    {
      key: 'consent_version',
      value: '1.0',
    },
    {
      key: 'session_lifetime_member_days',
      value: '7',
    },
    {
      key: 'session_lifetime_admin_minutes',
      value: '30',
    },
    {
      key: 'session_absolute_cap_days',
      value: '30',
    },
    {
      key: 'login_max_attempts',
      value: '5',
    },
    {
      key: 'login_lockout_minutes',
      value: '15',
    },
    {
      key: 'password_reset_max_per_hour',
      value: '3',
    },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('Seed complete.');
  console.log('');
  console.log('Next steps:');
  console.log('  - Set CommunityLink URL once D-17 is resolved');
  console.log('  - Confirm RetentionPolicy days with client (D-14)');
  console.log('  - Phase 2B: seed tiers + certificates once D-3/D-5 answered');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
