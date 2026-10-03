'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import { createCommunityLink, setCommunityLinkActive, updateCommunityLink } from '@/lib/community';
import {
  communityLinkCreateSchema,
  communityLinkUpdateSchema,
} from '@/lib/validation/community-links';

const BASE = '/admin/community-links';

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

export async function createCommunityLinkAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const parsed = communityLinkCreateSchema.safeParse({
    name: formData.get('name'),
    url: formData.get('url'),
    accessLevel: formData.get('accessLevel'),
    tierName: formData.get('tierName') ?? '',
  });
  if (!parsed.success) {
    fail('Check the link details and try again.');
  }

  const result = await createCommunityLink(admin.id, parsed.data);
  if (!result.ok) fail(result.message);

  redirect(`${BASE}?status=created`);
}

export async function updateCommunityLinkAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const parsed = communityLinkUpdateSchema.safeParse({
    linkId: formData.get('linkId'),
    name: formData.get('name'),
    url: formData.get('url'),
    accessLevel: formData.get('accessLevel'),
    tierName: formData.get('tierName') ?? '',
  });
  if (!parsed.success) {
    fail('Check the link details and try again.');
  }

  const result = await updateCommunityLink(admin.id, parsed.data);
  if (!result.ok) fail(result.message);

  redirect(`${BASE}?status=updated`);
}

export async function setCommunityLinkActiveAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const linkId = String(formData.get('linkId') ?? '');
  const active = formData.get('active') === 'true';

  const result = await setCommunityLinkActive(admin.id, linkId, active);
  if (!result.ok) fail(result.message);

  redirect(`${BASE}?status=${active ? 'activated' : 'withdrawn'}`);
}
