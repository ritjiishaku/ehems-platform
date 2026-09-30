'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/rbac';
import { submitDataSubjectRequest } from '@/lib/ndpa/data-subject-requests';
import { dataSubjectRequestSchema } from '@/lib/validation/data-subject-request';

export async function submitDataSubjectRequestAction(formData: FormData): Promise<void> {
  const user = await requireSession();
  await assertSameOrigin();

  const parsed = dataSubjectRequestSchema.safeParse({ requestType: formData.get('requestType') });
  if (!parsed.success) redirect('/settings/data-requests?error=invalid-request');

  try {
    await submitDataSubjectRequest(user.id, parsed.data.requestType);
  } catch {
    redirect('/settings/data-requests?error=unavailable');
  }

  redirect('/settings/data-requests?status=submitted');
}
