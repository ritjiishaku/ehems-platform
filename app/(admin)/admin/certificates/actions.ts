'use server';

/**
 * Manual certificate issuance action.
 *
 * `hasPermission(admin, 'certificate.issue')` rather than a hardcoded role list —
 * §4.2 carries a `certificate.issue` row and BR-010 makes issuance an explicit
 * admin action, so the matrix is the one place that answers "who may issue".
 *
 * No password re-authentication (NFR-008). Certificate rows are immutable, so this
 * cannot be walked back from the member side; the re-auth prompt would protect an
 * action whose worst outcome is a visible, audited, admin-reversible record.
 */

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import { issueCertificates } from '@/lib/certificates';
import { hasPermission } from '@/lib/permissions';
import { issueCertificatesSchema } from '@/lib/validation/certificates';

async function requireIssuer() {
  const admin = await requireRole('admin', 'super_admin');
  if (!hasPermission(admin, 'certificate.issue')) {
    redirect('/admin?error=not-permitted');
  }
  return admin;
}

export async function issueCertificatesAction(formData: FormData): Promise<void> {
  const admin = await requireIssuer();
  await assertSameOrigin();

  const parsed = issueCertificatesSchema.safeParse({
    enrolmentId: formData.get('enrolmentId'),
    certificateIds: formData.getAll('certificateIds'),
  });
  if (!parsed.success) {
    redirect('/admin/certificates?error=invalid-input');
  }

  const result = await issueCertificates(admin.id, parsed.data);
  if (!result.ok) {
    redirect(`/admin/certificates?error=${encodeURIComponent(result.message)}`);
  }

  const params = new URLSearchParams({ status: 'issued', count: String(result.issued.length) });
  // Anything the admin selected but did not get is reported rather than swallowed.
  // A certificate silently not issued is the failure mode an admin cannot detect.
  if (result.skipped.length > 0) params.set('skipped', String(result.skipped.length));
  if (result.rejected.length > 0) params.set('rejected', String(result.rejected.length));

  redirect(`/admin/certificates?${params.toString()}`);
}
