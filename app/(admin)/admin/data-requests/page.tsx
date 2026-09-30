import { requireRole } from '@/lib/auth/rbac';
import { daysSinceRequested, DSR_TRANSITIONS, isOverdue } from '@/lib/ndpa/dsr-state';
import { listDataSubjectRequestsForAdmin } from '@/lib/ndpa/data-subject-requests';
import {
  DATA_SUBJECT_REQUEST_STATUS_LABELS,
  DATA_SUBJECT_REQUEST_TYPE_LABELS,
  isDataSubjectRequestStatus,
  isDataSubjectRequestType,
} from '@/lib/ndpa/types';
import { handleDataSubjectRequestAction } from './actions';

const WAT_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
};

export default async function AdminDataRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; to?: string; error?: string }>;
}) {
  const admin = await requireRole('admin', 'super_admin');
  const [query, requests] = await Promise.all([
    searchParams,
    listDataSubjectRequestsForAdmin(admin.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="headline-medium text-on-surface">Data subject requests</h1>
      <p className="body-large mt-3 text-on-surface-variant">
        Members exercise their data rights under the NDPA. Answer within 30 days of the request
        being made.
      </p>

      {query.status === 'updated' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Request moved to {query.to?.replace('_', ' ') ?? 'its new status'}.
        </p>
      ) : null}
      {query.error === 'transition-refused' ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          That change was refused. A closed request cannot be reopened — ask the member to submit a
          new request.
        </p>
      ) : null}
      {query.error === 'invalid-request' || query.error === 'unavailable' ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          The request could not be updated. Please try again.
        </p>
      ) : null}

      {requests.length === 0 ? (
        <p className="body-large mt-8 text-on-surface-variant">
          No data subject requests have been submitted.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {requests.map((request) => {
            // An unrecognised stored status is shown verbatim and offers no
            // actions: `validateTransition` refuses to move a request out of a
            // status it does not recognise, so rendering it as "Pending" would
            // promise a transition the server will not make.
            const status = isDataSubjectRequestStatus(request.status) ? request.status : null;
            const nextStatuses = status ? DSR_TRANSITIONS[status] : [];
            const age = daysSinceRequested(request.createdAt);
            const overdue = isOverdue(request.createdAt) && nextStatuses.length > 0;
            const typeLabel = isDataSubjectRequestType(request.requestType)
              ? DATA_SUBJECT_REQUEST_TYPE_LABELS[request.requestType]
              : 'Data request';

            return (
              <li
                key={request.id}
                className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="title-medium text-on-surface">{typeLabel}</h2>
                  <span className="label-medium text-on-surface-variant">
                    {status ? DATA_SUBJECT_REQUEST_STATUS_LABELS[status] : request.status}
                  </span>
                </div>

                <p className="body-medium mt-1 text-on-surface-variant">
                  {request.memberName} · {request.memberEmail}
                </p>
                <p className="body-medium mt-1 text-on-surface-variant">
                  Made {request.createdAt.toLocaleDateString('en-NG', WAT_DATE)} · {age}{' '}
                  {age === 1 ? 'day' : 'days'} ago
                  {request.handlerName ? ` · handled by ${request.handlerName}` : ''}
                </p>
                {overdue ? (
                  <p className="label-large text-error mt-2">Past the 30 day response window</p>
                ) : null}
                {request.handlingNotes ? (
                  <p className="body-medium text-on-surface mt-3 whitespace-pre-line">
                    {request.handlingNotes}
                  </p>
                ) : null}

                {nextStatuses.length > 0 ? (
                  <form
                    action={handleDataSubjectRequestAction}
                    className="mt-4 space-y-3"
                    aria-label={`Handle ${typeLabel.toLowerCase()} request for ${request.memberName}`}
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                    <div>
                      <label
                        htmlFor={`to-${request.id}`}
                        className="label-medium text-on-surface block font-medium"
                      >
                        New status
                      </label>
                      <select
                        id={`to-${request.id}`}
                        name="to"
                        className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2 sm:max-w-xs"
                      >
                        {nextStatuses.map((next) => (
                          <option key={next} value={next}>
                            {DATA_SUBJECT_REQUEST_STATUS_LABELS[next]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor={`notes-${request.id}`}
                        className="label-medium text-on-surface block font-medium"
                      >
                        Handling notes
                      </label>
                      <textarea
                        id={`notes-${request.id}`}
                        name="notes"
                        rows={2}
                        maxLength={2000}
                        required={nextStatuses.some(
                          (next) => next === 'completed' || next === 'rejected',
                        )}
                        placeholder="What was done, or why the request was refused"
                        className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                      />
                    </div>
                    <button
                      type="submit"
                      className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-3 font-semibold shadow-sm transition-colors"
                    >
                      Record outcome
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
