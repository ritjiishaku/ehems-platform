'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import { markAttendance } from '@/lib/attendance';
import { attendanceMarkSchema } from '@/lib/validation/attendance';

export async function markAttendanceAction(formData: FormData): Promise<void> {
  // Phase 1 attendance is manual admin operations. The permission matrix lists
  // Mentor for future programme attendance, but AGENTS.md §3 explicitly fences
  // mentor attendance dashboards to Phase 2.
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const parsed = attendanceMarkSchema.safeParse({
    sessionId: formData.get('sessionId'),
    enrolmentId: formData.get('enrolmentId'),
    status: formData.get('status'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    redirect('/admin/attendance?error=invalid-input');
  }

  const result = await markAttendance(admin.id, parsed.data);
  redirect(
    result.ok
      ? `/admin/attendance?session=${encodeURIComponent(parsed.data.sessionId)}&status=updated`
      : `/admin/attendance?session=${encodeURIComponent(parsed.data.sessionId)}&error=${encodeURIComponent(result.message)}`,
  );
}
