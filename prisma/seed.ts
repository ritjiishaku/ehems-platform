/**
 * EHEMS Phase 2B Seed (current catalogue data; alignment pending)
 *
 * Extends the Phase 2A seed (CommunityLink, RetentionPolicy, SystemSetting)
 * with decision-dependent domain data. Phase 0 decisions were confirmed
 * 2026-09-28; this seed still needs alignment to those decisions:
 *
 *   D-3  → seed the five assignable RBAC roles. Existing databases may still
 *          contain six legacy role rows; do not delete assignment history
 *          without reviewing it.
 *   D-5  → 6-tier catalogue (exact names, prices in kobo, per AGENTS.md §3 + PRD §11.1)
 *          + TierBenefit rows
 *          + 26 currently enumerated CertificateCatalogue names; approved
 *            total is 27, with one name/tier mapping pending from the client
 *          + TierCertificate mappings must be reviewed after that input
 *
 * Business rules enforced here (must match code + tests — AGENTS.md §6):
 *   BR-001  One-time payments only — no recurring flag seeded
 *   BR-003  Upgrade uses list price; discountedPriceKobo for first-timer display only
 *   BR-005  50% Advanced discount for first-time, first Advanced-tier purchase only
 *   BR-006  Discounted prices: Adv IV = 375,000; Adv V = 450,000; Higher Adv VIII = 625,000
 *   BR-016  Tiers II, VI, VII are retired — NOT seeded
 *
 * All amounts in kobo (Int). 1 NGN = 100 kobo.
 * Run: npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
import { ROLES } from '../lib/permissions/roles';
import { CONSENT_VERSION } from '../lib/ndpa/consent';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ngn(naira: number): number {
  return naira * 100;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** RBAC roles — keyed by ROLES constant so seed and code share one source of truth.
 *  Deterministic IDs match the add_rbac migration backfill rows. */
const ROLE_ROWS = Object.values(ROLES).map((r) => ({
  id: r.id,
  name: r.key,
  label: r.label,
  description: r.description,
  isSystem: true as const,
}));

// ---------------------------------------------------------------------------
// Tiers  (BR-016: II, VI, VII absent)
// ---------------------------------------------------------------------------

const TIERS = [
  {
    id: 'tier-ofree',
    name: "O'Free Levels",
    displayOrder: 1,
    priceKobo: 0,
    currency: 'NGN',
    mentorshipDurationMonths: 0,
    positioningText: 'Start your journey for free',
    isFree: true,
    benefits: [
      { text: 'Weekly sustainability class', category: 'learning' },
      { text: 'Networking sessions', category: 'community' },
      { text: 'Monthly Zoom growth meetings', category: 'community' },
      { text: 'General community access', category: 'community' },
    ],
    certMinOrder: 99, // no certs at this tier
  },
  {
    id: 'tier-basic',
    name: 'Basic Level',
    displayOrder: 2,
    priceKobo: ngn(300_000),
    currency: 'NGN',
    mentorshipDurationMonths: 1,
    positioningText: 'Build your professional foundation',
    isFree: false,
    benefits: [
      { text: 'Weekly sustainability class', category: 'learning' },
      { text: 'Networking sessions', category: 'community' },
      { text: 'Monthly Zoom growth meetings', category: 'community' },
      { text: 'General community access', category: 'community' },
      { text: '6 professional certificates', category: 'certificates' },
      { text: '1 month mentorship', category: 'mentorship' },
      { text: 'Reference letter', category: 'support' },
    ],
    certMinOrder: 2,
  },
  {
    id: 'tier-basic-iii',
    name: 'Basic Level III',
    displayOrder: 3,
    priceKobo: ngn(550_000),
    currency: 'NGN',
    mentorshipDurationMonths: 1,
    positioningText: 'Accelerate your career growth',
    isFree: false,
    benefits: [
      { text: 'Weekly sustainability class', category: 'learning' },
      { text: 'Networking sessions', category: 'community' },
      { text: 'Monthly Zoom growth meetings', category: 'community' },
      { text: 'General community access', category: 'community' },
      { text: '10 professional certificates', category: 'certificates' },
      { text: '1 month mentorship', category: 'mentorship' },
      { text: 'Reference letter', category: 'support' },
      { text: 'Career support', category: 'support' },
    ],
    certMinOrder: 2,
  },
  {
    id: 'tier-advanced-iv',
    name: 'Advanced Level IV',
    displayOrder: 4,
    priceKobo: ngn(750_000),
    currency: 'NGN',
    mentorshipDurationMonths: 2,
    positioningText: 'Build your business & consulting expertise',
    isFree: false,
    benefits: [
      { text: 'Weekly sustainability class', category: 'learning' },
      { text: 'Networking sessions', category: 'community' },
      { text: 'Monthly Zoom growth meetings', category: 'community' },
      { text: 'General + EHEMS OPEN community access', category: 'community' },
      { text: '15 professional certificates', category: 'certificates' },
      { text: '2 months mentorship', category: 'mentorship' },
      { text: 'Reference letter', category: 'support' },
      { text: 'Career support', category: 'support' },
    ],
    certMinOrder: 2,
  },
  {
    id: 'tier-advanced-v',
    name: 'Advanced Level V',
    displayOrder: 5,
    priceKobo: ngn(900_000),
    currency: 'NGN',
    mentorshipDurationMonths: 3,
    positioningText: 'Establish your brand & industry influence',
    isFree: false,
    benefits: [
      { text: 'Weekly sustainability class', category: 'learning' },
      { text: 'Networking sessions', category: 'community' },
      { text: 'Monthly Zoom growth meetings', category: 'community' },
      { text: 'General + EHEMS OPEN community access', category: 'community' },
      { text: '20 professional certificates', category: 'certificates' },
      { text: '3 months mentorship', category: 'mentorship' },
      { text: 'Reference letter', category: 'support' },
      { text: 'Career support', category: 'support' },
    ],
    certMinOrder: 2,
  },
  {
    id: 'tier-higher-adv-viii',
    name: 'Higher Advanced VIII',
    displayOrder: 6,
    priceKobo: ngn(1_250_000),
    currency: 'NGN',
    mentorshipDurationMonths: 6,
    positioningText: 'Become a global impact leader',
    isFree: false,
    benefits: [
      { text: 'Weekly sustainability class', category: 'learning' },
      { text: 'Networking sessions', category: 'community' },
      { text: 'Monthly Zoom growth meetings', category: 'community' },
      { text: 'General + EHEMS OPEN community access', category: 'community' },
      { text: '25+ professional certificates', category: 'certificates' },
      { text: '6 months mentorship', category: 'mentorship' },
      { text: 'Reference letter', category: 'support' },
      { text: 'Career support', category: 'support' },
      { text: 'Premium benefits', category: 'premium' },
    ],
    certMinOrder: 2,
  },
] as const;

// ---------------------------------------------------------------------------
// Certificate catalogue — PRD §11.3
// minTierDisplayOrder = lowest tier display_order that receives this cert
// ---------------------------------------------------------------------------

const CERTIFICATES: Array<{
  id: string;
  name: string;
  category: string;
  description: string;
  minTierDisplayOrder: number;
}> = [
  // Caregiving (5) — Basic and above (display_order >= 2)
  { id: 'cert-professional-caregiving', name: 'Professional Caregiving', category: 'Caregiving', description: 'Foundational professional caregiving skills and standards.', minTierDisplayOrder: 2 },
  { id: 'cert-healthcare-assistant', name: 'Healthcare Assistant', category: 'Caregiving', description: 'Core competencies for healthcare assistant roles.', minTierDisplayOrder: 2 },
  { id: 'cert-home-health-support', name: 'Home Health Support Services', category: 'Caregiving', description: 'Delivering effective support services in home health settings.', minTierDisplayOrder: 2 },
  { id: 'cert-first-aid', name: 'First Aid & Emergency Response', category: 'Caregiving', description: 'Practical first aid and emergency response protocols.', minTierDisplayOrder: 2 },
  { id: 'cert-elderly-care', name: 'Elderly Care Specialist', category: 'Caregiving', description: 'Specialist knowledge in elder care and gerontology support.', minTierDisplayOrder: 2 },

  // Business (4)
  { id: 'cert-project-management', name: 'Project Management Fundamentals', category: 'Business', description: 'Project planning, execution, and delivery fundamentals.', minTierDisplayOrder: 2 },
  { id: 'cert-business-communication', name: 'Business Communication & Workplace Excellence', category: 'Business', description: 'Professional communication and workplace effectiveness skills.', minTierDisplayOrder: 3 },
  { id: 'cert-management-consulting', name: 'Management Consulting', category: 'Business', description: 'Frameworks and practice of management consulting.', minTierDisplayOrder: 3 },
  { id: 'cert-healthcare-business-consulting', name: 'Healthcare Business Consulting', category: 'Business', description: 'Business consulting applied to the healthcare sector.', minTierDisplayOrder: 3 },

  // Branding (3)
  { id: 'cert-digital-branding', name: 'Digital Branding', category: 'Branding', description: 'Building and managing professional brands in digital spaces.', minTierDisplayOrder: 3 },
  { id: 'cert-personal-branding', name: 'Personal Branding', category: 'Branding', description: 'Crafting and communicating a compelling personal brand.', minTierDisplayOrder: 4 },
  { id: 'cert-ai-product-branding', name: 'AI Product Branding', category: 'Branding', description: 'Branding strategy for AI-powered products and services.', minTierDisplayOrder: 4 },

  // Digital Health (4)
  { id: 'cert-health-informatics', name: 'Health Informatics', category: 'Digital Health', description: 'Managing health data and information systems effectively.', minTierDisplayOrder: 4 },
  { id: 'cert-digital-health', name: 'Digital Health', category: 'Digital Health', description: 'Digital transformation in healthcare delivery and practice.', minTierDisplayOrder: 4 },
  { id: 'cert-project-informatics', name: 'Project Informatics', category: 'Digital Health', description: 'Information management for healthcare project delivery.', minTierDisplayOrder: 4 },
  { id: 'cert-digital-informatics', name: 'Digital Informatics', category: 'Digital Health', description: 'Applying digital informatics in health systems and research.', minTierDisplayOrder: 5 },

  // Communication (2)
  { id: 'cert-public-speaking', name: 'Dynamic Public Speaking', category: 'Communication', description: 'Developing confident, dynamic public speaking skills.', minTierDisplayOrder: 5 },
  { id: 'cert-correspondence-writing', name: 'Correspondence & Memo Writing', category: 'Communication', description: 'Professional correspondence, memo, and report writing.', minTierDisplayOrder: 5 },

  // Specialist (5)
  { id: 'cert-hospitality-management', name: 'Hospitality Management', category: 'Specialist', description: 'Principles and practice of hospitality management.', minTierDisplayOrder: 5 },
  { id: 'cert-healthcare-real-estate', name: 'Healthcare Real Estate Development', category: 'Specialist', description: 'Developing and managing healthcare real estate assets.', minTierDisplayOrder: 5 },
  { id: 'cert-ideas-innovation', name: 'Ideas Generation & Innovation Specialist', category: 'Specialist', description: 'Structured innovation methodologies for healthcare leaders.', minTierDisplayOrder: 6 },
  { id: 'cert-professional-counselling', name: 'Professional Counselling', category: 'Specialist', description: 'Foundations and ethics of professional counselling practice.', minTierDisplayOrder: 6 },
  { id: 'cert-videography-content', name: 'Videography & Content Creation', category: 'Specialist', description: 'Video production and content creation for health communications.', minTierDisplayOrder: 6 },

  // Recognition (3)
  { id: 'cert-organizational', name: 'EHEMS Organizational Certificate', category: 'Recognition', description: 'Recognition of organisational leadership and EHEMS membership excellence.', minTierDisplayOrder: 6 },
  { id: 'cert-global-impact', name: 'EHEMS Global Impact Leadership Recognition Certificate', category: 'Recognition', description: 'Awarded to leaders demonstrating global healthcare impact.', minTierDisplayOrder: 6 },
  { id: 'cert-diploma-tourism', name: 'Diploma in Tourism Hospitality & Tours Management', category: 'Recognition', description: 'Diploma-level recognition in tourism, hospitality, and tours management.', minTierDisplayOrder: 6 },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding EHEMS (Phase 2A + Phase 2B)…');

  // -------------------------------------------------------------------------
  // CommunityLink (Phase 2A)
  // -------------------------------------------------------------------------
  await prisma.communityLink.upsert({
    where: { id: 'seed-general-community' },
    update: {},
    create: {
      id: 'seed-general-community',
      name: 'EHEMS General Community',
      url: '',
      accessLevel: 'general',
      tierName: null,
      active: false,
    },
  });

  // -------------------------------------------------------------------------
  // RetentionPolicy (Phase 2A)
  // -------------------------------------------------------------------------
  const retentionPolicies = [
    { id: 'seed-retention-user',         category: 'user_account',       expiryDays: 2555, description: 'User account data. Erasure after data_retention_until.' },
    { id: 'seed-retention-consent',      category: 'consent_record',     expiryDays: 2555, description: 'Consent records including withdrawal. Never deleted, only expired.' },
    { id: 'seed-retention-dsr',          category: 'data_subject_request', expiryDays: 2555, description: 'Provisional: follows user-account retention pending client/legal schedule.' },
    { id: 'seed-retention-payment',      category: 'payment_proof',      expiryDays: 2555, description: 'Payment proof files and payment records.' },
    { id: 'seed-retention-audit',        category: 'audit_log',          expiryDays: 3650, description: 'Append-only audit log. Must outlive the records it audits.' },
    { id: 'seed-retention-attendance',   category: 'attendance_record',  expiryDays: 3650, description: 'Attendance records. Must outlive the certificates they support.' },
    { id: 'seed-retention-session',      category: 'session',            expiryDays: 30,   description: 'Authentication sessions.' },
    { id: 'seed-retention-notification', category: 'notification',       expiryDays: 365,  description: 'Sent notification log.' },
  ];

  for (const policy of retentionPolicies) {
    await prisma.retentionPolicy.upsert({
      where: { id: policy.id },
      update: { expiryDays: policy.expiryDays, description: policy.description },
      create: policy,
    });
  }

  // -------------------------------------------------------------------------
  // SystemSetting (Phase 2A)
  // -------------------------------------------------------------------------
  const settings: Array<{
    key: string;
    value: string;
    description?: string | null;
    updatedBy?: string;
  }> = [
    { key: 'consent_version',                value: CONSENT_VERSION },
    { key: 'session_lifetime_member_days',    value: '7' },
    { key: 'session_lifetime_admin_minutes',  value: '30' },
    { key: 'session_absolute_cap_days',       value: '30' },
    { key: 'login_max_attempts',              value: '5' },
    { key: 'login_lockout_minutes',           value: '15' },
    { key: 'password_reset_max_per_hour',     value: '3' },
    {
      key: 'payment.instructions.mode',
      value: 'disabled',
      description: 'test | live | disabled. Payment instructions are fail-closed by default.',
      updatedBy: 'seed:main',
    },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {
        ...(setting.description ? { description: setting.description } : {}),
        ...(setting.updatedBy ? { updatedBy: setting.updatedBy } : {}),
      },
      create: setting,
    });
  }

  // -------------------------------------------------------------------------
  // Roles (D-3)
  // -------------------------------------------------------------------------
  console.log('Seeding roles…');
  for (const role of ROLE_ROWS) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: { label: role.label, description: role.description },
      create: role,
    });
  }

  // -------------------------------------------------------------------------
  // Tier catalogue + benefits (D-5, BR-001—BR-007, BR-016)
  // -------------------------------------------------------------------------
  console.log('Seeding tiers…');
  for (const tier of TIERS) {
    const { benefits, certMinOrder, ...tierData } = tier;
    void certMinOrder; // Legacy annotation; D-5's tier count mapping remains incomplete.

    await prisma.tier.upsert({
      where: { id: tierData.id },
      update: {
        name: tierData.name,
        displayOrder: tierData.displayOrder,
        priceKobo: tierData.priceKobo,
        mentorshipDurationMonths: tierData.mentorshipDurationMonths,
        positioningText: tierData.positioningText,
        isFree: tierData.isFree,
      },
      create: tierData,
    });

    // Benefits: delete-then-recreate keeps display_order in sync on re-runs
    await prisma.tierBenefit.deleteMany({ where: { tierId: tierData.id } });
    for (let i = 0; i < benefits.length; i++) {
      await prisma.tierBenefit.create({
        data: {
          tierId: tierData.id,
          benefitText: (benefits[i] as { text: string; category: string }).text,
          category: (benefits[i] as { text: string; category: string }).category,
          displayOrder: i + 1,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Certificate catalogue + tier mapping (D-5, BR-017)
  // -------------------------------------------------------------------------
  console.log('Seeding certificate catalogue…');
  for (const cert of CERTIFICATES) {
    const { minTierDisplayOrder, category, ...certData } = cert;
    // The PRD catalogue groups names by category, but §16.3 has no category
    // column. Keep the seed annotations for review without persisting a new field.
    void category;

    await prisma.certificateCatalogue.upsert({
      where: { id: certData.id },
      update: { name: certData.name, description: certData.description },
      create: certData,
    });

    // Map to every tier whose display_order >= minTierDisplayOrder
    for (const tier of TIERS) {
      if (tier.displayOrder >= minTierDisplayOrder) {
        await prisma.tierCertificate.upsert({
          where: { tierId_certificateId: { tierId: tier.id, certificateId: certData.id } },
          update: {},
          create: { tierId: tier.id, certificateId: certData.id },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  console.log('');
  console.log('Seed complete.');
  console.log('');
  console.log(`  Roles:        ${ROLE_ROWS.length}`);
  console.log(`  Tiers:        ${TIERS.length} (I/III/IV/V/VIII — II/VI/VII retired per BR-016)`);
  console.log(`  Certificates: ${CERTIFICATES.length}`);
  console.log('');
  console.log('Next steps:');
  console.log('  - Set CommunityLink URL via admin panel (D-17)');
  console.log('  - Confirm RetentionPolicy days with client (D-14)');
  console.log('  - Create first Super Admin user via db:studio or a one-off script');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
