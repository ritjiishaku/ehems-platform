/**
 * The join between the code tier catalogue and the `tier` table, and the
 * per-member price.
 *
 * `lib/pricing/tiers.ts` is the source of truth for names, order, and prices
 * (D-2: the code catalogue is authoritative and the table is a projection of
 * it). The database rows are what `Enrolment.tierId` points at. The link between
 * the two is the **exact display name**, which is contractual and identical in
 * both — BR-016 means a retired tier cannot appear under a matching name, so the
 * join cannot accidentally resolve to Tier II, VI, or VII.
 *
 * Everything that turns "a member clicked this card" into "an enrolment and a
 * payment for this amount" lives here rather than in a server action, for the
 * reason that matters most in this codebase: the amount must never come from the
 * browser, and the four facts behind BR-004 and BR-005 are four queries that are
 * easy to get subtly wrong in a route handler.
 */

import { prisma } from '@/lib/db/client';
import { getTierByName, listActiveTiers, type Tier, type TierId } from '@/lib/pricing/tiers';
import { calculateTierPrice, calculateUpgradeDifference } from '@/lib/pricing/upgrade';
import type { Kobo, PricingMember } from '@/lib/pricing/types';

/**
 * The four facts `lib/pricing/` needs for one member (AGENTS.md §6).
 *
 * Each is a query rather than an inference, because each one gates money:
 *
 *   isFirstTimeSubscriber — no payment has ever been verified (BR-005)
 *   previousTierPaidInFull — the most recent verified tier is paid in full
 *   previousTierCompleted — and its enrolment was completed by an admin (BR-004)
 *   hasPurchasedAdvanced — they have already held an Advanced tier (BR-007)
 */
export async function loadPricingMember(userId: string): Promise<PricingMember> {
  const [verifiedPayments, advancedTiers, completedEnrolments] = await Promise.all([
    prisma.payment.findMany({
      where: { userId, status: 'verified' },
      orderBy: { verifiedAt: 'desc' },
      include: { enrolment: { include: { tier: { select: { id: true, name: true } } } } },
    }),
    prisma.tier.findMany({ where: { name: { contains: 'Advanced' } }, select: { id: true } }),
    prisma.enrolment.findMany({
      where: { userId, status: 'completed' },
      select: { tierId: true },
    }),
  ]);

  const advancedIds = new Set(advancedTiers.map((tier) => tier.id));
  const latest = verifiedPayments.find((payment) => payment.enrolmentId !== null) ?? null;

  return {
    id: userId,
    // "Subscriber" is the PRD's word, and the strict reading is right: a ₦0
    // O'Free enrolment does not make somebody a paying subscriber, so this counts
    // verified *payments*.
    isFirstTimeSubscriber: verifiedPayments.length === 0,
    // A verified payment for the most recent tier is, by construction, paid in
    // full: there is no instalment path in Phase 1 (BR-001).
    previousTierPaidInFull: latest !== null,
    previousTierCompleted:
      latest !== null &&
      latest.enrolment !== null &&
      completedEnrolments.some((e) => e.tierId === latest.enrolment?.tier.id),
    hasPurchasedAdvanced: verifiedPayments.some(
      (payment) => payment.enrolment !== null && advancedIds.has(payment.enrolment.tier.id),
    ),
  };
}

/** The database row backing a code catalogue tier, or null if the seed is behind. */
export async function findDatabaseTier(tier: Tier) {
  return prisma.tier.findFirst({ where: { name: tier.name, active: true } });
}

export type PricedTier = {
  tier: Tier;
  /** The `tier` table row id, which is what `Enrolment.tierId` points at. */
  tierId: string;
  amountKobo: Kobo;
  /** True when the amount is an upgrade difference rather than a full price. */
  isUpgrade: boolean;
  isFree: boolean;
  /** The completed enrolment this purchase upgrades from, if any. */
  upgradeFromEnrolmentId: string | null;
};

/**
 * What this member pays for this tier, right now, or null if it cannot be sold.
 *
 * Two paths, and which one applies is decided here rather than at the call site:
 *
 * 1. **Upgrade.** The member already holds a completed, fully paid tier and this
 *    one is above it. They pay the list-price difference (BR-003) — never the
 *    discount, because BR-005 is not combinable with an upgrade difference.
 * 2. **Fresh purchase.** List price, with the 50% Advanced first-purchase
 *    discount applied when BR-005's three conditions all hold.
 */
export async function priceTierForMember(
  userId: string,
  tierId: TierId,
): Promise<PricedTier | null> {
  const tier = listActiveTiers().find((candidate) => candidate.id === tierId);
  if (!tier) {
    return null;
  }

  const databaseTier = await findDatabaseTier(tier);
  if (!databaseTier) {
    // A catalogue tier with no seeded row is a deployment problem, not a member
    // error, and it is reported rather than silently priced.
    return null;
  }

  const member = await loadPricingMember(userId);

  const currentEnrolment = await prisma.enrolment.findFirst({
    where: { userId, status: { in: ['active', 'completed'] } },
    orderBy: { enrolledAt: 'desc' },
    include: { tier: { select: { name: true } } },
  });
  const currentTier = currentEnrolment ? getTierByName(currentEnrolment.tier.name) : undefined;

  // BR-004: the difference is only for somebody who has actually finished the
  // tier they are coming from. `calculateUpgradeDifference` re-checks both halves,
  // so a member who upgraded but has not completed pays full price.
  const isUpgrade =
    currentTier !== undefined &&
    tier.displayOrder > currentTier.displayOrder &&
    member.previousTierPaidInFull &&
    member.previousTierCompleted;

  const amountKobo = isUpgrade
    ? calculateUpgradeDifference(currentTier, tier, member)
    : calculateTierPrice(tier, member);

  return {
    tier,
    tierId: databaseTier.id,
    amountKobo,
    isUpgrade,
    isFree: tier.isFree,
    upgradeFromEnrolmentId: isUpgrade ? (currentEnrolment?.id ?? null) : null,
  };
}
