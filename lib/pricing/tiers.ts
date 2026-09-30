/**
 * The tier catalogue.
 *
 * This is the single code-level source of truth for the six active tiers. The
 * names, order, and prices are transcribed from `AGENTS.md` §3 and confirmed
 * against PRD §11, and `test/pricing.test.ts` pins every figure so a change here
 * has to be made consciously in two places.
 *
 * ## Why the catalogue lives in code
 *
 * There was no code-level representation of a tier before this file. The names
 * were hand-copied into two separate UI arrays, and the eight prices existed
 * only in markdown. Phase 2B seeds the `tier` table FROM this file rather than
 * re-transcribing it, so there is one place to change.
 *
 * ## BR-016 is a type-level guarantee
 *
 * Tiers II, VI and VII are retired/internal. They are not filtered out of the
 * list — they are absent from the `TierId` union entirely, so no function in
 * this module can accept or return one. A filter can be forgotten; a missing
 * union member cannot be named.
 *
 * ## What is deliberately absent
 *
 * Certificate counts (D-5, BLOCKING — the per-tier figures do not reconcile
 * with the catalogue) and the persistence of any of this (D-3, BLOCKING — how
 * many roles exist). Nothing here is loaded from or written to the database.
 */

import type { Kobo } from './types';

/**
 * Community access level, per BR-011.
 *
 * General access is available to every tier including O'Free. EHEMS OPEN
 * sales/marketing benefits begin at Advanced Level IV. This was three string
 * literals in the pricing page; it is an entitlement, so it belongs here.
 */
export type CommunityAccessLevel = 'general' | 'ehems_open_sales';

/** The closed set of active tier identifiers. Retired tiers are not members. */
export type TierId =
  'o-free' | 'basic' | 'basic-iii' | 'advanced-iv' | 'advanced-v' | 'higher-advanced-viii';

export type Tier = {
  id: TierId;
  /** Exact display name. A contract from AGENTS.md §3 — never rename or reorder. */
  name: string;
  /**
   * Explicit, because display order is by `display_order` and never by
   * alphabetical or by price (BR-016). Relying on array index would make a
   * re-sort silently change the page.
   */
  displayOrder: number;
  /** Official list price. BR-003: upgrades are computed from this, never from amount paid. */
  priceKobo: Kobo;
  /**
   * The 50% first-purchase Advanced price, or null when the tier has no
   * discount. Exact figures per BR-006 — the engine never derives these by
   * halving, so a future price change cannot silently move a discounted price.
   */
  discountedPriceKobo: Kobo | null;
  /** True only for O'Free. BR-001: every paid tier is a one-time payment. */
  isFree: boolean;
  /** Mentorship included, as displayed. Not used in any calculation. */
  mentorship: string;
  communityAccess: CommunityAccessLevel;
  /** The BR-005 class: whether this tier is discounted at all. */
  isAdvanced: boolean;
};

/**
 * Brand an integer kobo amount. The brand is a compile-time nudge only — it
 * cannot prove a value is integral, so the kobo-integer assertions in
 * `test/pricing.test.ts` remain the real enforcement.
 */
export const kobo = (amount: number): Kobo => amount as Kobo;

/**
 * The six active tiers in display order.
 *
 * Prices are kobo. Basic Level ₦300,000 = 30,000,000 kobo. The `kobo()` helper
 * is a local cast helper, not a validation function: the brand cannot prove
 * integrality, so the kobo-integer assertions in the test suite are the real
 * check.
 */
export const TIERS: readonly Tier[] = [
  {
    id: 'o-free',
    name: "O'Free Levels",
    displayOrder: 1,
    priceKobo: kobo(0),
    discountedPriceKobo: null,
    isFree: true,
    mentorship: 'Community access',
    communityAccess: 'general',
    isAdvanced: false,
  },
  {
    id: 'basic',
    name: 'Basic Level',
    displayOrder: 2,
    priceKobo: kobo(30_000_000),
    discountedPriceKobo: null,
    isFree: false,
    mentorship: '1 month mentorship',
    communityAccess: 'general',
    isAdvanced: false,
  },
  {
    id: 'basic-iii',
    name: 'Basic Level III',
    displayOrder: 3,
    priceKobo: kobo(55_000_000),
    discountedPriceKobo: null,
    isFree: false,
    mentorship: '1 month mentorship',
    communityAccess: 'general',
    isAdvanced: false,
  },
  {
    id: 'advanced-iv',
    name: 'Advanced Level IV',
    displayOrder: 4,
    priceKobo: kobo(75_000_000),
    // BR-006: exactly ₦375,000.
    discountedPriceKobo: kobo(37_500_000),
    isFree: false,
    mentorship: '2 months mentorship',
    // BR-011: EHEMS OPEN begins here.
    communityAccess: 'ehems_open_sales',
    isAdvanced: true,
  },
  {
    id: 'advanced-v',
    name: 'Advanced Level V',
    displayOrder: 5,
    priceKobo: kobo(90_000_000),
    // BR-006: exactly ₦450,000.
    discountedPriceKobo: kobo(45_000_000),
    isFree: false,
    mentorship: '3 months mentorship',
    communityAccess: 'ehems_open_sales',
    isAdvanced: true,
  },
  {
    id: 'higher-advanced-viii',
    name: 'Higher Advanced VIII',
    displayOrder: 6,
    priceKobo: kobo(125_000_000),
    // BR-006: exactly ₦625,000.
    discountedPriceKobo: kobo(62_500_000),
    isFree: false,
    mentorship: '6 months mentorship',
    communityAccess: 'ehems_open_sales',
    isAdvanced: true,
  },
];

/** The catalogue in display order. The order is the contract, not the array index. */
export function listActiveTiers(): readonly Tier[] {
  return [...TIERS].sort((a, b) => a.displayOrder - b.displayOrder);
}

/** A tier by id. Throws on an unknown id rather than returning undefined, because every caller has one. */
export function getTier(id: TierId): Tier {
  const tier = TIERS.find((candidate) => candidate.id === id);
  if (!tier) {
    throw new Error(`Unknown tier: ${id}`);
  }
  return tier;
}

/** A tier by its exact display name. Used by tests and by the seed, which stores names. */
export function getTierByName(name: string): Tier | undefined {
  return TIERS.find((tier) => tier.name === name);
}

/**
 * Narrow an untrusted string to a `TierId`.
 *
 * The union is the BR-016 guarantee, so the only way to honour it at a boundary
 * is to test membership rather than cast. Without this, a `tierId` arriving from a
 * form would need `as TierId`, and a cast is exactly the hole a retired tier
 * walks through.
 */
export function isTierId(value: string): value is TierId {
  return TIERS.some((tier) => tier.id === value);
}
