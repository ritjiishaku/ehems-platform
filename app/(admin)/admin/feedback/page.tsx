import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';
import { listAllFeedbackResponses } from '@/lib/feedback';
import { prisma } from '@/lib/db/client';
import { formatDateTime } from '@/lib/format';
import { FEEDBACK_RATING_MAX } from '@/lib/validation/feedback';
import { createFeedbackFormAction, setFeedbackFormActiveAction } from './actions';

const STATUS_MESSAGES: Record<string, string> = {
  'form-created': 'Feedback form created.',
  'form-opened': 'Form opened for responses.',
  'form-closed': 'Form closed. Responses already collected are kept.',
};

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string; form?: string }>;
}) {
  const admin = await requireRole('admin', 'super_admin');
  const query = await searchParams;

  const { forms, responses } = await listAllFeedbackResponses(
    admin.id,
    query.form && query.form !== 'all' ? query.form : undefined,
  );

  const allForms = await prisma.feedbackForm.findMany({
    orderBy: { title: 'asc' },
    select: { id: true, title: true, active: true, _count: { select: { responses: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Feedback</h1>
          <p className="body-large text-on-surface-variant mt-3">
            Review what members have sent. Reporting and sentiment analysis are Phase 2 work, so
            this is a plain list.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to admin
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

      <section aria-labelledby="forms" className="mt-8">
        <h2 id="forms" className="title-large text-on-surface">
          Forms
        </h2>
        {allForms.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-4">No feedback forms yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {allForms.map((form) => (
              <li
                key={form.id}
                className="border-outline-variant bg-surface-container-lowest rounded-2xl border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title-medium text-on-surface">{form.title}</h3>
                  <span
                    className={`label-large ${form.active ? 'text-primary' : 'text-on-surface-variant'}`}
                  >
                    {form.active ? 'Open' : 'Closed'}
                  </span>
                </div>
                <p className="body-medium text-on-surface-variant mt-1">
                  {form._count.responses} {form._count.responses === 1 ? 'response' : 'responses'}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    href={`/admin/feedback?form=${encodeURIComponent(form.id)}`}
                    className="text-label-large text-primary underline-offset-4 hover:underline"
                  >
                    View responses
                  </Link>
                  <form action={setFeedbackFormActiveAction}>
                    <input type="hidden" name="formId" value={form.id} />
                    <input type="hidden" name="active" value={form.active ? 'false' : 'true'} />
                    <button
                      type="submit"
                      className="border-outline text-on-surface hover:bg-surface-container text-label-large rounded-xl border px-4 py-2 font-semibold transition-colors"
                    >
                      {form.active ? 'Close form' : 'Reopen form'}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          action={createFeedbackFormAction}
          className="border-outline-variant bg-surface-container-lowest mt-6 grid gap-4 rounded-2xl border p-5 sm:grid-cols-2"
        >
          <div>
            <label htmlFor="form-title" className="label-medium text-on-surface block font-medium">
              New form title
            </label>
            <input
              id="form-title"
              name="title"
              required
              maxLength={200}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="form-description"
              className="label-medium text-on-surface block font-medium"
            >
              Description
            </label>
            <input
              id="form-description"
              name="description"
              maxLength={2000}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <button
              type="submit"
              className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors"
            >
              Create form
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="responses" className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="responses" className="title-large text-on-surface">
            Responses
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/feedback?form=all"
              className="text-label-large text-primary underline-offset-4 hover:underline"
            >
              All forms
            </Link>
            {forms.map((form) => (
              <Link
                key={form.id}
                href={`/admin/feedback?form=${encodeURIComponent(form.id)}`}
                className="text-label-large text-primary underline-offset-4 hover:underline"
              >
                {form.title}
              </Link>
            ))}
          </div>
        </div>

        {responses.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-4">No responses yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {responses.map((response) => (
              <li
                key={response.id}
                className="border-outline-variant bg-surface-container-lowest rounded-2xl border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title-medium text-on-surface">{response.formTitle}</h3>
                  <span className="label-large text-on-surface-variant">
                    {response.rating} / {FEEDBACK_RATING_MAX}
                  </span>
                </div>
                {response.comment ? (
                  <p className="body-medium text-on-surface mt-2">{response.comment}</p>
                ) : (
                  <p className="body-medium text-on-surface-variant mt-2 italic">No comment</p>
                )}
                <p className="body-small text-on-surface-variant mt-2">
                  {formatDateTime(response.submittedAt)}
                  {' · '}
                  {response.isAnonymous
                    ? 'Anonymous'
                    : `${response.authorName ?? 'Unknown'} (${response.authorEmail ?? 'no email'})`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
