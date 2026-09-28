/**
 * Tier pricing and the upgrade difference (BR-001, BR-003, BR-004).
 *
 * ## BR-003, the one that costs real money
 *
 * The upgrade difference is `toTier.priceKobo - fromTier.priceKobo` — always two
 * official list prices, never the amounts a member actually paid. A member who
 * bought Basic Level at the discounted rate, or who paid a promotional amount,
 * still upgrades by the list difference. Computing it from amount paid would
 * quietly refund a discount nobody earned, and it is the single easiest rule in
 * this system to get wrong, so `test/pricing.test.ts` asserts the arithmetic
 * explicitly rather than only the result.
 *
 * ## BR-004
 *
 * A difference is only permitted when the previous tier is BOTH fully paid AND
 * fully completed. If either is missing, the member pays the full list price of
 * the new tier. Completion is marked manually by an admin (BR-009), so an
 * incomplete previous tier is the ordinary case early on, not an edge case.
 *
 * ## BR-001
 *
 * Every function here returns a single one-time amount. There is no interval,
 * period, or recurring parameter anywhere in this module's types, so a
 * subscription is not representable rather than merely discouraged.
 */

import { isAdvancedDiscountEligible } from './discount';
import { kobo, type Tier } from './tiers';
import type { Kobo, PricingMember } from './types';

/** Whether the upgrade difference may be deducted, per BR-004. */
export function isUpgradeDifferencePermitted(member: PricingMember): boolean {
  return member.previousTierPaidInFull && member.previousTierCompleted;
}

/**
 * What a member pays to move to `tier`.
 *
 * A first-time buyer of an Advanced tier gets the BR-005 discount. An upgrader
 * does not: the difference already accounts for what they have paid, and BR-005
 * states the discount is not combinable with an upgrade difference.
 */
export function calculateTierPrice(tier: Tier, member: PricingMember): Kobo {
  // BR-004: an upgrade difference is a separate path. Reaching here with a
  // prior tier means this is a fresh purchase, so the discount rules apply on
  // their own terms.
  if (isAdvancedDiscountEligible(tier, member)) {
    return tier.discountedPriceKobo ?? tier.priceKobo;
  }
  return tier.priceKobo;
}

/**
 * What a member pays to move from `fromTier` to `toTier`.
 *
 * Two cases, and only two:
 *
 *   - BR-004 not satisfied, or the tiers are not an upgrade at all → the full
 *     list price of `toTier`. BR-005 does not apply here, because the discount
 *     is not combinable with an upgrade difference.
 *   - BR-004 satisfied → the difference of the two official list prices.
 *
 * A "downgrade" or sideways move is not modelled: there is no negative amount
 * path. Moving to a tier at or below the current one returns the full list
 * price, which is the safe reading of BR-004 and keeps refunds out of Phase 1.
 */
export function calculateUpgradeDifference(
  fromTier: Tier,
  toTier: Tier,
  member: PricingMember,
): Kobo {
  // BR-004: paid AND completed, or the difference does not apply.
  if (!isUpgradeDifferencePermitted(member)) {
    return toTier.priceKobo;
  }

  // BR-003: list price minus list price. Never amount paid minus amount paid.
  const difference = toTier.priceKobo - fromTier.priceKobo;

  // A difference of zero or less is not a discount — returning zero would let a
  // member take the same tier again for nothing, and negative would be a refund
  // path that Phase 1 does not have (BR-001). The subtraction above is ordinary
  // `number` arithmetic and loses the brand, so it is re-branded here.
  return kobo(difference > 0 ? difference : toTier.priceKobo);
}
