import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';
import { listAvailableFeedbackForms, listOwnFeedback } from '@/lib/feedback';
import { formatDate } from '@/lib/format';
import { FEEDBACK_RATING_MAX, FEEDBACK_RATING_MIN } from '@/lib/validation/feedback';
import { submitFeedbackAction } from './actions';

export default async function MemberFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const user = await requireRole('member', 'mentor', 'admin', 'super_admin');
  const query = await searchParams;
  const [forms, ownResponses] = await Promise.all([
    listAvailableFeedbackForms(user.id),
    listOwnFeedback(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Feedback</h1>
          <p className="body-large text-on-surface-variant mt-3">
            Tell us how a session or programme went. You can update an answer you have already
            given.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>

      {query.status === 'thank-you' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Thank you. Your feedback has been recorded.
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {query.error.replace(/\+/g, ' ')}
        </p>
      ) : null}

      <section aria-labelledby="open-forms" className="mt-8">
        <h2 id="open-forms" className="title-large text-on-surface">
          Open forms
        </h2>
        {forms.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-4">
            There is no feedback form open right now.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {forms.map((form) => (
              <li
                key={form.id}
                className="border-outline-variant bg-surface-container-lowest rounded-2xl border p-5"
              >
                <h3 className="title-medium text-on-surface">{form.title}</h3>
                {form.description ? (
                  <p className="body-medium text-on-surface-variant mt-2">{form.description}</p>
                ) : null}
                {form.ownResponse ? (
                  <p className="body-medium text-on-surface-variant mt-2">
                    You gave {form.ownResponse.rating} out of {FEEDBACK_RATING_MAX}. Saving again
                    replaces your earlier answer.
                  </p>
                ) : null}

                <form action={submitFeedbackAction} className="mt-4 space-y-4">
                  <input type="hidden" name="formId" value={form.id} />
                  <fieldset>
                    <legend className="label-medium text-on-surface font-medium">
                      How would you rate it?
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Array.from(
                        { length: FEEDBACK_RATING_MAX - FEEDBACK_RATING_MIN + 1 },
                        (_unused, index) => index + FEEDBACK_RATING_MIN,
                      ).map((rating) => (
                        <div key={rating} className="flex items-center gap-1.5">
                          <input
                            id={`rating-${form.id}-${rating}`}
                            name="rating"
                            type="radio"
                            value={rating}
                            required
                            defaultChecked={form.ownResponse?.rating === rating}
                            className="border-outline focus:ring-primary/20 h-5 w-5"
                          />
                          <label
                            htmlFor={`rating-${form.id}-${rating}`}
                            className="body-large text-on-surface"
                          >
                            {rating}
                          </label>
                        </div>
                      ))}
                    </div>
                  </fieldset>

                  <div>
                    <label
                      htmlFor={`comment-${form.id}`}
                      className="label-medium text-on-surface block font-medium"
                    >
                      Anything you would like to add? (optional)
                    </label>
                    <textarea
                      id={`comment-${form.id}`}
                      name="comment"
                      rows={3}
                      maxLength={2000}
                      defaultValue={form.ownResponse?.comment ?? ''}
                      className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id={`anonymous-${form.id}`}
                      name="isAnonymous"
                      type="checkbox"
                      className="border-outline focus:ring-primary/20 h-5 w-5 rounded"
                    />
                    <label htmlFor={`anonymous-${form.id}`} className="body-large text-on-surface">
                      Hide my name from the reviewer
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors"
                  >
                    {form.ownResponse ? 'Update feedback' : 'Send feedback'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-feedback" className="mt-10">
        <h2 id="my-feedback" className="title-large text-on-surface">
          What you have told us
        </h2>
        {ownResponses.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-4">
            You have not sent any feedback yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {ownResponses.map((response) => (
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
                  <p className="body-medium text-on-surface-variant mt-2">{response.comment}</p>
                ) : null}
                <p className="body-small text-on-surface-variant mt-2">
                  {formatDate(response.submittedAt)}
                  {response.isAnonymous ? ' · submitted anonymously' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
