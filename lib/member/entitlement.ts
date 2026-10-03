/**
 * What a member is entitled to, right now (AGENTS.md §4, BR-011).
 *
 * The rule this file exists to enforce is the one AGENTS.md §4 states twice:
 * entitlement is computed from **a Verified payment linked to an active
 * enrolment**, never from "a payment record exists". Every read below therefore
 * resolves the enrolment and checks the payment status in the same breath, and
 * there is no code path in this module that returns an entitlement from a payment
 * alone.
 *
 * ## The one exception
 *
 * A zero-cost O'Free enrolment may be active without a payment (D-1). That is the
 * only way a member here reaches an entitlement with no verified payment, and it
 * is guarded on `tier.isFree` rather than on the enrolment status — so a mispriced
 * paid tier that somehow skipped activation still gets nothing.
 *
 * ## BR-011, the rule that is easy to invert
 *
 * General community access belongs to **every** tier including O'Free. EHEMS OPEN
 * sales/marketing benefits begin at **Advanced Level IV**. Getting this backwards
 * locks out the tiers that pay, which is why the gate is written as a positive
 * list of qualifying tiers rather than as "not O'Free, not Basic".
 */

import { prisma } from '@/lib/db/client';
import { loadPricingMember, priceTierForMember, type PricedTier } from '@/lib/payments/catalogue';
import { isAdvancedDiscountEligible } from '@/lib/pricing/discount';
import {
  getTierByName,
  listActiveTiers,
  type CommunityAccessLevel,
  type Tier,
} from '@/lib/pricing/tiers';
import type { PricingMember } from '@/lib/pricing/types';

export type MemberTierSummary = {
  enrolmentId: string;
  tierId: string;
  tierName: string;
  /** From the code catalogue. Null when a database tier is not in it — never a fallback. */
  displayOrder: number | null;
  isFree: boolean;
  enrolmentStatus: string;
  paymentVerified: boolean;
  attendancePercentage: number;
  certificateEligible: boolean;
  completedAt: Date | null;
};

export type MemberEntitlement = {
  /** The tier whose benefits the member currently holds, or null if they hold none. */
  tier: MemberTierSummary | null;
  /**
   * The access level the member earns. Null when they hold no entitlement at all —
   * distinct from `'general'`, which is what O'Free earns.
   */
  communityAccess: CommunityAccessLevel | null;
  hasEntitlement: boolean;
};

/**
 * A member's current tier and what it carries.
 *
 * "Current" is the most recent enrolment that actually grants access — `active` or
 * `completed` **with** a verified payment, or a free tier that is active at all
 * (D-1). A `pending_payment` enrolment is excluded: it is the shape every member
 * has before they pay, so including it would hand every signed-up visitor the
 * benefits of the tier they are thinking about buying.
 */
export async function getMemberEntitlement(userId: string): Promise<MemberEntitlement> {
  const enrolments = await prisma.enrolment.findMany({
    where: { userId },
    orderBy: { enrolledAt: 'desc' },
    select: {
      id: true,
      status: true,
      attendancePercentage: true,
      certificateEligible: true,
      completedAt: true,
      tier: { select: { id: true, name: true, isFree: true } },
      payments: { where: { status: 'verified' }, select: { id: true }, take: 1 },
    },
  });

  const grants = enrolments.find((enrolment) => {
    if (!['active', 'completed'].includes(enrolment.status)) return false;
    // D-1: a zero-cost tier needs no payment. Everything else does.
    if (enrolment.tier.isFree) return true;
    return enrolment.payments.length > 0;
  });

  if (!grants) {
    return { tier: null, communityAccess: null, hasEntitlement: false };
  }

  const catalogueTier = getTierByName(grants.tier.name);

  return {
    tier: {
      enrolmentId: grants.id,
      tierId: grants.tier.id,
      tierName: grants.tier.name,
      displayOrder: catalogueTier?.displayOrder ?? null,
      isFree: grants.tier.isFree,
      enrolmentStatus: grants.status,
      paymentVerified: grants.payments.length > 0,
      attendancePercentage: grants.attendancePercentage,
      certificateEligible: grants.certificateEligible,
      completedAt: grants.completedAt,
    },
    // A database tier that is not in the code catalogue earns nothing. Falling back
    // to `'general'` here would silently grant community access on the strength of
    // a row nobody has reviewed.
    communityAccess: catalogueTier?.communityAccess ?? null,
    hasEntitlement: true,
  };
}

export type CommunityLinkView = {
  id: string;
  name: string;
  url: string;
  accessLevel: CommunityAccessLevel;
};

/**
 * The community links a member may follow (BR-011).
 *
 * Filtering happens in the query against the access level the member has actually
 * earned, so a link the member cannot use is never loaded and cannot leak through
 * the server component's serialised props. Links are **data** (AGENTS.md §7): no
 * WhatsApp or Telegram URL is hardcoded anywhere in this file or its callers.
 */
export async function listAccessibleCommunityLinks(userId: string): Promise<CommunityLinkView[]> {
  const { tier, communityAccess, hasEntitlement } = await getMemberEntitlement(userId);

  // No entitlement at all: nothing, not even the general links. O'Free members do
  // have an entitlement (D-1), so they reach the general branch below.
  if (!hasEntitlement || communityAccess === null || tier === null) return [];

  // BR-011 is applied in the query, so a link at a level this member has not
  // earned is never loaded. (Most tiers have `communityAccess === 'general'`, so
  // this collapses to a single level for them.)
  const earnedLevels: CommunityAccessLevel[] = ['general', communityAccess];

  const links = await prisma.communityLink.findMany({
    where: { active: true, accessLevel: { in: earnedLevels } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, url: true, accessLevel: true, tierName: true },
  });

  return (
    links
      // Only the tier pin needs a second pass: "this tier only" versus "everyone at
      // this level" cannot be expressed as a single `where` alongside the level
      // filter without two round trips.
      .filter((link) => link.tierName === null || link.tierName === tier.tierName)
      .map((link) => ({
        id: link.id,
        name: link.name,
        url: link.url,
        // Narrowed to the union, since the query only lets through the two known
        // values. Anything else in the column is excluded above.
        accessLevel: link.accessLevel === 'ehems_open_sales' ? 'ehems_open_sales' : 'general',
      }))
  );
}

export type MaterialView = {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  programmeName: string;
};

/**
 * The materials a member may download (D-6, FR-032).
 *
 * D-6 settled the access model: a material belongs to a programme and is gated by
 * that programme's tier mapping, not by a material-to-tier join. So the question is
 * "which programmes does my tier serve", answered through `ProgrammeTier` — and a
 * member with no entitlement gets nothing at all, rather than an empty programme
 * list they could mistake for "no materials published yet".
 */
export async function listAccessibleMaterials(userId: string): Promise<MaterialView[]> {
  const { tier, hasEntitlement } = await getMemberEntitlement(userId);
  if (!hasEntitlement || tier === null) return [];

  const materials = await prisma.material.findMany({
    where: {
      active: true,
      programme: {
        active: true,
        tiers: { some: { tierId: tier.tierId } },
      },
    },
    orderBy: [{ programme: { name: 'asc' } }, { title: 'asc' }],
    select: {
      id: true,
      title: true,
      description: true,
      fileUrl: true,
      programme: { select: { name: true } },
    },
  });

  return materials.map((material) => ({
    id: material.id,
    title: material.title,
    description: material.description,
    fileUrl: material.fileUrl,
    programmeName: material.programme.name,
  }));
}

/**
 * A member's own enrolments, for the dashboard timeline.
 *
 * Distinct from `getMemberEntitlement`: this shows the whole history including
 * pending and cancelled rows, because a member asking "what happened to my
 * payment" needs the pending one too.
 */
export async function listMemberEnrolments(userId: string): Promise<MemberTierSummary[]> {
  const enrolments = await prisma.enrolment.findMany({
    where: { userId },
    orderBy: { enrolledAt: 'desc' },
    select: {
      id: true,
      status: true,
      attendancePercentage: true,
      certificateEligible: true,
      completedAt: true,
      tier: { select: { id: true, name: true, isFree: true } },
      payments: { where: { status: 'verified' }, select: { id: true }, take: 1 },
    },
  });

  return enrolments.map((enrolment) => {
    const catalogueTier = getTierByName(enrolment.tier.name);
    return {
      enrolmentId: enrolment.id,
      tierId: enrolment.tier.id,
      tierName: enrolment.tier.name,
      displayOrder: catalogueTier?.displayOrder ?? null,
      isFree: enrolment.tier.isFree,
      enrolmentStatus: enrolment.status,
      paymentVerified: enrolment.payments.length > 0,
      attendancePercentage: enrolment.attendancePercentage,
      certificateEligible: enrolment.certificateEligible,
      completedAt: enrolment.completedAt,
    };
  });
}

/**
 * Which tiers a member may upgrade to, priced (D-2).
 *
 * The member-facing price is here rather than on the public pricing page because
 * D-2 splits the two surfaces: public pages show list prices only, and the
 * discounted figure appears on the member's own dashboard. `priceTierForMember`
 * applies BR-003/BR-004/BR-005 per tier, so this stays a loop.
 */
export type MemberPriceOption = {
  tier: Tier;
  /** The `tier` table row id, or null when the catalogue tier has no seeded row. */
  tierId: string | null;
  /** What this member pays, or null when the tier cannot be sold to them. */
  priced: PricedTier | null;
  /** True when BR-005's discount applies to this member on this tier. */
  discountApplies: boolean;
};

export async function listUpgradeOptions(userId: string): Promise<{
  member: PricingMember;
  options: MemberPriceOption[];
}> {
  const member = await loadPricingMember(userId);

  const options = await Promise.all(
    listActiveTiers().map(async (tier): Promise<MemberPriceOption> => {
      const priced = await priceTierForMember(userId, tier.id);
      return {
        tier,
        tierId: priced?.tierId ?? null,
        priced,
        discountApplies: isAdvancedDiscountEligible(tier, member),
      };
    }),
  );

  return {
    member,
    options: options.sort((a, b) => a.tier.displayOrder - b.tier.displayOrder),
  };
}
