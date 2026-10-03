import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/client';
import {
  getMemberEntitlement,
  listAccessibleCommunityLinks,
  listAccessibleMaterials,
  listUpgradeOptions,
} from '@/lib/member';
import { openForReview, verifyPayment } from '@/lib/payments';

/**
 * Member entitlement (AGENTS.md §4, BR-011).
 *
 * The four claims this suite exists to pin:
 *
 *  1. Entitlement comes from Verified + active, not from "a payment exists".
 *  2. The zero-cost O'Free exception (D-1) is the only way through without a
 *     payment, and it is guarded on the tier being free.
 *  3. BR-011 is not inverted: general community access is everyone's, and EHEMS
 *     OPEN begins at Advanced Level IV. Getting this backwards locks out the tiers
 *     that pay.
 *  4. Materials are gated by the programme's tier mapping (D-6), not by anything
 *     the client sends.
 */

const suffix = randomBytes(4).toString('hex');

let adminId = '';
const userIds: string[] = [];
const communityLinkIds: string[] = [];
const materialIds: string[] = [];
const programmeIds: string[] = [];

async function createUser(tag: string) {
  const user = await prisma.user.create({
    data: { email: `ent-${tag}-${suffix}@example.test`, name: `Ent ${tag}`, passwordHash: 'x' },
  });
  userIds.push(user.id);
  return user;
}

/**
 * A member on `tierId` with a verified payment, via the real transition function
 * rather than a hand-written `status: 'verified'` row — so activation runs the
 * same path production does.
 */
async function createPaidMember(tag: string, tierId: string, tierPriceKobo: number) {
  const user = await createUser(tag);
  const enrolment = await prisma.enrolment.create({
    data: { userId: user.id, tierId, status: 'pending_payment' },
  });
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      enrolmentId: enrolment.id,
      amountKobo: tierPriceKobo,
      currency: 'NGN',
      status: 'submitted',
    },
  });
  const opened = await openForReview(payment.id, adminId);
  if (!opened.ok) throw new Error(`openForReview failed: ${JSON.stringify(opened)}`);
  const outcome = await verifyPayment(payment.id, adminId);
  if (!outcome.ok) throw new Error(`verifyPayment failed: ${JSON.stringify(outcome)}`);
  return { user, enrolmentId: enrolment.id };
}

beforeAll(async () => {
  adminId = (
    await prisma.user.create({
      data: {
        email: `ent-admin-${suffix}@example.test`,
        name: 'Ent Admin',
        passwordHash: 'x',
        roleId: 'role-super-admin',
      },
    })
  ).id;

  // BR-011 fixtures: one general link, one EHEMS OPEN link, and one link pinned
  // to a single tier so the `tierName` filter has something real to exclude.
  const links = await Promise.all([
    prisma.communityLink.create({
      data: {
        name: `General ${suffix}`,
        url: 'https://example.test/general',
        accessLevel: 'general',
      },
    }),
    prisma.communityLink.create({
      data: {
        name: `Open ${suffix}`,
        url: 'https://example.test/open',
        accessLevel: 'ehems_open_sales',
      },
    }),
    prisma.communityLink.create({
      data: {
        name: `Pinned ${suffix}`,
        url: 'https://example.test/pinned',
        accessLevel: 'general',
        tierName: 'Advanced Level V',
      },
    }),
  ]);
  communityLinkIds.push(...links.map((link) => link.id));

  // D-6 fixtures: one programme mapped to Advanced V only, carrying two materials.
  const programme = await prisma.programme.create({
    data: { name: `Ent Programme ${suffix}`, attendanceThreshold: 60 },
  });
  programmeIds.push(programme.id);
  await prisma.programmeTier.create({
    data: { programmeId: programme.id, tierId: 'tier-advanced-v' },
  });
  const materials = await Promise.all([
    prisma.material.create({
      data: {
        programmeId: programme.id,
        title: `Open material ${suffix}`,
        fileUrl: 'https://example.test/a.pdf',
      },
    }),
    prisma.material.create({
      data: {
        programmeId: programme.id,
        title: `Draft material ${suffix}`,
        fileUrl: 'https://example.test/b.pdf',
        active: false,
      },
    }),
  ]);
  materialIds.push(...materials.map((material) => material.id));
});

afterAll(async () => {
  await prisma.communityLink.deleteMany({ where: { id: { in: communityLinkIds } } });
  await prisma.material.deleteMany({ where: { id: { in: materialIds } } });
  await prisma.programmeTier.deleteMany({ where: { programmeId: { in: programmeIds } } });
  await prisma.programme.deleteMany({ where: { id: { in: programmeIds } } });
  await prisma.assignmentChecklist.deleteMany({
    where: { enrolment: { userId: { in: userIds } } },
  });
  await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.enrolment.deleteMany({ where: { userId: { in: userIds } } });
  // Users are anonymised, not deleted. A verified payment is a financial record and
  // the user row is what it hangs off; `payment-workflow.db.test.ts` does the same.
  // Deleting the users outright fails the `payment_user_id_fkey` constraint, which
  // is the database correctly refusing to orphan a financial record.
  // `email` is unique, so each row gets its own tombstone address — derived from the
  // id so it is stable and cannot collide with anything.
  await prisma.$executeRaw`
    UPDATE "user" SET email = 'deleted-' || id || '@anonymised.invalid', name = 'Deleted member'
    WHERE id IN (${Prisma.join(userIds)})
  `;
});

describe('entitlement requires a Verified payment on an active enrolment', () => {
  it('grants nothing to a member whose enrolment is still pending payment', async () => {
    const user = await createUser('pending');
    const enrolment = await prisma.enrolment.create({
      data: { userId: user.id, tierId: 'tier-basic', status: 'pending_payment' },
    });
    // A payment record exists. It is `submitted`, not `verified` — which is
    // precisely the case AGENTS.md §4 forbids computing entitlement from.
    await prisma.payment.create({
      data: {
        userId: user.id,
        enrolmentId: enrolment.id,
        amountKobo: 30_000_000,
        currency: 'NGN',
        status: 'submitted',
      },
    });

    const entitlement = await getMemberEntitlement(user.id);
    expect(entitlement.hasEntitlement).toBe(false);
    expect(entitlement.tier).toBeNull();
    expect(await listAccessibleCommunityLinks(user.id)).toEqual([]);
    expect(await listAccessibleMaterials(user.id)).toEqual([]);
  });

  it('grants nothing to a member with no enrolment at all', async () => {
    const user = await createUser('bare');
    const entitlement = await getMemberEntitlement(user.id);
    expect(entitlement).toMatchObject({ hasEntitlement: false, communityAccess: null });
  });

  it('grants the tier once the payment is verified', async () => {
    const { user } = await createPaidMember('paid', 'tier-basic', 30_000_000);
    const entitlement = await getMemberEntitlement(user.id);
    expect(entitlement.hasEntitlement).toBe(true);
    expect(entitlement.tier).toMatchObject({
      tierName: 'Basic Level',
      enrolmentStatus: 'active',
      paymentVerified: true,
    });
  });
});

describe('D-1 zero-cost O\u2019Free exception', () => {
  it('activates without a payment, because there is nothing to pay', async () => {
    const user = await createUser('free');
    const enrolment = await prisma.enrolment.create({
      data: { userId: user.id, tierId: 'tier-ofree', status: 'active' },
    });
    // No payment row at all — the whole point of the exception.
    expect(await prisma.payment.count({ where: { enrolmentId: enrolment.id } })).toBe(0);

    const entitlement = await getMemberEntitlement(user.id);
    expect(entitlement.hasEntitlement).toBe(true);
    expect(entitlement.communityAccess).toBe('general');
    expect(entitlement.tier?.paymentVerified).toBe(false);
  });

  it('does not extend to a paid tier that skipped activation', async () => {
    const user = await createUser('sneaky');
    // Active, but the tier is not free and there is no verified payment. If the
    // D-1 guard were written on enrolment status instead of `tier.isFree`, this
    // member would wrongly receive a paid tier's benefits.
    await prisma.enrolment.create({
      data: { userId: user.id, tierId: 'tier-advanced-v', status: 'active' },
    });

    const entitlement = await getMemberEntitlement(user.id);
    expect(entitlement.hasEntitlement).toBe(false);
  });
});

describe('BR-011 community access', () => {
  it('gives every tier general access, including O\u2019Free', async () => {
    const free = await createUser('free-links');
    await prisma.enrolment.create({
      data: { userId: free.id, tierId: 'tier-ofree', status: 'active' },
    });

    const links = await listAccessibleCommunityLinks(free.id);
    // Scoped to this file's own links rather than asserting the whole set: the
    // query returns every active link at an earned level, and a sibling test file
    // writing community-link rows concurrently would otherwise make this
    // assertion depend on which file the runner happened to schedule first.
    const own = links.filter((link) => link.name.endsWith(suffix));
    expect(own.map((link) => link.accessLevel)).toEqual(['general']);
    // The general link is there; the EHEMS OPEN link is not.
    expect(links.some((link) => link.name === `General ${suffix}`)).toBe(true);
    expect(links.some((link) => link.name === `Open ${suffix}`)).toBe(false);
  });

  it('withholds EHEMS OPEN from Basic Level', async () => {
    const { user } = await createPaidMember('basic-links', 'tier-basic', 30_000_000);
    const names = (await listAccessibleCommunityLinks(user.id)).map((link) => link.name);

    expect(names).toContain(`General ${suffix}`);
    expect(names).not.toContain(`Open ${suffix}`);
  });

  it('grants EHEMS OPEN at Advanced Level IV, the tier BR-011 names', async () => {
    const { user } = await createPaidMember('adv4-links', 'tier-advanced-iv', 75_000_000);
    const names = (await listAccessibleCommunityLinks(user.id)).map((link) => link.name);

    expect(names).toContain(`General ${suffix}`);
    expect(names).toContain(`Open ${suffix}`);
  });

  it('excludes a link pinned to a tier the member is not on', async () => {
    const { user: onFive } = await createPaidMember('adv5-links', 'tier-advanced-v', 90_000_000);
    const { user: onFour } = await createPaidMember('adv4b-links', 'tier-advanced-iv', 75_000_000);

    expect((await listAccessibleCommunityLinks(onFive.id)).map((link) => link.name)).toContain(
      `Pinned ${suffix}`,
    );
    expect((await listAccessibleCommunityLinks(onFour.id)).map((link) => link.name)).not.toContain(
      `Pinned ${suffix}`,
    );
  });
});

describe('D-6 tier-gated materials', () => {
  it('returns only materials from programmes mapped to the member\u2019s tier', async () => {
    const { user } = await createPaidMember('adv5-mat', 'tier-advanced-v', 90_000_000);
    const materials = await listAccessibleMaterials(user.id);

    // Two materials exist on the programme; one is inactive and never returned.
    expect(materials.map((material) => material.title)).toEqual([`Open material ${suffix}`]);
  });

  it('returns nothing for a tier the programme is not mapped to', async () => {
    const { user } = await createPaidMember('basic-mat', 'tier-basic', 30_000_000);
    expect(await listAccessibleMaterials(user.id)).toEqual([]);
  });
});

describe('member pricing (D-2)', () => {
  it('shows the list price to a member with no purchase history', async () => {
    const user = await createUser('new-pricing');
    const { member, options } = await listUpgradeOptions(user.id);

    expect(member.isFirstTimeSubscriber).toBe(true);
    const advancedFour = options.find((option) => option.tier.id === 'advanced-iv');
    // BR-005: first-time subscriber, first Advanced purchase.
    expect(advancedFour?.discountApplies).toBe(true);
    expect(advancedFour?.priced?.amountKobo).toBe(37_500_000);
  });

  it('does not repeat the discount for a member who already bought Advanced (BR-007)', async () => {
    const { user } = await createPaidMember('adv-bought', 'tier-advanced-v', 45_000_000);
    const { member, options } = await listUpgradeOptions(user.id);

    expect(member.hasPurchasedAdvanced).toBe(true);
    const advancedFour = options.find((option) => option.tier.id === 'advanced-iv');
    expect(advancedFour?.discountApplies).toBe(false);
    expect(advancedFour?.priced?.amountKobo).toBe(75_000_000);
  });

  it('prices an upgrade from list prices, not from what was paid (BR-003)', async () => {
    // This member bought Advanced V at the discounted ₦450,000. Their enrolment is
    // active but NOT completed, so BR-004 forfeits the difference and the next tier
    // is charged in full. Crediting the ₦450,000 they actually paid is the bug
    // BR-003 exists to prevent, and this is the case that catches it.
    const { user } = await createPaidMember('upgrade-src', 'tier-advanced-v', 45_000_000);
    const { options } = await listUpgradeOptions(user.id);

    const higher = options.find((option) => option.tier.id === 'higher-advanced-viii');
    expect(higher?.priced?.isUpgrade).toBe(false);
    expect(higher?.priced?.amountKobo).toBe(125_000_000);
  });

  it('applies the list-price difference once the previous tier is completed (BR-004)', async () => {
    const { user, enrolmentId } = await createPaidMember(
      'upgrade-done',
      'tier-advanced-v',
      45_000_000,
    );
    await prisma.enrolment.update({
      where: { id: enrolmentId },
      data: { status: 'completed', completedAt: new Date(), certificateEligible: true },
    });

    const { options } = await listUpgradeOptions(user.id);
    const higher = options.find((option) => option.tier.id === 'higher-advanced-viii');

    expect(higher?.priced?.isUpgrade).toBe(true);
    // 1,250,000 − 900,000. The ₦450,000 they paid is irrelevant to the maths.
    expect(higher?.priced?.amountKobo).toBe(35_000_000);
    expect(higher?.priced?.upgradeFromEnrolmentId).toBe(enrolmentId);
  });

  it('never lists a retired tier (BR-016)', async () => {
    const user = await createUser('retired-pricing');
    const { options } = await listUpgradeOptions(user.id);
    const ids = options.map((option) => option.tier.id);

    expect(ids).toEqual([
      'o-free',
      'basic',
      'basic-iii',
      'advanced-iv',
      'advanced-v',
      'higher-advanced-viii',
    ]);
    for (const retired of ['tier-ii', 'tier-vi', 'tier-vii']) {
      expect(ids).not.toContain(retired);
    }
  });
});
