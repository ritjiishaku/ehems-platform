import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCommunityLink,
  listAllCommunityLinks,
  setCommunityLinkActive,
  updateCommunityLink,
} from '@/lib/community';
import { prisma } from '@/lib/db/client';

const suffix = randomBytes(4).toString('hex');
const created: string[] = [];
let adminId = '';

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: `community-admin-${suffix}@example.test`,
      name: 'Community Admin',
      passwordHash: 'x',
      roleId: 'role-super-admin',
    },
  });
  adminId = admin.id;
});

afterAll(async () => {
  await prisma.communityLink.deleteMany({ where: { id: { in: created } } });
  await prisma.user
    .update({
      where: { id: adminId },
      data: {
        email: `erased-community-${adminId.slice(-6)}-${suffix}@anonymised.invalid`,
        name: 'Erased user',
        deletedAt: new Date(),
      },
    })
    .catch(() => null);
  await prisma.$disconnect();
});

async function newLink(
  overrides: Partial<{
    name: string;
    url: string;
    accessLevel: 'general' | 'ehems_open_sales';
    tierName: string;
  }> = {},
) {
  const result = await createCommunityLink(adminId, {
    name: overrides.name ?? `Link ${randomBytes(3).toString('hex')}`,
    url: overrides.url ?? `https://chat.example.test/${suffix}`,
    accessLevel: overrides.accessLevel ?? 'general',
    tierName: overrides.tierName ?? '',
    active: true,
  });
  if (!result.ok) throw new Error(`setup failed: ${result.message}`);
  created.push(result.id);
  return result.id;
}

describe('community link administration', () => {
  it('creates a link at the general level with no tier pin', async () => {
    const id = await newLink({ accessLevel: 'general' });
    const row = await prisma.communityLink.findUniqueOrThrow({ where: { id } });

    expect(row.accessLevel).toBe('general');
    expect(row.tierName).toBeNull();
    expect(row.active).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: id, action: 'COMMUNITY_LINK_CREATED' },
    });
    expect(audit).not.toBeNull();
  });

  it('stores a tier pin under its exact catalogue display name', async () => {
    const id = await newLink({ tierName: 'Advanced Level IV' });
    const row = await prisma.communityLink.findUniqueOrThrow({ where: { id } });

    // Exact, not the submitted casing — the member read path compares with `!==`
    // against the tier's display name, so anything else would be invisible.
    expect(row.tierName).toBe('Advanced Level IV');
  });

  it('rejects a tier pin that is not a live catalogue tier', async () => {
    const result = await createCommunityLink(adminId, {
      name: `Bad pin ${suffix}`,
      url: `https://chat.example.test/bad-${suffix}`,
      accessLevel: 'general',
      tierName: 'Basic Level 2',
      active: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('six active tiers');
  });

  it('rejects a retired tier pin (BR-016)', async () => {
    // Tiers II, VI, and VII are not in the catalogue, so they cannot be pinned.
    for (const retired of ['Basic Level II', 'Higher Advanced VI', 'Advanced Level VII']) {
      const result = await createCommunityLink(adminId, {
        name: `Retired ${retired} ${suffix}`,
        url: `https://chat.example.test/retired-${suffix}`,
        accessLevel: 'general',
        tierName: retired,
        active: true,
      });
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a non-http scheme', async () => {
    const result = await createCommunityLink(adminId, {
      name: `Bad scheme ${suffix}`,
      url: `javascript:alert(1)`,
      accessLevel: 'general',
      tierName: '',
      active: true,
    });
    expect(result.ok).toBe(false);
  });

  it('updates a link and records the change in the audit log', async () => {
    const id = await newLink({ accessLevel: 'general' });
    const result = await updateCommunityLink(adminId, {
      linkId: id,
      name: `Renamed ${suffix}`,
      url: `https://chat.example.test/moved-${suffix}`,
      accessLevel: 'ehems_open_sales',
      tierName: 'Higher Advanced VIII',
      active: true,
    });
    expect(result.ok).toBe(true);

    const row = await prisma.communityLink.findUniqueOrThrow({ where: { id } });
    expect(row.name).toBe(`Renamed ${suffix}`);
    expect(row.accessLevel).toBe('ehems_open_sales');
    expect(row.tierName).toBe('Higher Advanced VIII');

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: id, action: 'COMMUNITY_LINK_UPDATED' },
    });
    expect(audit?.metadata).toMatchObject({ urlChanged: true });
  });

  it('withdraws a link without deleting the row', async () => {
    const id = await newLink();
    const result = await setCommunityLinkActive(adminId, id, false);
    expect(result.ok).toBe(true);

    const row = await prisma.communityLink.findUniqueOrThrow({ where: { id } });
    expect(row.active).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: id, action: 'COMMUNITY_LINK_DEACTIVATED' },
    });
    expect(audit?.metadata).toMatchObject({ rowDeleted: false });
  });

  it('refuses a redundant state change', async () => {
    const id = await newLink();
    const first = await setCommunityLinkActive(adminId, id, true);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.message).toContain('already active');
  });

  it('narrowing the level list to the two PRD values', async () => {
    await newLink({ accessLevel: 'ehems_open_sales' });
    for (const link of await listAllCommunityLinks()) {
      expect(['general', 'ehems_open_sales']).toContain(link.accessLevel);
    }
  });
});
