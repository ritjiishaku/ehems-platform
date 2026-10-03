import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';
import { listProgrammes, MINIMUM_ATTENDANCE_THRESHOLD } from '@/lib/programmes';
import { createProgrammeAction } from './actions';

export default async function AdminProgrammesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  await requireRole('admin', 'super_admin');
  const query = await searchParams;
  const programmes = await listProgrammes();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Programmes</h1>
          <p className="body-large text-on-surface-variant mt-3">
            A programme is reachable by the tiers you map to it. Attendance is measured per
            programme, and each member&rsquo;s threshold is frozen when they enrol.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to admin
        </Link>
      </div>

      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {query.error.replace(/\+/g, ' ')}
        </p>
      ) : null}

      <section aria-labelledby="new-programme" className="mt-8">
        <h2 id="new-programme" className="title-large text-on-surface">
          New programme
        </h2>
        <form
          action={createProgrammeAction}
          className="border-outline-variant bg-surface-container-lowest mt-4 grid gap-4 rounded-2xl border p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label
              htmlFor="new-programme-name"
              className="label-medium text-on-surface block font-medium"
            >
              Programme name
            </label>
            <input
              id="new-programme-name"
              name="name"
              required
              maxLength={200}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="new-programme-description"
              className="label-medium text-on-surface block font-medium"
            >
              Description
            </label>
            <textarea
              id="new-programme-description"
              name="description"
              rows={3}
              maxLength={5000}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="new-programme-threshold"
              className="label-medium text-on-surface block font-medium"
            >
              Attendance threshold (%)
            </label>
            <input
              id="new-programme-threshold"
              name="attendanceThreshold"
              type="number"
              min={MINIMUM_ATTENDANCE_THRESHOLD}
              max={100}
              defaultValue={MINIMUM_ATTENDANCE_THRESHOLD}
              required
              aria-describedby="threshold-help"
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
            <p id="threshold-help" className="body-small text-on-surface-variant mt-2">
              Cannot be set below {MINIMUM_ATTENDANCE_THRESHOLD}% (BR-008). You may set it higher.
            </p>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors"
            >
              Create programme
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="programme-list" className="mt-10">
        <h2 id="programme-list" className="title-large text-on-surface">
          All programmes
        </h2>
        {programmes.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-4">
            No programmes yet. Create one above.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {programmes.map((programme) => (
              <li
                key={programme.id}
                className="border-outline-variant bg-surface-container-lowest rounded-2xl border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title-medium text-on-surface">{programme.name}</h3>
                  <span
                    className={`label-large ${
                      programme.active ? 'text-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {programme.active ? 'Active' : 'Withdrawn'}
                  </span>
                </div>
                <dl className="body-medium text-on-surface-variant mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt>Threshold:</dt>
                    <dd>{programme.attendanceThreshold}%</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>Tiers:</dt>
                    <dd>
                      {programme.tierNames.length > 0 ? programme.tierNames.join(', ') : 'None'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>Sessions:</dt>
                    <dd>{programme.sessionCount}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>Materials:</dt>
                    <dd>{programme.materialCount}</dd>
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <dt>Enrolled members:</dt>
                    <dd>{programme.linkedEnrolmentCount}</dd>
                  </div>
                </dl>
                <Link
                  href={`/admin/programmes/${encodeURIComponent(programme.id)}`}
                  className="text-label-large text-primary underline-offset-4 mt-4 inline-block hover:underline"
                >
                  Manage
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
