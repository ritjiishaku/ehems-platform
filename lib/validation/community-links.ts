import { z } from 'zod';

/**
 * Shape validation for community-link administration.
 *
 * The rules that protect BR-011 and BR-016 — that the access level is one of the
 * two PRD values, and that a tier pin names a live catalogue tier rather than a
 * typo or a retired one — live in `lib/community/`. A tier name arriving here is
 * only a string; whether it resolves is a domain question, and checking it in a
 * schema that ships to the browser would both disclose the rule and still be
 * bypassable.
 */

export const COMMUNITY_ACCESS_LEVELS = ['general', 'ehems_open_sales'] as const;

export type CommunityAccessLevelValue = (typeof COMMUNITY_ACCESS_LEVELS)[number];

export function isCommunityAccessLevel(value: string): value is CommunityAccessLevelValue {
  return (COMMUNITY_ACCESS_LEVELS as readonly string[]).includes(value);
}

export const communityLinkCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /**
   * An opaque URL, deliberately not constrained to a provider. Community links
   * are data, not code (AGENTS.md §7), so an admin must be able to point at a new
   * platform without a deploy. The scheme check is the only thing enforced.
   */
  url: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((value) => /^https?:\/\//i.test(value), {
      message: 'The link must start with http:// or https://',
    }),
  accessLevel: z.enum(COMMUNITY_ACCESS_LEVELS),
  /** Optional pin to one cohort. Empty string means "everyone at this level". */
  tierName: z.string().trim().max(200).optional().default(''),
  active: z.boolean().optional().default(true),
});

export type CommunityLinkCreateInput = z.infer<typeof communityLinkCreateSchema>;

export const communityLinkUpdateSchema = communityLinkCreateSchema.extend({
  linkId: z.string().trim().min(1),
});

export type CommunityLinkUpdateInput = z.infer<typeof communityLinkUpdateSchema>;
