'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/rbac';
import { updateProfile, verifyCurrentPassword } from '@/lib/auth/profile';
import { profileUpdateSchema } from '@/lib/validation/profile';

function requestIp(requestHeaders: Headers): string | undefined {
  const firstForwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
  return firstForwarded || requestHeaders.get('x-real-ip')?.trim() || undefined;
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  const user = await requireSession();
  await assertSameOrigin();

  const parsed = profileUpdateSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    profession: formData.get('profession'),
    healthcareSpecialty: formData.get('healthcareSpecialty') || undefined,
    currentPassword: formData.get('currentPassword'),
  });
  if (!parsed.success) redirect('/settings/profile?error=invalid-input');

  const { currentPassword, ...profile } = parsed.data;
  if (!(await verifyCurrentPassword(user.id, currentPassword))) {
    redirect('/settings/profile?error=reauthentication-failed');
  }

  const requestHeaders = await headers();
  const updated = await updateProfile(user.id, profile, {
    ipAddress: requestIp(requestHeaders),
    userAgent: requestHeaders.get('user-agent') ?? undefined,
  });

  redirect(updated ? '/settings/profile?status=updated' : '/settings/profile?error=update-failed');
}
