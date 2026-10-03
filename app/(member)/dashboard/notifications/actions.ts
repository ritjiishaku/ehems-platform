'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import { markAllInAppNotificationsRead, markInAppNotificationRead } from '@/lib/notifications';

const BASE = '/dashboard/notifications';

/**
 * Mark one read.
 *
 * `markInAppNotificationRead` scopes by `userId`, so a member cannot mark — or
 * probe for — someone else's notification by guessing an id.
 */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const user = await requireRole('member', 'mentor', 'admin', 'super_admin');
  await assertSameOrigin();

  const notificationId = String(formData.get('notificationId') ?? '');
  await markInAppNotificationRead(notificationId, user.id);

  // The badge lives on the dashboard, so that path is stale too.
  revalidatePath(BASE);
  revalidatePath('/dashboard');
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireRole('member', 'mentor', 'admin', 'super_admin');
  await assertSameOrigin();

  await markAllInAppNotificationsRead(user.id);

  revalidatePath(BASE);
  revalidatePath('/dashboard');
  redirect(`${BASE}?status=all-read`);
}
