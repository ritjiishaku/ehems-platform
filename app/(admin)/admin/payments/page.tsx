import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';
import { hasPermission } from '@/lib/permissions';
import { formatDateTime, formatNaira } from '@/lib/format';
import {
  isPaymentMethod,
  listPaymentsForVerificationQueue,
  listPaymentsInReview,
  PAYMENT_METHOD_LABELS,
} from '@/lib/payments';
import { decidePaymentAction, openPaymentForReviewAction, viewPaymentProofAction } from './actions';

/**
 * Errors that come back as a query slug rather than as prose.
 *
 * A `redirect` has to carry something in the URL, and a URL cannot carry a
 * paragraph. These are the slugs the actions emit on their own behalf; anything
 * else in `?error=` is a transition message from `lib/payments/`, already
 * written for a human, and is shown verbatim.
 */
const ERROR_MESSAGES: Record<string, string> = {
  'invalid-request': 'That request was incomplete. Reload the queue and try again.',
  'reauthentication-failed': 'That was not your password, so no decision was recorded.',
  'not-permitted': 'Your role does not include payment verification.',
};

/**
 * The payment verification queue.
 *
 * Two lists, because the state machine distinguishes them and the UI should too:
 *
 * - **Waiting** — `submitted`, nobody has opened it. The only action is "Open for
 *   review", which is what moves a payment to `under_review` and records who took
 *   it. Showing a verify button here would be a lie: `state.ts` refuses a verify
 *   from `submitted`, and a button the server will refuse is worse than no button.
 * - **In review** — `under_review`, somebody has it. Named, so a second admin does
 *   not pick up the same row, and the two decisions are offered.
 *
 * Access is gated on the §4.2 `payment.verify` grant rather than on holding any
 * admin role, because that is the row that describes this page.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    opened?: string;
    verified?: string;
    rejected?: string;
  }>;
}) {
  const admin = await requireRole('admin', 'super_admin');
  const query = await searchParams;

  if (!hasPermission(admin, 'payment.verify')) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="headline-medium text-on-surface">Payment verification</h1>
        <p className="body-large mt-3 text-on-surface-variant">
          Your role does not include payment verification. A Super Admin can grant it.
        </p>
      </div>
    );
  }

  const [waiting, inReview] = await Promise.all([
    listPaymentsForVerificationQueue(admin.id),
    listPaymentsInReview(admin.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="headline-medium text-on-surface">Payment verification</h1>
      <p className="body-large mt-3 text-on-surface-variant">
        Check each transfer against your banking record before verifying. Verification activates the
        member&rsquo;s tier — it is the only thing that does.
      </p>

      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {ERROR_MESSAGES[query.error] ?? query.error}
        </p>
      ) : null}
      {query.opened ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Marked as under review. Decide it below.
        </p>
      ) : null}
      {query.verified ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Verified. The member&rsquo;s tier is now active and they have been emailed.
        </p>
      ) : null}
      {query.rejected ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Rejected. The member has the reason and can send new proof against the same payment.
        </p>
      ) : null}

      <section className="mt-10" aria-labelledby="in-review">
        <h2 id="in-review" className="title-large text-on-surface">
          In review ({inReview.length})
        </h2>
        {inReview.length === 0 ? (
          <p className="body-large mt-3 text-on-surface-variant">Nothing is open for review.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {inReview.map((payment) => (
              <li
                key={payment.id}
                className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
              >
                <PaymentSummary payment={payment} />
                <p className="label-medium text-on-surface-variant mt-1">
                  Opened by {payment.openedByName ?? 'an admin'}
                  {payment.underReviewedAt ? ` · ${formatDateTime(payment.underReviewedAt)}` : ''}
                </p>
                {payment.proofUploaded ? <ProofViewer paymentId={payment.id} /> : null}
                <form action={decidePaymentAction} className="mt-4 space-y-3">
                  <input type="hidden" name="paymentId" value={payment.id} />
                  <div>
                    <label
                      htmlFor={`decision-${payment.id}`}
                      className="label-medium text-on-surface block font-medium"
                    >
                      Outcome
                    </label>
                    <select
                      id={`decision-${payment.id}`}
                      name="decision"
                      defaultValue="verify"
                      className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2 sm:max-w-xs"
                    >
                      <option value="verify">Verify and activate tier</option>
                      <option value="reject">Reject with a reason</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`reason-${payment.id}`}
                      className="label-medium text-on-surface block font-medium"
                    >
                      Reason (required to reject)
                    </label>
                    <textarea
                      id={`reason-${payment.id}`}
                      name="reason"
                      rows={2}
                      maxLength={1000}
                      placeholder="e.g. The amount transferred does not match the tier price"
                      className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`password-${payment.id}`}
                      className="label-medium text-on-surface block font-medium"
                    >
                      Your password
                    </label>
                    <input
                      id={`password-${payment.id}`}
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      aria-describedby={`password-help-${payment.id}`}
                      className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2 sm:max-w-xs"
                    />
                    <p
                      id={`password-help-${payment.id}`}
                      className="body-small text-on-surface-variant mt-1"
                    >
                      Confirming a decision activates a paid tier, so it needs your password again.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-3 font-semibold shadow-sm transition-colors"
                  >
                    Record outcome
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-labelledby="waiting">
        <h2 id="waiting" className="title-large text-on-surface">
          Waiting for review ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <p className="body-large mt-3 text-on-surface-variant">
            The queue is empty. New submissions appear here as members send them.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {waiting.map((payment) => (
              <li
                key={payment.id}
                className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
              >
                <PaymentSummary payment={payment} />
                <form action={openPaymentForReviewAction} className="mt-4">
                  <input type="hidden" name="paymentId" value={payment.id} />
                  <button
                    type="submit"
                    className="bg-secondary text-on-secondary text-label-large hover:bg-secondary/90 rounded-xl px-5 py-3 font-semibold shadow-sm transition-colors"
                  >
                    Open for review
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="body-small text-on-surface-variant mt-10">
        <Link href="/admin" className="text-primary underline-offset-4 hover:underline">
          Back to admin
        </Link>
      </p>
    </div>
  );
}

function PaymentSummary({
  payment,
}: {
  payment: Awaited<ReturnType<typeof listPaymentsForVerificationQueue>>[number];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="title-medium text-on-surface">{payment.memberName}</h3>
        <span className="label-medium text-on-surface-variant">{payment.status}</span>
      </div>
      <p className="body-medium mt-1 text-on-surface-variant">
        {payment.tierName} · {formatNaira(payment.amountKobo)} {payment.currency}
      </p>
      <p className="body-medium mt-1 text-on-surface-variant">
        {payment.memberEmail} · submitted{' '}
        {payment.submittedAt ? formatDateTime(payment.submittedAt) : 'at an unknown time'}
      </p>
      {payment.tierListPriceKobo !== null && payment.tierListPriceKobo !== payment.amountKobo ? (
        <p className="body-medium text-on-surface mt-1">
          List price {formatNaira(payment.tierListPriceKobo)} — an upgrade difference or a
          first-purchase discount, so the recorded amount is expected to differ.
        </p>
      ) : null}
      <p className="body-medium mt-1 text-on-surface-variant">
        {payment.paymentMethod && isPaymentMethod(payment.paymentMethod)
          ? PAYMENT_METHOD_LABELS[payment.paymentMethod]
          : (payment.paymentMethod ?? 'method not recorded')}
        {payment.paymentReference ? ` · ref ${payment.paymentReference}` : ''}
        {payment.bankName ? ` · ${payment.bankName}` : ''}
        {payment.transferDate ? ` · ${formatDateTime(payment.transferDate)}` : ''}
      </p>
      {payment.proofUploaded ? (
        <p className="label-medium text-primary mt-1">Proof of payment attached (encrypted)</p>
      ) : (
        <p className="label-large text-error mt-1">No proof attached</p>
      )}
      {payment.rejectionReason ? (
        <p className="body-medium text-on-surface mt-2">Last rejected: {payment.rejectionReason}</p>
      ) : null}
    </div>
  );
}

/**
 * Open the proof file.
 *
 * Not a link. NFR-008 makes viewing a member's payment proof a sensitive
 * operation, and a bare `<a href="/api/payment-proof/…">` would be a
 * replayable URL in history and in any proxy log on the way to the file. So this
 * posts the admin's password to a server action, which verifies it and redirects
 * to a signed 60-second grant. Every open is written to the audit log.
 *
 * `autoComplete="current-password"` is deliberate: it lets a password manager
 * fill this in, which is the difference between re-auth being routine and
 * re-auth being the thing people work around.
 */
function ProofViewer({ paymentId }: { paymentId: string }) {
  return (
    <details className="mt-3">
      <summary className="label-large text-primary cursor-pointer select-none">
        View proof of payment
      </summary>
      <form action={viewPaymentProofAction} className="mt-3 space-y-2">
        <input type="hidden" name="paymentId" value={paymentId} />
        <label
          htmlFor={`proof-password-${paymentId}`}
          className="label-medium text-on-surface block"
        >
          Re-enter your password to open it
        </label>
        <input
          id={`proof-password-${paymentId}`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2 sm:max-w-xs"
        />
        <button
          type="submit"
          className="text-on-surface text-label-large border-outline hover:bg-surface-container-highest rounded-xl border px-4 py-2 font-semibold transition-colors"
        >
          Open proof
        </button>
      </form>
    </details>
  );
}
