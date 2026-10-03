/**
 * `lib/member/` — the authenticated member's own view of their membership.
 *
 * Import surface:
 *   entitlement.ts  what a member is entitled to, gated on Verified + active
 *
 * Every function here takes a `userId` from the session and scopes its query by
 * it. None of them accept a tier id, an enrolment id, or a link id from the
 * browser: a member page that took an id and looked it up would be one missing
 * `where` clause away from showing someone else's records.
 *
 * The `tier` module is not a member module. `priceTierForMember` is reached
 * through this file for the dashboard's own price display, but nothing else in the
 * member area may import it.
 */

export {
  getMemberEntitlement,
  listAccessibleCommunityLinks,
  listAccessibleMaterials,
  listMemberEnrolments,
  listUpgradeOptions,
  type CommunityLinkView,
  type MaterialView,
  type MemberEntitlement,
  type MemberPriceOption,
  type MemberTierSummary,
} from './entitlement';
