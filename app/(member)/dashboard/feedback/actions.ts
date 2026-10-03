'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import { submitFeedback } from '@/lib/feedback';
import { feedbackSubmitSchema } from '@/lib/validation/feedback';

const MEMBER_BASE = '/dashboard/feedback';

export async function submitFeedbackAction(formData: FormData): Promise<void> {
  const user = await requireRole('member', 'mentor', 'admin', 'super_admin');
  await assertSameOrigin();

  const parsed = feedbackSubmitSchema.safeParse({
    formId: formData.get('formId'),
    rating: formData.get('rating'),
    comment: formData.get('comment') ?? '',
    // A checkbox is absent when unticked, which means "not anonymous" — the safe
    // default, since treating a dropped field as private would silently hide the
    // author from a reviewer who was never asked for anonymity.
    isAnonymous: formData.get('isAnonymous') === 'on',
  });
  if (!parsed.success) {
    redirect(`${MEMBER_BASE}?error=Choose+a+rating+from+1+to+5.`);
  }

  const result = await submitFeedback(user.id, parsed.data);
  if (!result.ok) {
    redirect(`${MEMBER_BASE}?error=${encodeURIComponent(result.message)}`);
  }

  redirect(`${MEMBER_BASE}?status=thank-you`);
}
