import { describe, expect, it } from 'vitest';
import {
  applyAdvancedDiscount,
  calculateTierPrice,
  calculateUpgradeDifference,
  FIRST_TIME_MEMBER,
  getTier,
  isAdvancedDiscountEligible,
  isUpgradeDifferencePermitted,
  listActiveTiers,
  type PricingMember,
  type TierId,
} from '@/lib/pricing';

/**
 * All money is kobo integers, never naira floats. ₦375,000 is 37_500_000.
 * These four worked examples come from `.agents/rules/architecture.md` and are
 * transcribed from the catalogue so a change to a price fails here rather than
 * silently on a member's invoice.
 */

const O_FREE = getTier('o-free');
const BASIC = getTier('basic');
const BASIC_III = getTier('basic-iii');
const ADVANCED_IV = getTier('advanced-iv');
const ADVANCED_V = getTier('advanced-v');
const HIGHER_ADVANCED_VIII = getTier('higher-advanced-viii');

const member = (overrides: Partial<PricingMember> = {}): PricingMember => ({
  ...FIRST_TIME_MEMBER,
  ...overrides,
});

/** A member mid-upgrade: prior tier paid in full and completed (BR-004). */
const paidAndCompleted = member({ previousTierPaidInFull: true, previousTierCompleted: true });

/** BR-004's other half: paid, but not yet completed by an admin. */
const paidNotCompleted = member({ previousTierPaidInFull: true, previousTierCompleted: false });

describe('tier catalogue', () => {
  it('lists the six active tiers in display order, which is the array order', () => {
    // AGENTS.md §3: exact names, exact order. BR-016: II, VI and VII never render.
    expect(listActiveTiers().map((tier) => tier.name)).toEqual([
      "O'Free Levels",
      'Basic Level',
      'Basic Level III',
      'Advanced Level IV',
      'Advanced Level V',
      'Higher Advanced VIII',
    ]);
  });

  it('orders by display_order rather than by name or by price', () => {
    // Ordering by price would put O'Free, Basic, Basic III, Advanced IV,
    // Advanced V, Higher Advanced VIII — which happens to match. Alphabetical
    // does not, so this pins the rule rather than the coincidence.
    const tiers = listActiveTiers();
    expect(tiers.map((tier) => tier.displayOrder)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tiers).toEqual([...tiers].sort((a, b) => a.displayOrder - b.displayOrder));
  });

  it('contains no retired tier', () => {
    // BR-016. Tiers II, VI and VII are absent from the catalogue rather than
    // filtered from it, so no function here can return one.
    const names = listActiveTiers().map((tier) => tier.name);
    expect(names).not.toContain('Basic Level II');
    expect(names).not.toContain('Basic Level VI');
    expect(names).not.toContain('Basic Level VII');
  });

  it('prices the catalogue exactly as AGENTS.md §3 specifies', () => {
    expect(
      listActiveTiers().map((tier) => [tier.name, tier.priceKobo, tier.discountedPriceKobo]),
    ).toEqual([
      ["O'Free Levels", 0, null],
      ['Basic Level', 30_000_000, null],
      ['Basic Level III', 55_000_000, null],
      ['Advanced Level IV', 75_000_000, 37_500_000],
      ['Advanced Level V', 90_000_000, 45_000_000],
      ['Higher Advanced VIII', 125_000_000, 62_500_000],
    ]);
  });

  it('stores every price as an integer number of kobo', () => {
    // A float would make the arithmetic inexact. The brand cannot enforce this,
    // so it is asserted.
    for (const tier of listActiveTiers()) {
      expect(Number.isInteger(tier.priceKobo)).toBe(true);
      if (tier.discountedPriceKobo !== null) {
        expect(Number.isInteger(tier.discountedPriceKobo)).toBe(true);
      }
    }
  });

  it('grants EHEMS OPEN access from Advanced Level IV upward, and to no lower tier', () => {
    // BR-011. This replaces three string literals in the pricing page.
    const access = listActiveTiers().map((tier) => [tier.name, tier.communityAccess]);
    expect(access).toEqual([
      ["O'Free Levels", 'general'],
      ['Basic Level', 'general'],
      ['Basic Level III', 'general'],
      ['Advanced Level IV', 'ehems_open_sales'],
      ['Advanced Level V', 'ehems_open_sales'],
      ['Higher Advanced VIII', 'ehems_open_sales'],
    ]);
  });

  it("marks only O'Free as free, consistent with a zero price", () => {
    for (const tier of listActiveTiers()) {
      expect(tier.isFree).toBe(tier.priceKobo === 0);
    }
  });

  it('rejects an unknown tier id rather than returning undefined', () => {
    // A typo in a tier id is a programming error, not a runtime condition.
    expect(() => getTier('basic-ii' as TierId)).toThrow(/Unknown tier/);
  });
});

describe('the four worked pricing examples', () => {
  it('charges a first-time subscriber ₦375,000 for Advanced Level IV bought directly', () => {
    // BR-005, BR-006.
    expect(calculateTierPrice(ADVANCED_IV, FIRST_TIME_MEMBER)).toBe(37_500_000);
  });

  it('charges ₦450,000 to upgrade from a completed Basic Level to Advanced Level IV', () => {
    // BR-003: ₦750,000 − ₦300,000. The 50% discount does NOT apply (BR-005).
    expect(calculateUpgradeDifference(BASIC, ADVANCED_IV, paidAndCompleted)).toBe(45_000_000);
  });

  it('charges the full ₦750,000 when the previous tier is paid but not completed', () => {
    // BR-004: paid AND completed, or the difference does not apply.
    expect(calculateUpgradeDifference(BASIC, ADVANCED_IV, paidNotCompleted)).toBe(75_000_000);
  });

  it('charges ₦150,000 for Advanced IV to Advanced V, with no repeated discount', () => {
    // BR-003, BR-007. The member already holds Advanced IV, so the discount
    // cannot apply a second time.
    const holdsAdvanced = member({
      previousTierPaidInFull: true,
      previousTierCompleted: true,
      hasPurchasedAdvanced: true,
    });
    expect(calculateUpgradeDifference(ADVANCED_IV, ADVANCED_V, holdsAdvanced)).toBe(15_000_000);
  });
});

describe('BR-003, the upgrade difference comes from list price', () => {
  it('subtracts two official list prices, never the amounts actually paid', () => {
    // The exact failure this rule guards: computing from amount paid would give
    // ₦750,000 − ₦375,000 = ₦375,000 if the member had bought Basic at a
    // discount, and ₦450,000 is the only correct answer.
    const listDifference = ADVANCED_IV.priceKobo - BASIC.priceKobo;
    expect(listDifference).toBe(45_000_000);
    expect(calculateUpgradeDifference(BASIC, ADVANCED_IV, paidAndCompleted)).toBe(listDifference);
  });

  it('is unaffected by what the member actually paid for the previous tier', () => {
    // A member who paid ₦375,000 for Advanced IV, by discount, still upgrades
    // to Advanced V by the list difference of ₦150,000 — not ₦75,000.
    const paidDiscountedForAdvanced = member({
      previousTierPaidInFull: true,
      previousTierCompleted: true,
      hasPurchasedAdvanced: true,
    });
    const amountActuallyPaid = ADVANCED_IV.discountedPriceKobo;
    expect(amountActuallyPaid).toBe(37_500_000);
    expect(calculateUpgradeDifference(ADVANCED_IV, ADVANCED_V, paidDiscountedForAdvanced)).toBe(
      15_000_000,
    );
  });

  it('returns a whole-kobo integer for every upgrade pair in the catalogue', () => {
    for (const from of listActiveTiers()) {
      for (const to of listActiveTiers()) {
        const amount = calculateUpgradeDifference(from, to, paidAndCompleted);
        expect(Number.isInteger(amount)).toBe(true);
        expect(amount).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('BR-004, an upgrade needs a paid AND completed previous tier', () => {
  it('withholds the difference when payment is unverified', () => {
    expect(
      calculateUpgradeDifference(
        BASIC,
        ADVANCED_IV,
        member({ previousTierPaidInFull: false, previousTierCompleted: true }),
      ),
    ).toBe(75_000_000);
  });

  it('withholds the difference when the tier is not completed', () => {
    expect(
      calculateUpgradeDifference(
        BASIC,
        ADVANCED_IV,
        member({ previousTierPaidInFull: true, previousTierCompleted: false }),
      ),
    ).toBe(75_000_000);
  });

  it('permits the difference only when both conditions hold', () => {
    expect(isUpgradeDifferencePermitted(paidAndCompleted)).toBe(true);
    expect(isUpgradeDifferencePermitted(paidNotCompleted)).toBe(false);
    expect(isUpgradeDifferencePermitted(member())).toBe(false);
  });

  it('never combines the difference with the Advanced discount', () => {
    // BR-005 explicitly: the discount is not combinable with an upgrade
    // difference. A member who is new to Advanced but upgrading is charged the
    // difference, not the discounted price.
    const newToAdvanced = member({
      previousTierPaidInFull: true,
      previousTierCompleted: true,
      isFirstTimeSubscriber: true,
      hasPurchasedAdvanced: false,
    });
    const upgrade = calculateUpgradeDifference(BASIC, ADVANCED_IV, newToAdvanced);
    expect(upgrade).toBe(45_000_000);
    expect(upgrade).not.toBe(ADVANCED_IV.discountedPriceKobo);
  });

  it('charges full price for a sideways or downward move, never a refund', () => {
    expect(calculateUpgradeDifference(ADVANCED_V, ADVANCED_IV, paidAndCompleted)).toBe(75_000_000);
    expect(calculateUpgradeDifference(ADVANCED_V, BASIC, paidAndCompleted)).toBe(30_000_000);
    expect(calculateUpgradeDifference(ADVANCED_V, ADVANCED_V, paidAndCompleted)).toBe(90_000_000);
  });
});

describe('BR-005 and BR-007, the first-purchase Advanced discount', () => {
  it('applies to a first-time subscriber on their first Advanced purchase', () => {
    expect(isAdvancedDiscountEligible(ADVANCED_IV, FIRST_TIME_MEMBER)).toBe(true);
    // The amount passed in is the list price, branded, so the test exercises the
    // same type the engine does rather than an untyped literal.
    expect(applyAdvancedDiscount(ADVANCED_IV.priceKobo, ADVANCED_IV, FIRST_TIME_MEMBER)).toBe(
      37_500_000,
    );
    expect(applyAdvancedDiscount(ADVANCED_V.priceKobo, ADVANCED_V, FIRST_TIME_MEMBER)).toBe(
      45_000_000,
    );
    expect(
      applyAdvancedDiscount(
        HIGHER_ADVANCED_VIII.priceKobo,
        HIGHER_ADVANCED_VIII,
        FIRST_TIME_MEMBER,
      ),
    ).toBe(62_500_000);
  });

  it('uses the exact BR-006 figures rather than halving the list price', () => {
    expect(ADVANCED_IV.discountedPriceKobo).toBe(37_500_000);
    expect(ADVANCED_V.discountedPriceKobo).toBe(45_000_000);
    expect(HIGHER_ADVANCED_VIII.discountedPriceKobo).toBe(62_500_000);
  });

  it('does not repeat for a member who already holds an Advanced tier', () => {
    // BR-007.
    const returning = member({ isFirstTimeSubscriber: false, hasPurchasedAdvanced: true });
    expect(isAdvancedDiscountEligible(ADVANCED_V, returning)).toBe(false);
    expect(calculateTierPrice(ADVANCED_V, returning)).toBe(90_000_000);
  });

  it('does not apply to a member who has bought a lower tier but is new to Advanced', () => {
    // The PRD words BR-005 as "first Advanced-tier subscription only, AND
    // first-time subscribers only". A Basic buyer is not a first-time
    // subscriber, so the discount does not apply.
    const basicBuyer = member({ isFirstTimeSubscriber: false, hasPurchasedAdvanced: false });
    expect(isAdvancedDiscountEligible(ADVANCED_IV, basicBuyer)).toBe(false);
    expect(calculateTierPrice(ADVANCED_IV, basicBuyer)).toBe(75_000_000);
  });

  it('does not apply to a non-Advanced tier, however new the member is', () => {
    expect(isAdvancedDiscountEligible(BASIC, FIRST_TIME_MEMBER)).toBe(false);
    expect(isAdvancedDiscountEligible(BASIC_III, FIRST_TIME_MEMBER)).toBe(false);
    expect(calculateTierPrice(BASIC, FIRST_TIME_MEMBER)).toBe(30_000_000);
    expect(calculateTierPrice(BASIC_III, FIRST_TIME_MEMBER)).toBe(55_000_000);
  });

  it("leaves O'Free at zero rather than discounting it", () => {
    // D-1 is BLOCKING and decides how a zero-cost tier can ever activate. The
    // engine must not pre-empt that, so the price is simply unchanged.
    expect(O_FREE.priceKobo).toBe(0);
    expect(calculateTierPrice(O_FREE, FIRST_TIME_MEMBER)).toBe(0);
  });
});

describe('BR-001, one-time payments only', () => {
  it('returns a single amount with no period or interval to repeat it', () => {
    // There is no recurrence parameter anywhere in the module's types, so a
    // subscription cannot be expressed rather than merely discouraged.
    const first = calculateTierPrice(ADVANCED_IV, FIRST_TIME_MEMBER);
    const second = calculateTierPrice(ADVANCED_IV, FIRST_TIME_MEMBER);
    expect(first).toBe(second);
    expect(typeof first).toBe('number');
  });

  it('produces no negative amount from any catalogue pair', () => {
    for (const from of listActiveTiers()) {
      for (const to of listActiveTiers()) {
        expect(calculateUpgradeDifference(from, to, paidAndCompleted)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
