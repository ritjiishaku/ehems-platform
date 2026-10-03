import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db/client';
import { formatDateTime } from '@/lib/format';
import {
  listProgrammeMaterials,
  listProgrammeSessions,
  MINIMUM_ATTENDANCE_THRESHOLD,
} from '@/lib/programmes';
import { listActiveTiers } from '@/lib/pricing/tiers';
import { SESSION_LOCATION_TYPES } from '@/lib/validation/programmes';
import {
  createMaterialAction,
  createSessionAction,
  deactivateMaterialAction,
  deactivateProgrammeAction,
  removeSessionAction,
  setProgrammeTiersAction,
  updateProgrammeAction,
} from '../actions';

const LOCATION_LABELS: Record<(typeof SESSION_LOCATION_TYPES)[number], string> = {
  physical: 'Physical',
  virtual: 'Virtual',
  hybrid: 'Hybrid',
};

const STATUS_MESSAGES: Record<string, string> = {
  created: 'Programme created. Map the tiers that should reach it.',
  updated: 'Programme updated.',
  withdrawn: 'Programme withdrawn. It is hidden from members but its records are kept.',
  'tiers-updated': 'Tier mapping saved.',
  'session-created': 'Session added.',
  'session-removed': 'Session removed.',
  'material-created': 'Material added.',
  'material-withdrawn': 'Material withdrawn.',
};

export default async function AdminProgrammeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ programmeId: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  await requireRole('admin', 'super_admin');
  const { programmeId } = await params;
  const query = await searchParams;

  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    include: { tiers: { include: { tier: { select: { id: true, name: true } } } } },
  });
  if (!programme) notFound();

  const [sessions, materials] = await Promise.all([
    listProgrammeSessions(programme.id),
    listProgrammeMaterials(programme.id),
  ]);

  const mappedTierIds = new Set(programme.tiers.map((mapping) => mapping.tier.id));
  const catalogue = listActiveTiers();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">{programme.name}</h1>
          <p className="body-large text-on-surface-variant mt-3">
            {programme.active ? 'Active' : 'Withdrawn'} · {programme.attendanceThreshold}% threshold
          </p>
        </div>
        <Link
          href="/admin/programmes"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          All programmes
        </Link>
      </div>

      {query.status && STATUS_MESSAGES[query.status] ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          {STATUS_MESSAGES[query.status]}
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {query.error.replace(/\+/g, ' ')}
        </p>
      ) : null}

      <section aria-labelledby="edit-programme" className="mt-8">
        <h2 id="edit-programme" className="title-large text-on-surface">
          Details
        </h2>
        <form
          action={updateProgrammeAction}
          className="border-outline-variant bg-surface-container-lowest mt-4 grid gap-4 rounded-2xl border p-5 sm:grid-cols-2"
        >
          <input type="hidden" name="programmeId" value={programme.id} />
          <div className="sm:col-span-2">
            <label
              htmlFor="programme-name"
              className="label-medium text-on-surface block font-medium"
            >
              Programme name
            </label>
            <input
              id="programme-name"
              name="name"
              defaultValue={programme.name}
              required
              maxLength={200}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="programme-description"
              className="label-medium text-on-surface block font-medium"
            >
              Description
            </label>
            <textarea
              id="programme-description"
              name="description"
              defaultValue={programme.description ?? ''}
              rows={3}
              maxLength={5000}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="programme-threshold"
              className="label-medium text-on-surface block font-medium"
            >
              Attendance threshold (%)
            </label>
            <input
              id="programme-threshold"
              name="attendanceThreshold"
              type="number"
              min={MINIMUM_ATTENDANCE_THRESHOLD}
              max={100}
              defaultValue={programme.attendanceThreshold}
              required
              aria-describedby="detail-threshold-help"
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
            <p id="detail-threshold-help" className="body-small text-on-surface-variant mt-2">
              Applies to future enrolments. Members already on this programme keep the threshold
              they were given.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex items-center gap-2">
              <input
                id="programme-active"
                name="active"
                type="checkbox"
                defaultChecked={programme.active}
                className="border-outline focus:ring-primary/20 h-5 w-5 rounded"
              />
              <label htmlFor="programme-active" className="label-large text-on-surface">
                Active
              </label>
            </div>
            <button
              type="submit"
              className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors"
            >
              Save changes
            </button>
          </div>
        </form>

        {programme.active ? (
          <form action={deactivateProgrammeAction} className="mt-3">
            <input type="hidden" name="programmeId" value={programme.id} />
            <button
              type="submit"
              className="border-outline text-on-surface hover:bg-surface-container text-label-large rounded-xl border px-5 py-2.5 font-semibold transition-colors"
            >
              Withdraw programme
            </button>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="tier-mapping" className="mt-10">
        <h2 id="tier-mapping" className="title-large text-on-surface">
          Tier mapping
        </h2>
        <p className="body-large text-on-surface-variant mt-3">
          Only these tiers can reach this programme. Retired tiers are never listed.
        </p>
        <form action={setProgrammeTiersAction} className="mt-4">
          <input type="hidden" name="programmeId" value={programme.id} />
          <fieldset>
            <legend className="label-medium text-on-surface font-medium">Eligible tiers</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {catalogue.map((tier) => (
                <div key={tier.id} className="flex items-center gap-2">
                  <input
                    id={`tier-${tier.id}`}
                    name="tierIds"
                    type="checkbox"
                    value={tier.id}
                    defaultChecked={mappedTierIds.has(tier.id)}
                    className="border-outline focus:ring-primary/20 h-5 w-5 rounded"
                  />
                  <label htmlFor={`tier-${tier.id}`} className="body-large text-on-surface">
                    {tier.name}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            className="bg-primary text-on-primary text-label-large hover:bg-primary/90 mt-4 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors"
          >
            Save tier mapping
          </button>
        </form>
      </section>

      <section aria-labelledby="sessions" className="mt-10">
        <h2 id="sessions" className="title-large text-on-surface">
          Sessions
        </h2>
        {sessions.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-4">No sessions yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="border-outline-variant bg-surface-container-lowest rounded-2xl border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title-medium text-on-surface">{session.title}</h3>
                  <span className="label-large text-on-surface-variant">
                    {LOCATION_LABELS[session.locationType as keyof typeof LOCATION_LABELS] ??
                      session.locationType}
                  </span>
                </div>
                <p className="body-medium text-on-surface-variant mt-1">
                  {formatDateTime(session.startsAt)}
                  {session.endsAt ? ` – ${formatDateTime(session.endsAt)}` : ''}
                </p>
                {session.locationDetails ? (
                  <p className="body-medium text-on-surface-variant mt-1 break-words">
                    {session.locationDetails}
                  </p>
                ) : null}
                <p className="body-small text-on-surface-variant mt-2">
                  Attendance records: {session.attendanceCount}
                  {session.attendanceCount > 0 ? ' — this session cannot be removed.' : ''}
                </p>
                {session.attendanceCount === 0 ? (
                  <form action={removeSessionAction} className="mt-3">
                    <input type="hidden" name="sessionId" value={session.id} />
                    <input type="hidden" name="programmeId" value={programme.id} />
                    <button
                      type="submit"
                      className="border-outline text-on-surface hover:bg-surface-container text-label-large rounded-xl border px-4 py-2 font-semibold transition-colors"
                    >
                      Remove session
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <form
          action={createSessionAction}
          className="border-outline-variant bg-surface-container-lowest mt-6 grid gap-4 rounded-2xl border p-5 sm:grid-cols-2"
        >
          <input type="hidden" name="programmeId" value={programme.id} />
          <div className="sm:col-span-2">
            <label
              htmlFor="session-title"
              className="label-medium text-on-surface block font-medium"
            >
              Session title
            </label>
            <input
              id="session-title"
              name="title"
              required
              maxLength={200}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="session-starts"
              className="label-medium text-on-surface block font-medium"
            >
              Starts (WAT)
            </label>
            <input
              id="session-starts"
              name="startsAt"
              type="datetime-local"
              required
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="session-ends"
              className="label-medium text-on-surface block font-medium"
            >
              Ends (WAT, optional)
            </label>
            <input
              id="session-ends"
              name="endsAt"
              type="datetime-local"
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="session-location-type"
              className="label-medium text-on-surface block font-medium"
            >
              Location type
            </label>
            <select
              id="session-location-type"
              name="locationType"
              defaultValue="physical"
              className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            >
              {SESSION_LOCATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {LOCATION_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="session-location-details"
              className="label-medium text-on-surface block font-medium"
            >
              Venue or joining details
            </label>
            <input
              id="session-location-details"
              name="locationDetails"
              maxLength={1000}
              required
              aria-describedby="location-help"
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
            <p id="location-help" className="body-small text-on-surface-variant mt-2">
              Required for every session type.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="session-description"
              className="label-medium text-on-surface block font-medium"
            >
              Description
            </label>
            <textarea
              id="session-description"
              name="description"
              rows={2}
              maxLength={5000}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <button
              type="submit"
              className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors"
            >
              Add session
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="materials" className="mt-10">
        <h2 id="materials" className="title-large text-on-surface">
          Materials
        </h2>
        {materials.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-4">No materials yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {materials.map((material) => (
              <li
                key={material.id}
                className="border-outline-variant bg-surface-container-lowest rounded-2xl border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title-medium text-on-surface">{material.title}</h3>
                  <span
                    className={`label-large ${
                      material.active ? 'text-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {material.active ? 'Available' : 'Withdrawn'}
                  </span>
                </div>
                {material.description ? (
                  <p className="body-medium text-on-surface-variant mt-1">{material.description}</p>
                ) : null}
                <p className="body-small text-on-surface-variant mt-2 break-all">
                  {material.fileUrl}
                </p>
                {material.active ? (
                  <form action={deactivateMaterialAction} className="mt-3">
                    <input type="hidden" name="materialId" value={material.id} />
                    <input type="hidden" name="programmeId" value={programme.id} />
                    <button
                      type="submit"
                      className="border-outline text-on-surface hover:bg-surface-container text-label-large rounded-xl border px-4 py-2 font-semibold transition-colors"
                    >
                      Withdraw material
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <form
          action={createMaterialAction}
          className="border-outline-variant bg-surface-container-lowest mt-6 grid gap-4 rounded-2xl border p-5 sm:grid-cols-2"
        >
          <input type="hidden" name="programmeId" value={programme.id} />
          <div>
            <label
              htmlFor="material-title"
              className="label-medium text-on-surface block font-medium"
            >
              Material title
            </label>
            <input
              id="material-title"
              name="title"
              required
              maxLength={200}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="material-url"
              className="label-medium text-on-surface block font-medium"
            >
              File URL
            </label>
            <input
              id="material-url"
              name="fileUrl"
              type="url"
              required
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="material-description"
              className="label-medium text-on-surface block font-medium"
            >
              Description
            </label>
            <textarea
              id="material-description"
              name="description"
              rows={2}
              maxLength={5000}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <button
              type="submit"
              className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors"
            >
              Add material
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
