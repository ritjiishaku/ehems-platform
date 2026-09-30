import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';
import { listCompletionCandidates } from '@/lib/completion';
import { hasPermission } from '@/lib/permissions';
import { COMPLETION_REQUIREMENT_SLOTS } from '@/lib/validation/completion';
import { reviewCompletionAction } from './actions';

const MISSING_LABELS: Record<string, string> = {
  verified_payment: 'verified payment',
  attendance: 'attendance threshold',
  assignments: 'assignments/tests/projects checklist',
  performance: 'satisfactory performance',
  feedback: 'relevant feedback considered',
};

export default async function AdminCompletionPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; missing?: string; error?: string }>;
}) {
  const admin = await requireRole('admin', 'super_admin');
  const [query, candidates] = await Promise.all([searchParams, listCompletionCandidates(admin.id)]);
  const missing = (query.missing ?? '')
    .split(',')
    .filter(Boolean)
    .map((key) => MISSING_LABELS[key] ?? key);
  const canMarkCompletion = hasPermission(admin, 'completion.mark');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Completion review</h1>
          <p className="body-large text-on-surface-variant mt-3">
            Review every BR-008 condition. Completion is a manual admin decision; this screen never
            completes an enrolment automatically.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to admin
        </Link>
      </div>

      {query.status === 'completed' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Completion marked. Certificate issuance remains a separate explicit admin action.
        </p>
      ) : null}
      {query.status === 'reviewed' ? (
        <p role="status" className="bg-surface-container-high mt-5 rounded-xl p-4">
          Review saved. Still missing: {missing.join(', ') || 'nothing'}.
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {query.error === 'invalid-input'
            ? 'Check the completion review and try again.'
            : query.error}
        </p>
      ) : null}

      {candidates.length === 0 ? (
        <p className="body-large text-on-surface-variant mt-8">
          No active enrolments are ready for completion review.
        </p>
      ) : (
        <ul className="mt-8 space-y-5">
          {candidates.map((candidate) => {
            const alreadyCompleted = candidate.status === 'completed';
            const checklistReady =
              candidate.checklist.length > 0 &&
              candidate.checklist.every((item) => item.isCompleted);

            return (
              <li
                key={candidate.enrolmentId}
                className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="title-medium text-on-surface">{candidate.memberName}</h2>
                    <p className="body-medium text-on-surface-variant mt-1">
                      {candidate.memberEmail} · {candidate.tierName}
                    </p>
                  </div>
                  <span className="label-large text-on-surface-variant">{candidate.status}</span>
                </div>

                {alreadyCompleted ? (
                  <p className="label-large text-primary mt-4">
                    Completed. Certificate issuance is a separate admin action.
                  </p>
                ) : !canMarkCompletion ? (
                  <p className="label-large text-error mt-4">
                    You do not have permission to mark completion.
                  </p>
                ) : (
                  <form action={reviewCompletionAction} className="mt-5 space-y-4">
                    <input type="hidden" name="enrolmentId" value={candidate.enrolmentId} />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Gate label="Verified payment" passed={candidate.paymentVerified} />
                      <Gate label="Assignments checklist" passed={checklistReady} />
                    </div>

                    <div className="rounded-xl border border-outline-variant p-4">
                      <p className="label-large text-on-surface">Attendance per programme</p>
                      <p className="body-medium text-on-surface-variant mt-1">
                        Each programme is measured against its own sessions. Every one must clear
                        its own threshold.
                      </p>
                      {candidate.programmes.length === 0 ? (
                        <p className="body-medium text-error mt-2">
                          This enrolment is not linked to a programme, so there is no attendance
                          evidence and completion is blocked.
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {candidate.programmes.map((programme) => (
                            <li
                              key={programme.programmeId}
                              className={`rounded-lg p-3 ${
                                programme.met
                                  ? 'bg-primary-container text-on-primary-container'
                                  : 'bg-surface-container-high text-on-surface-variant'
                              }`}
                            >
                              <Gate
                                label={`${programme.attendancePercentage}% / ${programme.attendanceThreshold}%`}
                                passed={programme.met}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="body-medium text-on-surface-variant mt-3">
                        Pooled across programmes (display only):{' '}
                        {candidate.overallAttendancePercentage}%
                      </p>
                    </div>

                    <fieldset className="rounded-xl border border-outline-variant p-4">
                      <legend className="label-large text-on-surface px-1">
                        Assignments/tests/projects
                      </legend>
                      {candidate.checklist.length === 0 ? (
                        <p className="body-medium text-error mt-2">
                          No checklist requirements recorded yet. A requirement must exist and be
                          complete, so add the requirements below before this enrolment can
                          complete.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {candidate.checklist.map((item) => (
                            <label
                              key={item.id}
                              className="label-large text-on-surface flex items-start gap-3"
                            >
                              <input
                                type="checkbox"
                                name="checklistIds"
                                value={item.id}
                                defaultChecked={item.isCompleted}
                                className="mt-0.5 h-5 w-5 rounded border-outline accent-primary"
                              />
                              <span>{item.requirementName}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      <div className="border-outline-variant mt-4 border-t pt-4">
                        <p className="label-large text-on-surface">Record a requirement</p>
                        <p className="body-medium text-on-surface-variant mt-1">
                          Leave the name blank to skip. Tick &ldquo;complete&rdquo; only if the
                          member has actually finished it.
                        </p>
                        <div className="mt-3 space-y-2">
                          {Array.from({ length: COMPLETION_REQUIREMENT_SLOTS }, (_, index) => (
                            <div key={index} className="flex flex-wrap items-center gap-3">
                              <label
                                htmlFor={`newRequirementName-${candidate.enrolmentId}-${index}`}
                                className="sr-only"
                              >
                                New requirement {index + 1} for {candidate.memberName}
                              </label>
                              <input
                                id={`newRequirementName-${candidate.enrolmentId}-${index}`}
                                type="text"
                                name={`newRequirementName[${index}]`}
                                maxLength={200}
                                placeholder="Requirement name"
                                className="border-outline bg-surface text-on-surface body-medium placeholder:text-on-surface-variant/70 focus-visible:border-primary w-full min-w-0 flex-1 rounded-lg border px-3 py-2 sm:max-w-xs"
                              />
                              <label className="label-large text-on-surface flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  name={`newRequirementComplete[${index}]`}
                                  value="true"
                                  className="h-5 w-5 rounded border-outline accent-primary"
                                />
                                <span>Complete</span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </fieldset>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="label-large text-on-surface flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="performanceSatisfactory"
                          value="true"
                          defaultChecked={candidate.performanceSatisfactory}
                          className="mt-0.5 h-5 w-5 rounded border-outline accent-primary"
                        />
                        <span>Satisfactory overall performance</span>
                      </label>
                      <label className="label-large text-on-surface flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="feedbackConsidered"
                          value="true"
                          defaultChecked={candidate.feedbackConsidered}
                          className="mt-0.5 h-5 w-5 rounded border-outline accent-primary"
                        />
                        <span>Relevant feedback considered</span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-3 font-semibold shadow-sm transition-colors"
                    >
                      Save review and check completion
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Gate({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div
      className={`rounded-xl p-3 ${passed ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'}`}
    >
      <span className="label-medium">{passed ? 'Ready' : 'Not ready'}</span>
      <span className="body-medium mt-1 block">{label}</span>
    </div>
  );
}
