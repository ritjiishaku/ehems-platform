import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/client';
import { registerUser } from '@/lib/auth';
import { MemberSafeError } from '@/lib/auth/member-safe-error';

/**
 * Registration is the first D-1 entitlement boundary. This belongs in a DB test
 * because the important guarantee is transactional: a registered member has an
 * active O'Free enrolment before the registration call returns, and a missing
 * O'Free seed row rolls the user and consent back together.
 */
const suffix = randomBytes(4).toString('hex');
const email = `registration-${suffix}@example.test`;
let userId = '';

beforeAll(async () => {
  const user = await registerUser({
    name: 'Registration Test Member',
    email,
    password: 'correct-horse-battery',
    phone: '+2348031234567',
    profession: 'Nurse',
    ipAddress: '127.0.0.1',
    userAgent: 'registration-db-test',
  });
  userId = user.id;
});

afterAll(async () => {
  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        email: `erased-registration-${userId.slice(-6)}-${suffix}@anonymised.invalid`,
        name: 'Erased user',
        deletedAt: new Date(),
      },
    });
  }
  await prisma.$disconnect();
});

describe("registration creates the D-1 O'Free entitlement", () => {
  it('returns the member role', async () => {
    expect(userId).not.toBe('');
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roleRef: true },
    });
    expect(user.roleRef?.name).toBe('member');
  });

  it("creates one active O'Free enrolment with no payment", async () => {
    const enrolments = await prisma.enrolment.findMany({
      where: { userId },
      include: { tier: true },
    });
    expect(enrolments).toHaveLength(1);
    expect(enrolments[0]?.tier.name).toBe("O'Free Levels");
    expect(enrolments[0]?.tier.isFree).toBe(true);
    expect(enrolments[0]?.status).toBe('active');
    expect(await prisma.payment.count({ where: { userId } })).toBe(0);
  });

  it('audits both registration and the free activation', async () => {
    const audit = await prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => entry.action)).toEqual(['USER_REGISTERED', 'ENROLMENT_ACTIVATED']);
    expect(
      await prisma.consentRecord.count({ where: { userId, consentType: 'data_processing' } }),
    ).toBe(1);
  });
});

describe('registration errors that a member is allowed to read', () => {
  it('labels a duplicate-email rejection so the action shows it', async () => {
    // Unlabelled, this message would be replaced by the generic fallback and the
    // member would not learn why their signup bounced. The label is what makes
    // the disclosure deliberate rather than accidental.
    await expect(
      registerUser({
        name: 'Duplicate Email Attempt',
        email,
        password: 'correct-horse-battery',
        phone: '+2348031234567',
        profession: 'Pharmacist',
      }),
    ).rejects.toBeInstanceOf(MemberSafeError);
  });

  it('creates no orphan user or consent record when registration is refused', async () => {
    const before = await prisma.user.count({ where: { email } });
    await expect(
      registerUser({
        name: 'Duplicate Email Attempt',
        email,
        password: 'correct-horse-battery',
        phone: '+2348031234567',
        profession: 'Pharmacist',
      }),
    ).rejects.toBeInstanceOf(MemberSafeError);
    expect(await prisma.user.count({ where: { email } })).toBe(before);
    expect(await prisma.consentRecord.count({ where: { user: { email } } })).toBe(1);
  });
});
