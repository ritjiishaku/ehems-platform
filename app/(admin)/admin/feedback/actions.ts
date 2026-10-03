'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import { createFeedbackForm, setFeedbackFormActive } from '@/lib/feedback';
import { feedbackFormCreateSchema } from '@/lib/validation/feedback';

const ADMIN_BASE = '/admin/feedback';

export async function createFeedbackFormAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const parsed = feedbackFormCreateSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    active: true,
  });
  if (!parsed.success) {
    redirect(`${ADMIN_BASE}?error=Give+the+form+a+title.`);
  }

  const result = await createFeedbackForm(admin.id, parsed.data);
  if (!result.ok) {
    redirect(`${ADMIN_BASE}?error=${encodeURIComponent(result.message)}`);
  }

  redirect(`${ADMIN_BASE}?status=form-created`);
}

export async function setFeedbackFormActiveAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const formId = String(formData.get('formId') ?? '');
  const active = formData.get('active') === 'true';

  const result = await setFeedbackFormActive(admin.id, formId, active);
  if (!result.ok) {
    redirect(`${ADMIN_BASE}?error=${encodeURIComponent(result.message)}`);
  }

  redirect(`${ADMIN_BASE}?status=${active ? 'form-opened' : 'form-closed'}`);
}
