'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import { transitionDataSubjectRequest } from '@/lib/ndpa/data-subject-requests';
import { dataSubjectRequestHandlingSchema } from '@/lib/validation/data-subject-request';

/**
 * Handle one data subject request.
 *
 * Authorisation runs before the body is parsed (AGENTS.md §7) and uses a direct
 * role check: PRD §4.2 has no data-subject row, so there is no permission key
 * to check. Recorded as a deliberate gap rather than an invented matrix row.
 */
export async function handleDataSubjectRequestAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const parsed = dataSubjectRequestHandlingSchema.safeParse({
    requestId: formData.get('requestId'),
    to: formData.get('to'),
    notes: typeof formData.get('notes') === 'string' ? String(formData.get('notes')) : undefined,
  });
  if (!parsed.success) {
    redirect('/admin/data-requests?error=invalid-request');
  }

  let outcome;
  try {
    outcome = await transitionDataSubjectRequest({
      requestId: parsed.data.requestId,
      actorId: admin.id,
      to: parsed.data.to,
      notes: parsed.data.notes ?? null,
    });
  } catch {
    redirect('/admin/data-requests?error=unavailable');
  }

  redirect(
    outcome.ok
      ? `/admin/data-requests?status=updated&to=${encodeURIComponent(outcome.to)}`
      : `/admin/data-requests?error=transition-refused`,
  );
}
