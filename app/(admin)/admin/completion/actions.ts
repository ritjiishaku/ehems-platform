'use server';

/**
 * Manual completion action.
 *
 * Authorisation is `hasPermission(admin, 'completion.mark')` rather than a
 * hardcoded role list, because the matrix already carries a `Mark completion`
 * row (PRD §4.2). Checking the matrix keeps one answer to "who may complete an
 * enrolment" instead of two.
 *
 * NFR-008: unlike the data-request actions, no password re-authentication here.
 * Marking completion is the irreversible half of the membership lifecycle, but
 * it is fully reversible in effect — nothing is dispatched and no money moves,
 * and a completed enrolment is refused rather than silently reopened, so the
 * admin who marked it must come back to an admin anyway. If the client wants a
 * re-auth prompt on this specific action, that is a one-line addition.
 */

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import { reviewCompletion } from '@/lib/completion';
import { hasPermission } from '@/lib/permissions';
import { COMPLETION_REQUIREMENT_SLOTS, completionReviewSchema } from '@/lib/validation/completion';

async function requireCompletionMarker() {
  const admin = await requireRole('admin', 'super_admin');
  if (!hasPermission(admin, 'completion.mark')) {
    redirect('/admin?error=not-permitted');
  }
  return admin;
}

export async function reviewCompletionAction(formData: FormData): Promise<void> {
  const admin = await requireCompletionMarker();
  await assertSameOrigin();

  const newRequirements = Array.from({ length: COMPLETION_REQUIREMENT_SLOTS }, (_, index) => ({
    name: formData.get(`newRequirementName[${index}]`),
    complete: formData.get(`newRequirementComplete[${index}]`) === 'true',
  })).filter(
    (requirement): requirement is { name: string; complete: boolean } =>
      typeof requirement.name === 'string' && requirement.name.trim() !== '',
  );

  const parsed = completionReviewSchema.safeParse({
    enrolmentId: formData.get('enrolmentId'),
    performanceSatisfactory: formData.get('performanceSatisfactory') === 'true',
    feedbackConsidered: formData.get('feedbackConsidered') === 'true',
    checklistIds: formData.getAll('checklistIds'),
    newRequirements,
  });
  if (!parsed.success) {
    redirect('/admin/completion?error=invalid-input');
  }

  const result = await reviewCompletion(admin.id, parsed.data);
  if (!result.ok) {
    redirect(`/admin/completion?error=${encodeURIComponent(result.message)}`);
  }
  if (result.completed) {
    redirect('/admin/completion?status=completed');
  }

  redirect(`/admin/completion?status=reviewed&missing=${result.missing.join(',')}`);
}
