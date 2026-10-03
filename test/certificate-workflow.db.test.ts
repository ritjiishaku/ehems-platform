import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/client';
import {
  issueCertificates,
  listCertificateCandidates,
  listMemberCertificates,
  verifyCertificate,
} from '@/lib/certificates';
import { reviewCompletion } from '@/lib/completion';
import {
  isWellFormedVerificationId,
  newVerificationId,
  normaliseVerificationId,
} from '@/lib/certificates/verification-id';

/**
 * Certificate issuance (BR-010).
 *
 * The four assertions that matter, in the order they would fail in production:
 * completion does not issue, issuance requires completion, an issued certificate is
 * never rewritten, and the tier catalogue is what entitles a member to a name.
 */

const suffix = randomBytes(4).toString('hex');

let adminId = '';
let memberId = '';
let completedEnrolmentId = '';
let activeEnrolmentId = '';
let catalogueCertIds: string[] = [];
let otherTierCertId = '';
let createdCertIds: string[] = [];

async function makeCompletedEnrolment(email: string, tierId: string, suffixTag: string) {
  const user = await prisma.user.create({
    data: { email, name: `Cert Member ${suffixTag}`, passwordHash: 'x' },
  });
  const programme = await prisma.programme.create({
    data: { name: `Cert Programme ${suffixTag}`, attendanceThreshold: 60 },
  });
  const enrolment = await prisma.enrolment.create({
    data: {
      userId: user.id,
      tierId,
      status: 'active',
      attendancePercentage: 100,
      programmes: {
        create: { programmeId: programme.id, attendanceThreshold: 60, attendancePercentage: 100 },
      },
    },
  });
  await prisma.payment.create({
    data: {
      userId: user.id,
      enrolmentId: enrolment.id,
      amountKobo: 30_000_000,
      currency: 'NGN',
      status: 'verified',
      verifiedAt: new Date(),
      verifiedBy: adminId,
    },
  });
  // No pre-seeded checklist rows on purpose. `reviewCompletion` recomputes
  // checklist state from the submitted ids, so a row created outside the review
  // would be flipped back to incomplete by it. Both requirements are recorded
  // through the review itself.
  const review = await reviewCompletion(adminId, {
    enrolmentId: enrolment.id,
    performanceSatisfactory: true,
    feedbackConsidered: true,
    checklistIds: [],
    newRequirements: [
      { name: 'Assignments complete', complete: true },
      { name: 'Tests/projects complete', complete: true },
    ],
  });
  if (!review.ok || !review.completed) {
    throw new Error(`Setup failed to complete enrolment: ${JSON.stringify(review)}`);
  }

  return { userId: user.id, enrolmentId: enrolment.id };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: `cert-admin-${suffix}@example.test`,
      name: 'Cert Admin',
      passwordHash: 'x',
      roleId: 'role-super-admin',
    },
  });
  adminId = admin.id;

  // Two catalogue entries mapped to `tier-basic`, plus one mapped only to a
  // different tier, so the out-of-catalogue path has something real to refuse.
  const tierCertificateRows = await prisma.tierCertificate.findMany({
    where: { tierId: 'tier-basic' },
    select: { certificateId: true },
  });
  catalogueCertIds = tierCertificateRows.map((row) => row.certificateId);
  if (catalogueCertIds.length < 2) {
    throw new Error('Seed expected at least two certificates mapped to tier-basic');
  }

  const otherTier = await prisma.certificateCatalogue.findFirst({
    where: { tiers: { none: { tierId: 'tier-basic' } } },
    select: { id: true },
  });
  if (!otherTier) throw new Error('Seed expected a certificate outside the basic tier mapping');
  otherTierCertId = otherTier.id;

  const first = await makeCompletedEnrolment(
    `cert-member-${suffix}@example.test`,
    'tier-basic',
    suffix,
  );
  memberId = first.userId;
  completedEnrolmentId = first.enrolmentId;

  // A second member left `active`, so "issuance requires completion" has a subject
  // that is otherwise eligible on every other axis.
  const second = await makeCompletedEnrolment(
    `cert-pending-${suffix}@example.test`,
    'tier-basic',
    `${suffix}b`,
  );
  await prisma.enrolment.update({
    where: { id: second.enrolmentId },
    data: { status: 'active', completedAt: null, certificateEligible: false },
  });
  await prisma.memberCertificate.deleteMany({ where: { enrolmentId: second.enrolmentId } });
  activeEnrolmentId = second.enrolmentId;
});

afterAll(async () => {
  await prisma.memberCertificate.deleteMany({ where: { userId: { in: [memberId] } } });
  // Audit rows are deliberately left in place. `audit_log` carries the SEC-015
  // append-only triggers, so a DELETE here is refused by the database — this
  // suite found that the hard way. That refusal is the feature working.
});

describe('verification ids', () => {
  it('produces ids in the documented, verifiable format', () => {
    const id = newVerificationId(new Date('2026-09-28T00:00:00Z'));
    expect(id).toMatch(/^EHEMS-2026-[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(isWellFormedVerificationId(id)).toBe(true);
  });

  it('does not repeat across a large sample', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newVerificationId()));
    expect(ids.size).toBe(500);
  });

  it('rejects ids that are not well formed, whatever their case or padding', () => {
    expect(isWellFormedVerificationId('  ehems-2026-0123456789 ')).toBe(true);
    expect(normaliseVerificationId(' ehems-2026-abc ')).toBe('EHEMS-2026-ABC');
    expect(isWellFormedVerificationId('EHEMS-26-0123456789')).toBe(false);
    // `I`, `L`, `O` and `U` are excluded from the alphabet, so they cannot appear.
    expect(isWellFormedVerificationId('EHEMS-2026-012345678I')).toBe(false);
    expect(isWellFormedVerificationId('nonsense')).toBe(false);
  });
});

describe('completion does not issue certificates', () => {
  it('leaves a member who has just completed holding nothing', async () => {
    const certificates = await listMemberCertificates(memberId);
    expect(certificates).toHaveLength(0);
  });
});

describe('issuance requires completion (BR-010)', () => {
  it('refuses an enrolment that is not completed', async () => {
    const result = await issueCertificates(adminId, {
      enrolmentId: activeEnrolmentId,
      certificateIds: [catalogueCertIds[0]],
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toMatch(/completed/i);

    expect(
      await prisma.memberCertificate.count({ where: { enrolmentId: activeEnrolmentId } }),
    ).toBe(0);
  });
});

describe('issuance', () => {
  it('creates one row per selected certificate and audits the action', async () => {
    const selected = catalogueCertIds.slice(0, 2);
    const result = await issueCertificates(adminId, {
      enrolmentId: completedEnrolmentId,
      certificateIds: selected,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issued).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
    createdCertIds = result.issued.map((certificate) => certificate.certificateId);
    for (const certificate of result.issued) {
      expect(isWellFormedVerificationId(certificate.verificationId)).toBe(true);
    }

    expect(
      await prisma.auditLog.count({
        where: { actorId: adminId, action: 'CERTIFICATE_ISSUED', entityId: completedEnrolmentId },
      }),
    ).toBe(1);
  });

  it('shows the member their certificates, scoped to that member', async () => {
    const mine = await listMemberCertificates(memberId);
    expect(mine).toHaveLength(2);
    const theirs = await listMemberCertificates('user-that-does-not-exist');
    expect(theirs).toHaveLength(0);
  });

  it('never rewrites an issued certificate when the same one is selected again', async () => {
    const before = await prisma.memberCertificate.findMany({
      where: { enrolmentId: completedEnrolmentId },
      select: { verificationId: true, issuedAt: true },
      orderBy: { verificationId: 'asc' },
    });

    const result = await issueCertificates(adminId, {
      enrolmentId: completedEnrolmentId,
      certificateIds: createdCertIds,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issued).toHaveLength(0);
    expect(result.skipped).toHaveLength(createdCertIds.length);

    const after = await prisma.memberCertificate.findMany({
      where: { enrolmentId: completedEnrolmentId },
      select: { verificationId: true, issuedAt: true },
      orderBy: { verificationId: 'asc' },
    });
    expect(after).toEqual(before);
  });

  it('refuses a certificate that is not in the member\u2019s tier catalogue', async () => {
    const result = await issueCertificates(adminId, {
      enrolmentId: completedEnrolmentId,
      certificateIds: [otherTierCertId],
    });
    expect(result).toMatchObject({ ok: false });

    expect(
      await prisma.memberCertificate.count({
        where: { enrolmentId: completedEnrolmentId, certificateId: otherTierCertId },
      }),
    ).toBe(0);
  });

  it('de-duplicates a selection that carries the same name twice', async () => {
    // Two catalogue rows with one name, both mapped to tier-basic, is exactly what
    // "names duplicated across tiers" produces. The unique constraint on
    // `CertificateCatalogue.name` prevents it in the seed, so it is set up here to
    // prove the guard rather than to rely on the constraint being permanent.
    const sharedName = `Duplicate Test Certificate ${suffix}`;
    const duplicateA = await prisma.certificateCatalogue.create({
      data: { name: sharedName, description: 'first', active: true },
    });
    const duplicateB = await prisma.certificateCatalogue.create({
      data: { name: `${sharedName} `, description: 'second', active: true },
    });
    await prisma.tierCertificate.createMany({
      data: [
        { tierId: 'tier-basic', certificateId: duplicateA.id },
        { tierId: 'tier-basic', certificateId: duplicateB.id },
      ],
    });

    try {
      const result = await issueCertificates(adminId, {
        enrolmentId: completedEnrolmentId,
        certificateIds: [duplicateA.id, duplicateB.id],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.issued).toHaveLength(1);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toMatch(/already selected/i);

      // `name` is @unique, so the trailing-space variant had to be trimmed to
      // collide — which is precisely why the guard compares trimmed, folded names.
      const rows = await prisma.memberCertificate.findMany({
        where: {
          enrolmentId: completedEnrolmentId,
          certificateId: { in: [duplicateA.id, duplicateB.id] },
        },
        select: { certificateId: true },
      });
      expect(rows).toHaveLength(1);
    } finally {
      await prisma.memberCertificate.deleteMany({
        where: {
          enrolmentId: completedEnrolmentId,
          certificateId: { in: [duplicateA.id, duplicateB.id] },
        },
      });
      await prisma.tierCertificate.deleteMany({
        where: { certificateId: { in: [duplicateA.id, duplicateB.id] } },
      });
      await prisma.certificateCatalogue.deleteMany({
        where: { id: { in: [duplicateA.id, duplicateB.id] } },
      });
    }
  });
});

describe('public verification', () => {
  it('resolves an issued id and discloses nothing beyond the credential', async () => {
    const mine = await listMemberCertificates(memberId);
    const target = mine[0];
    const result = await verifyCertificate(target.verificationId);

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.certificateName).toBe(target.name);
    expect(result.memberName).toContain('Cert Member');
    expect(result.verificationId).toBe(target.verificationId);

    // The disclosure boundary, asserted as a key set rather than by reading the
    // values: the page is unauthenticated, so what it must not carry is easier to
    // pin as "these seven fields and no others" than as a field-by-field review
    // that someone can quietly widen.
    expect(Object.keys(result).sort()).toEqual([
      'certificateName',
      'found',
      'issuedAt',
      'issuingBody',
      'memberName',
      'tierName',
      'verificationId',
    ]);
  });

  it('is case-insensitive, because ids are typed from a printout', async () => {
    const mine = await listMemberCertificates(memberId);
    const result = await verifyCertificate(mine[0].verificationId.toLowerCase());
    expect(result.found).toBe(true);
  });

  it('gives the same answer for a malformed id as for an unknown one', async () => {
    expect(await verifyCertificate('not-a-real-id')).toEqual({ found: false });
    expect(await verifyCertificate('EHEMS-2026-ZZZZZZZZZZ')).toEqual({ found: false });
  });
});

describe('candidate list', () => {
  it('marks a completed enrolment eligible and an active one blocked', async () => {
    const candidates = await listCertificateCandidates(adminId);
    const completed = candidates.find((c) => c.enrolmentId === completedEnrolmentId);
    const active = candidates.find((c) => c.enrolmentId === activeEnrolmentId);

    expect(completed).toMatchObject({ eligible: true, blockedBecause: null });
    expect(active).toMatchObject({ eligible: false });
    expect(active?.blockedBecause).toMatch(/completion/i);
  });

  it('suppresses already-issued certificates from the issuable list', async () => {
    const candidates = await listCertificateCandidates(adminId);
    const completed = candidates.find((c) => c.enrolmentId === completedEnrolmentId);
    const issuedEntries = completed?.catalogue.filter((entry) => entry.alreadyIssued) ?? [];

    expect(issuedEntries).toHaveLength(2);
    for (const entry of issuedEntries) {
      expect(entry.verificationId).not.toBeNull();
    }
    expect(completed?.pendingCount).toBe(catalogueCertIds.length - 2);
  });
});
