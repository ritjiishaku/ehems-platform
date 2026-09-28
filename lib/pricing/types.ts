/**
 * Money and the member facts the pricing rules need.
 *
 * `Kobo` is a compile-time brand over `number`, as specified in
 * `.agents/rules/code-style.md`. It is a nudge, not a guarantee: it cannot prove
 * a value is integral, so the real enforcement is integer arithmetic throughout
 * and the kobo-integer assertions in `test/pricing.test.ts`. No float money
 * literal belongs in this module.
 *
 * Int32 tops out at 2,147,483,647, so the ceiling on a `Kobo` column is
 * ₦21,474,836.47. The top tier is ₦1,250,000 = 125,000,000 kobo, which leaves
 * ample headroom (SEC-020, `.agents/rules/architecture.md`).
 */

/** An integer amount in kobo. ₦1 = 100. Never a float, never a naira value. */
export type Kobo = number & { readonly __brand: 'Kobo' };

/** The only currency in Phase 1. Every monetary field defaults to it. */
export const CURRENCY = 'NGN';

/**
 * The member facts the pricing rules read.
 *
 * This is a plain value object, never a Prisma record, so `lib/pricing/` stays
 * importable without a database. The caller loads it — usually `lib/payments/`
 * inside the same transaction. Putting a Prisma query here to obtain these would
 * break purity; omitting them silently loses BR-004, the most expensive bug in
 * this system.
 *
 * The two `previousTier*` fields are deliberately not a single
 * `previousTierIsComplete` boolean: BR-004 requires paid AND completed, and
 * collapsing them invites a caller to pass one for the other.
 */
export type PricingMember = {
  id: string;
  /** No prior Verified payment on any tier. BR-005, first-time subscribers only. */
  isFirstTimeSubscriber: boolean;
  /** The latest payment on the prior tier is Verified. BR-004, first half. */
  previousTierPaidInFull: boolean;
  /** The prior enrolment is Completed, marked manually by an admin. BR-004, second half. */
  previousTierCompleted: boolean;
  /** Has bought any Advanced tier before. BR-007, the discount never repeats. */
  hasPurchasedAdvanced: boolean;
};

/** A member who has bought nothing and is new. The default for a direct purchase. */
export const FIRST_TIME_MEMBER: PricingMember = {
  id: 'anonymous',
  isFirstTimeSubscriber: true,
  previousTierPaidInFull: false,
  previousTierCompleted: false,
  hasPurchasedAdvanced: false,
};
