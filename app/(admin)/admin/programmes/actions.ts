'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import {
  createMaterial,
  createProgramme,
  createSession,
  deactivateMaterial,
  deactivateProgramme,
  removeSession,
  setProgrammeTiers,
  updateProgramme,
} from '@/lib/programmes';
import {
  materialCreateSchema,
  programmeCreateSchema,
  programmeTiersSchema,
  sessionCreateSchema,
} from '@/lib/validation/programmes';

/**
 * Every action follows the same shape: authorise, check same-origin, parse
 * through a Zod schema at the boundary, then hand off to `lib/programmes/`
 * where the BR-008 threshold floor and the BR-016 tier guard actually live.
 *
 * The failure message is carried in the query string rather than rendered from a
 * thrown error, which keeps the domain layer's `ok/message` contract intact and
 * means a business-rule refusal explains itself ("cannot be below 60%") instead
 * of degrading to a generic "check the details and try again".
 */

function withError(programmeId: string, message: string): string {
  return `/admin/programmes/${encodeURIComponent(programmeId)}?error=${encodeURIComponent(message)}`;
}

export async function createProgrammeAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const parsed = programmeCreateSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    attendanceThreshold: formData.get('attendanceThreshold'),
  });
  if (!parsed.success) {
    redirect('/admin/programmes?error=Check+the+programme+details+and+try+again.');
  }

  const result = await createProgramme(admin.id, parsed.data);
  if (!result.ok) {
    redirect(`/admin/programmes?error=${encodeURIComponent(result.message)}`);
  }

  // Straight to tier mapping: a new programme is inactive and unusable until a
  // tier maps to it, so that is the only sensible next step.
  redirect(`/admin/programmes/${encodeURIComponent(result.id)}?status=created`);
}

export async function updateProgrammeAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const programmeId = String(formData.get('programmeId') ?? '');
  const parsed = programmeCreateSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    attendanceThreshold: formData.get('attendanceThreshold'),
  });
  if (!parsed.success) {
    redirect(withError(programmeId, 'Check the programme details and try again.'));
  }

  const result = await updateProgramme(admin.id, {
    ...parsed.data,
    programmeId,
    // `active` is a checkbox, so absence means "leave withdrawn" rather than an
    // absent field failing the boolean coercion.
    active: formData.get('active') === 'on',
  });
  if (!result.ok) {
    redirect(withError(programmeId, result.message));
  }

  redirect(`/admin/programmes/${encodeURIComponent(programmeId)}?status=updated`);
}

export async function deactivateProgrammeAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const programmeId = String(formData.get('programmeId') ?? '');
  const result = await deactivateProgramme(admin.id, programmeId);
  if (!result.ok) {
    redirect(withError(programmeId, result.message));
  }

  redirect(`/admin/programmes/${encodeURIComponent(programmeId)}?status=withdrawn`);
}

export async function setProgrammeTiersAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const tierIds = formData.getAll('tierIds').map(String);
  const parsed = programmeTiersSchema.safeParse({
    programmeId: formData.get('programmeId'),
    tierIds,
  });
  if (!parsed.success) {
    redirect(withError(String(formData.get('programmeId') ?? ''), 'Select at least one tier.'));
  }

  const result = await setProgrammeTiers(admin.id, parsed.data);
  if (!result.ok) {
    redirect(withError(parsed.data.programmeId, result.message));
  }

  redirect(`/admin/programmes/${encodeURIComponent(parsed.data.programmeId)}?status=tiers-updated`);
}

export async function createSessionAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const programmeId = String(formData.get('programmeId') ?? '');
  const parsed = sessionCreateSchema.safeParse({
    programmeId,
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    startsAt: formData.get('startsAt'),
    endsAt: formData.get('endsAt') || undefined,
    locationType: formData.get('locationType') ?? 'physical',
    locationDetails: formData.get('locationDetails') ?? '',
  });
  if (!parsed.success) {
    redirect(withError(programmeId, 'Check the session details and try again.'));
  }

  const result = await createSession(admin.id, parsed.data);
  if (!result.ok) {
    redirect(withError(programmeId, result.message));
  }

  redirect(`/admin/programmes/${encodeURIComponent(programmeId)}?status=session-created`);
}

export async function removeSessionAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const sessionId = String(formData.get('sessionId') ?? '');
  const programmeId = String(formData.get('programmeId') ?? '');

  const result = await removeSession(admin.id, sessionId);
  if (!result.ok) {
    redirect(withError(programmeId, result.message));
  }

  redirect(`/admin/programmes/${encodeURIComponent(programmeId)}?status=session-removed`);
}

export async function createMaterialAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const parsed = materialCreateSchema.safeParse({
    programmeId: formData.get('programmeId'),
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    fileUrl: formData.get('fileUrl'),
  });
  if (!parsed.success) {
    redirect(
      withError(
        String(formData.get('programmeId') ?? ''),
        'A material needs a title and a valid file URL.',
      ),
    );
  }

  const result = await createMaterial(admin.id, parsed.data);
  if (!result.ok) {
    redirect(withError(parsed.data.programmeId, result.message));
  }

  redirect(
    `/admin/programmes/${encodeURIComponent(parsed.data.programmeId)}?status=material-created`,
  );
}

export async function deactivateMaterialAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin', 'super_admin');
  await assertSameOrigin();

  const programmeId = String(formData.get('programmeId') ?? '');
  const materialId = String(formData.get('materialId') ?? '');

  const result = await deactivateMaterial(admin.id, materialId);
  if (!result.ok) {
    redirect(withError(programmeId, result.message));
  }

  redirect(`/admin/programmes/${encodeURIComponent(programmeId)}?status=material-withdrawn`);
}
