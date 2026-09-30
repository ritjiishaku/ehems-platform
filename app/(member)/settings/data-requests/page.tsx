import Link from 'next/link';
import { requireSession } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db/client';
import {
  DATA_SUBJECT_REQUEST_STATUS_LABELS,
  DATA_SUBJECT_REQUEST_TYPE_LABELS,
  isDataSubjectRequestStatus,
  isDataSubjectRequestType,
} from '@/lib/ndpa/types';
import { submitDataSubjectRequestAction } from './actions';

export default async function DataRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await requireSession();
  const [{ status, error }, requests] = await Promise.all([
    searchParams,
    prisma.dataSubjectRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/dashboard"
        className="text-label-large text-primary underline-offset-4 hover:underline"
      >
        Back to dashboard
      </Link>
      <h1 className="headline-medium mt-5 text-on-surface">Your data rights</h1>
      <p className="body-large mt-3 text-on-surface-variant">
        Submit a request about your personal data. Your request is recorded for the EHEMS team to
        review.
      </p>

      {status === 'submitted' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Your request has been recorded.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          The request could not be submitted. Please try again later.
        </p>
      ) : null}

      <form action={submitDataSubjectRequestAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="requestType" className="label-medium text-on-surface block font-medium">
            Request type
          </label>
          <select
            id="requestType"
            name="requestType"
            required
            className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
          >
            <option value="access">Access my data</option>
            <option value="rectification">Correct my data</option>
            <option value="erasure">Request erasure</option>
            <option value="restriction">Restrict processing</option>
            <option value="portability">Export my data</option>
            <option value="objection">Object to processing</option>
          </select>
        </div>
        <button
          type="submit"
          className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-3 font-semibold shadow-sm transition-colors"
        >
          Submit request
        </button>
      </form>

      <section aria-labelledby="request-history-heading" className="mt-10 space-y-3">
        <h2 id="request-history-heading" className="title-large text-on-surface">
          Request history
        </h2>
        {requests.length === 0 ? (
          <p className="body-large text-on-surface-variant">
            You have not submitted a data request.
          </p>
        ) : (
          requests.map((request) => (
            <article
              key={request.id}
              className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
            >
              <h3 className="title-medium text-on-surface">
                {isDataSubjectRequestType(request.requestType)
                  ? DATA_SUBJECT_REQUEST_TYPE_LABELS[request.requestType]
                  : 'Data request'}
              </h3>
              <p className="body-medium mt-1 text-on-surface-variant">
                Status:{' '}
                {isDataSubjectRequestStatus(request.status)
                  ? DATA_SUBJECT_REQUEST_STATUS_LABELS[request.status]
                  : 'Unknown'}{' '}
                · Submitted{' '}
                {request.createdAt.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' })}
              </p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
