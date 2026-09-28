/**
 * The 50% Advanced first-purchase discount (BR-005, BR-007).
 *
 * The rule has three independent conditions, and all three must hold:
 *
 *   1. the tier is an Advanced tier,
 *   2. the member is a first-time subscriber, and
 *   3. the member has not already purchased an Advanced tier.
 *
 * Condition 3 is BR-007: the discount never repeats. Conditions 2 and 3 are
 * separate because the PRD words them separately — a member who bought Basic
 * Level and is now new to Advanced satisfies 2 and 3, while a member who
 * already holds Advanced V satisfies neither.
 *
 * The amount is never computed by halving. BR-006 fixes the discounted figures
 * exactly, so they are read from the catalogue; deriving them would let a list
 * price change silently move a confirmed price.
 */

import type { Tier } from './tiers';
import type { Kobo, PricingMember } from './types';

/**
 * Whether a member qualifies for the discount on a given tier.
 *
 * Exported because the eligibility question is worth asserting directly in
 * tests, and because a caller may want to explain the answer to a member rather
 * than only apply it.
 */
export function isAdvancedDiscountEligible(tier: Tier, member: PricingMember): boolean {
  // BR-005: a first Advanced-tier purchase, by a first-time subscriber only.
  // BR-007: and never twice.
  return tier.isAdvanced && member.isFirstTimeSubscriber && !member.hasPurchasedAdvanced;
}

/**
 * Apply the Advanced discount where it applies, otherwise return the amount
 * unchanged.
 *
 * Takes an amount rather than a tier so it composes with the upgrade maths. Note
 * that BR-005 makes the discount *not combinable* with an upgrade difference —
 * `calculateUpgradeDifference` handles that, not this function. Calling this on
 * an upgrade difference is a caller error and is pinned by a test.
 */
export function applyAdvancedDiscount(amount: Kobo, tier: Tier, member: PricingMember): Kobo {
  if (tier.discountedPriceKobo === null) {
    return amount;
  }
  if (!isAdvancedDiscountEligible(tier, member)) {
    return amount;
  }
  return tier.discountedPriceKobo;
}
