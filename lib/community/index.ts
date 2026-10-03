/**
 * Community-link administration.
 *
 * Community links are **data, not code** (AGENTS.md §7): no WhatsApp or Telegram
 * URL is hardcoded anywhere in this codebase, and an admin can repoint a link
 * without a deploy. The schema therefore stores an opaque `url` and this module
 * does not try to interpret it beyond requiring a scheme.
 *
 * Two rules are enforced here rather than in the Zod schema, because both are
 * business rules and a schema that ships to the browser can be bypassed
 * (AGENTS.md §7):
 *
 * 1. **`access_level` is one of the two PRD values.** BR-011 splits community
 *    access into `general` (every tier including O'Free) and `ehems_open_sales`
 *    (Advanced Level IV and above). Any other value would render as unreachable
 *    for everybody, because `listAccessibleCommunityLinks` drops rows that are
 *    neither level.
 * 2. **A tier pin must name a live catalogue tier.** `CommunityLink.tier_name` is
 *    a display-name string rather than a foreign key, so a typo would silently
 *    produce a link nobody can ever see. It is resolved against
 *    `lib/pricing/tiers` here, which also makes BR-016 structural: a retired tier
 *    has no entry in the catalogue, so it cannot be pinned.
 *
 * Links are withdrawn with `active = false`, never deleted: a member may have the
 * URL bookmarked or in their own notes, and an audit trail of who removed access
 * to what is worth more than a tidy table.
 *
 * ## Known gap
 *
 * AGENTS.md §5 describes links as "keyed by tier and/or programme", and the PRD
 * §16.5 model carries a programme key. The live table has no such column and the
 * member read path in `lib/member/entitlement.ts` does not consume one, so this
 * module does not invent one. Adding it means deciding what a programme-pinned
 * link means for a member on two programmes, which is a client decision rather
 * than an implementation detail. Recorded as an open item, not silently omitted.
 */

import { prisma } from '@/lib/db/client';
import { getTierByName, listActiveTiers } from '@/lib/pricing/tiers';
import type { CommunityAccessLevelValue } from '@/lib/validation/community-links';
import type {
  CommunityLinkCreateInput,
  CommunityLinkUpdateInput,
} from '@/lib/validation/community-links';

export type LinkOutcome = { ok: true; id: string } | { ok: false; message: string };

export type CommunityLinkRow = {
  id: string;
  name: string;
  url: string;
  accessLevel: CommunityAccessLevelValue;
  tierName: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Only `http`/`https` may be stored.
 *
 * This looks like it duplicates the schema's `.refine()`, and the duplication is
 * the point: the schema copy reaches the browser and can be bypassed, and a
 * stored `javascript:` URL rendered as an `<a href>` on the member community page
 * is a stored-XSS vector. `lib/community/` is the enforcement point; the schema
 * copy only gives the form a message.
 */
function validateUrl(url: string): string | null {
  if (/^https?:\/\//i.test(url)) return null;
  return 'The link must start with http:// or https://.';
}

/**
 * Resolve a submitted tier pin to a canonical catalogue name.
 *
 * Returns `null` for an empty pin (meaning "everyone at this access level") and
 * an error string for a name that does not resolve. An exact-name match is
 * required rather than a case-insensitive one: the read path compares
 * `link.tierName` to `tier.tierName` with `!==`, so a link stored as "basic
 * level" would never match "Basic Level" and would be invisible.
 */
function resolveTierPin(tierName: string): { name: string | null } | { error: string } {
  if (tierName.length === 0) return { name: null };
  const tier = getTierByName(tierName);
  if (!tier) {
    return {
      error:
        `"${tierName}" is not one of the six active tiers. ` +
        'A link pinned to an unknown tier would be visible to nobody.',
    };
  }
  return { name: tier.name };
}

export async function listAllCommunityLinks(): Promise<CommunityLinkRow[]> {
  const links = await prisma.communityLink.findMany({
    orderBy: [{ accessLevel: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      url: true,
      accessLevel: true,
      tierName: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Narrow to the two PRD values for display. `listAccessibleCommunityLinks`
  // already treats an unknown level as unreachable, so surfacing the raw string
  // here would only ever confuse an admin looking at a broken row.
  return links.map((link) => ({
    ...link,
    accessLevel: link.accessLevel === 'ehems_open_sales' ? 'ehems_open_sales' : 'general',
  }));
}

export async function createCommunityLink(
  actorId: string,
  input: CommunityLinkCreateInput,
): Promise<LinkOutcome> {
  const urlError = validateUrl(input.url);
  if (urlError) return { ok: false, message: urlError };

  const pin = resolveTierPin(input.tierName);
  if ('error' in pin) return { ok: false, message: pin.error };

  const link = await prisma.communityLink.create({
    data: {
      name: input.name,
      url: input.url,
      accessLevel: input.accessLevel,
      tierName: pin.name,
      active: input.active,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'COMMUNITY_LINK_CREATED',
      entityType: 'CommunityLink',
      entityId: link.id,
      metadata: {
        name: link.name,
        accessLevel: link.accessLevel,
        tierName: link.tierName,
        active: link.active,
      },
    },
  });

  return { ok: true, id: link.id };
}

export async function updateCommunityLink(
  actorId: string,
  input: CommunityLinkUpdateInput,
): Promise<LinkOutcome> {
  const urlError = validateUrl(input.url);
  if (urlError) return { ok: false, message: urlError };

  const pin = resolveTierPin(input.tierName);
  if ('error' in pin) return { ok: false, message: pin.error };

  const existing = await prisma.communityLink.findUnique({
    where: { id: input.linkId },
    select: {
      id: true,
      name: true,
      url: true,
      accessLevel: true,
      tierName: true,
      active: true,
    },
  });
  if (!existing) return { ok: false, message: 'That link does not exist.' };

  await prisma.communityLink.update({
    where: { id: input.linkId },
    data: {
      name: input.name,
      url: input.url,
      accessLevel: input.accessLevel,
      tierName: pin.name,
      active: input.active,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action:
        input.active && !existing.active ? 'COMMUNITY_LINK_ACTIVATED' : 'COMMUNITY_LINK_UPDATED',
      entityType: 'CommunityLink',
      entityId: input.linkId,
      metadata: {
        name: input.name,
        from: { name: existing.name, active: existing.active, tierName: existing.tierName },
        to: { name: input.name, active: input.active, tierName: pin.name },
        // Recorded so an operator can reconstruct who had access to what.
        urlChanged: existing.url !== input.url,
      },
    },
  });

  return { ok: true, id: input.linkId };
}

/** Withdrawal, not deletion. See the module comment. */
export async function setCommunityLinkActive(
  actorId: string,
  linkId: string,
  active: boolean,
): Promise<LinkOutcome> {
  const link = await prisma.communityLink.findUnique({
    where: { id: linkId },
    select: { id: true, name: true, active: true },
  });
  if (!link) return { ok: false, message: 'That link does not exist.' };
  if (link.active === active) {
    return {
      ok: false,
      message: active ? 'That link is already active.' : 'That link is already withdrawn.',
    };
  }

  await prisma.communityLink.update({ where: { id: linkId }, data: { active } });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: active ? 'COMMUNITY_LINK_ACTIVATED' : 'COMMUNITY_LINK_DEACTIVATED',
      entityType: 'CommunityLink',
      entityId: linkId,
      metadata: { name: link.name, from: link.active, to: active, rowDeleted: false },
    },
  });

  return { ok: true, id: linkId };
}

/** The tier options an admin may pin a link to: exactly the six live tiers. */
export function pinnableTierNames(): string[] {
  return listActiveTiers().map((tier) => tier.name);
}
