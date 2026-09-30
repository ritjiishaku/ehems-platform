import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import { requireRole } from '@/lib/auth/rbac';
import { getAttendanceSheet, listAttendanceSessions } from '@/lib/attendance';
import { ATTENDANCE_STATUSES } from '@/lib/validation/attendance';
import { markAttendanceAction } from './actions';

const STATUS_LABELS: Record<(typeof ATTENDANCE_STATUSES)[number], string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
};

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; status?: string; error?: string }>;
}) {
  const admin = await requireRole('admin', 'super_admin');
  const query = await searchParams;
  const sessions = await listAttendanceSessions(admin.id);
  const selectedId = query.session ?? sessions[0]?.id;
  const sheet = selectedId ? await getAttendanceSheet(selectedId, admin.id) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Attendance</h1>
          <p className="body-large text-on-surface-variant mt-3">
            Mark each active member manually for one programme session. Attendance percentage is
            recalculated from session records after every save.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to admin
        </Link>
      </div>

      {query.status === 'updated' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Attendance saved and the member&rsquo;s cached percentage was recalculated.
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {query.error === 'invalid-input'
            ? 'Check the attendance details and try again.'
            : query.error}
        </p>
      ) : null}

      {sessions.length === 0 ? (
        <p className="body-large text-on-surface-variant mt-8">
          No programme sessions have been created yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-4">
          <aside aria-label="Programme sessions">
            <h2 className="title-large text-on-surface">Sessions</h2>
            <ul className="mt-3 space-y-2">
              {sessions.map((session) => (
                <li key={session.id}>
                  <Link
                    href={`/admin/attendance?session=${encodeURIComponent(session.id)}`}
                    className={`block rounded-xl border p-3 transition-colors ${
                      session.id === selectedId
                        ? 'border-primary bg-primary-container text-on-primary-container'
                        : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <span className="label-large block">{session.title}</span>
                    <span className="body-small mt-1 block">
                      {session.programmeName} · {formatDateTime(session.startsAt)}
                    </span>
                    <span className="body-small mt-1 block">
                      Threshold: {session.attendanceThreshold}%
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>

          {sheet ? (
            <section className="lg:col-span-3" aria-labelledby="selected-session">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 id="selected-session" className="title-large text-on-surface">
                    {sheet.title}
                  </h2>
                  <p className="body-medium text-on-surface-variant mt-1">
                    {sheet.programmeName} · {formatDateTime(sheet.startsAt)} ·{' '}
                    {sheet.members.length} {sheet.members.length === 1 ? 'member' : 'members'}
                  </p>
                </div>
                <span className="label-large text-primary">
                  {sheet.attendanceThreshold}% threshold
                </span>
              </div>

              {sheet.members.length === 0 ? (
                <p className="body-large text-on-surface-variant mt-6">
                  No active members are attached to this programme.
                </p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {sheet.members.map((member) => (
                    <li
                      key={member.enrolmentId}
                      className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <h3 className="title-medium text-on-surface">{member.memberName}</h3>
                          <p className="body-medium text-on-surface-variant mt-1">
                            {member.memberEmail} · {member.tierName}
                          </p>
                        </div>
                        <span className="label-large text-on-surface-variant">
                          Cached attendance: {member.attendancePercentage}%
                        </span>
                      </div>

                      <form action={markAttendanceAction} className="mt-4 space-y-3">
                        <input type="hidden" name="sessionId" value={sheet.id} />
                        <input type="hidden" name="enrolmentId" value={member.enrolmentId} />
                        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
                          <div>
                            <label
                              htmlFor={`status-${member.enrolmentId}`}
                              className="label-medium text-on-surface block font-medium"
                            >
                              Status
                            </label>
                            <select
                              id={`status-${member.enrolmentId}`}
                              name="status"
                              defaultValue={member.status ?? 'present'}
                              className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                            >
                              {ATTENDANCE_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {STATUS_LABELS[status]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor={`notes-${member.enrolmentId}`}
                              className="label-medium text-on-surface block font-medium"
                            >
                              Notes
                            </label>
                            <input
                              id={`notes-${member.enrolmentId}`}
                              name="notes"
                              defaultValue={member.notes ?? ''}
                              maxLength={1000}
                              className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                            />
                          </div>
                          <button
                            type="submit"
                            className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors"
                          >
                            Save attendance
                          </button>
                        </div>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <p className="body-large text-on-surface-variant">
              Select a session to mark attendance.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
