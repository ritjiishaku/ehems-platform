'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import { markOrderFulfilled } from '@/lib/orders';

const BASE = '/admin/orders';

/**
 * Mark a paid order delivered or collected.
 *
 * `requireRole` runs before the body is parsed (AGENTS.md §7): authorisation is
 * checked first, so a non-admin cannot learn anything from a malformed body.
 * The admin path intentionally omits `ownerId` — acting on another member's order
 * is the point here.
 */
export async function markOrderFulfilledAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const orderId = String(formData.get('orderId') ?? '');
  const result = await markOrderFulfilled(orderId, admin.id);

  if (!result.ok) {
    redirect(`${BASE}?error=${encodeURIComponent(result.message)}`);
  }

  redirect(`${BASE}?status=fulfilled`);
}
