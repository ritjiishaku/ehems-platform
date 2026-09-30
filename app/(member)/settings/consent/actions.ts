'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/rbac';
import { withdrawConsent } from '@/lib/ndpa/consent-records';
import { consentWithdrawalSchema } from '@/lib/validation/consent';

function requestIp(requestHeaders: Headers): string | undefined {
  const firstForwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
  return firstForwarded || requestHeaders.get('x-real-ip')?.trim() || undefined;
}

export async function withdrawConsentAction(formData: FormData): Promise<void> {
  const user = await requireSession();
  await assertSameOrigin();

  const parsed = consentWithdrawalSchema.safeParse({ consentId: formData.get('consentId') });
  if (!parsed.success) redirect('/settings/consent?error=invalid-request');

  const requestHeaders = await headers();
  const withdrawn = await withdrawConsent(user.id, parsed.data.consentId, {
    ipAddress: requestIp(requestHeaders),
    userAgent: requestHeaders.get('user-agent') ?? undefined,
  });

  redirect(withdrawn ? '/settings/consent?status=withdrawn' : '/settings/consent?error=not-found');
}
