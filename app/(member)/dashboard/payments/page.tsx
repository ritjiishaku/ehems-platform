import Link from 'next/link';
import { requireSession } from '@/lib/auth/rbac';
import { formatDateTime, formatNaira, formatNairaShort } from '@/lib/format';
import {
  isPaymentMethod,
  getPaymentInstructions,
  listPaymentsForMember,
  PAYMENT_MEMBER_ACTIONABLE_STATUSES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  priceTierForMember,
} from '@/lib/payments';
import { listActiveTiers } from '@/lib/pricing/tiers';
import { ACCEPTED_PROOF_MIME } from '@/lib/validation/payment';
import {
  startPurchaseAction,
  resubmitPaymentProofAction,
  submitPaymentProofAction,
} from './actions';

/**
 * A member's payments: start a purchase, submit proof, see what happened to it.
 *
 * Every state renders its own next step rather than a generic "contact us":
 * `pending` needs the instructions and a proof form, `rejected` shows the reason
 * above a resubmission form (D-8 — same row, and the reason is deliberately
 * still on it), and `submitted`/`under_review` say who has it and when, because
 * the commonest support question on a manual verification system is "did you get
 * my money yet".
 */
export default async function MemberPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    sent?: string;
    resent?: string;
    started?: string;
    focus?: string;
  }>;
}) {
  const member = await requireSession();
  const [query, payments, pricing, instructions] = await Promise.all([
    searchParams,
    listPaymentsForMember(member.id),
    Promise.all(listActiveTiers().map((tier) => priceTierForMember(member.id, tier.id))),
    getPaymentInstructions(),
  ]);

  const available = pricing.filter((priced) => priced !== null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Payments</h1>
          <p className="body-large mt-3 text-on-surface-variant">
            Pay by bank transfer or mobile money, then upload your receipt. An EHEMS admin reviews
            every payment by hand.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>

      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {query.error}
        </p>
      ) : null}
      {query.sent ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Thank you. Your proof is with our team. We will email you once it has been reviewed.
        </p>
      ) : null}
      {query.resent ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Your new proof has been submitted. The earlier rejection reason stays on the payment so
          our team has the full history.
        </p>
      ) : null}
      {query.started ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          You are enrolled on a free tier and your access is active straight away.
        </p>
      ) : null}

      {instructions.state.mode === 'test' ? (
        <div
          className="bg-error-container text-on-error-container mt-5 rounded-xl p-4"
          role="alert"
        >
          <p className="label-large">TEST PAYMENT MODE</p>
          <p className="body-medium mt-1">
            These payment details are non-functional. Do not send real money.
          </p>
        </div>
      ) : null}

      {!instructions.state.memberVisible || !instructions.configured ? (
        <div className="bg-surface-container-high mt-5 rounded-xl p-4">
          <p className="label-large text-on-surface">Payment instructions are not available yet.</p>
          <p className="body-medium text-on-surface-variant mt-1">
            Please contact the EHEMS team before making a payment. Do not transfer money to an
            account unless the destination details appear here.
          </p>
        </div>
      ) : (
        <PaymentInstructionsCard instructions={instructions} />
      )}

      <section className="mt-10" aria-labelledby="your-payments">
        <h2 id="your-payments" className="title-large text-on-surface">
          Your payments
        </h2>

        {payments.length === 0 ? (
          <p className="body-large mt-4 text-on-surface-variant">
            You have not started a purchase yet. Pick a tier below to get the amount to pay.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {payments.map((payment) => {
              const status = payment.status;
              const canSubmit =
                PAYMENT_MEMBER_ACTIONABLE_STATUSES.includes(status) &&
                instructions.state.acceptsUploads &&
                instructions.configured;
              const isResubmission = status === 'rejected';
              const highlighted = query.focus === payment.id;

              return (
                <li
                  key={payment.id}
                  className={`rounded-2xl border bg-surface-container-lowest p-4 ${
                    highlighted ? 'border-primary' : 'border-outline-variant'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="title-medium text-on-surface">{payment.tierName}</h3>
                    <span className="label-medium text-on-surface-variant">
                      {PAYMENT_STATUS_LABELS[status] ?? payment.status}
                    </span>
                  </div>

                  <p className="body-medium mt-1 text-on-surface-variant">
                    {formatNaira(payment.amountKobo)} {payment.currency}
                    {payment.submittedAt
                      ? ` · submitted ${formatDateTime(payment.submittedAt)}`
                      : ` · started ${formatDateTime(payment.createdAt)}`}
                  </p>

                  {payment.paymentMethod ? (
                    <p className="body-medium mt-1 text-on-surface-variant">
                      {isPaymentMethod(payment.paymentMethod)
                        ? PAYMENT_METHOD_LABELS[payment.paymentMethod]
                        : payment.paymentMethod}
                      {payment.paymentReference ? ` · ref ${payment.paymentReference}` : ''}
                      {payment.bankName ? ` · ${payment.bankName}` : ''}
                      {payment.transferDate ? ` · ${formatDateTime(payment.transferDate)}` : ''}
                    </p>
                  ) : null}

                  {payment.verifiedAt ? (
                    <p className="label-large text-primary mt-2">
                      Verified {formatDateTime(payment.verifiedAt)} — your tier is active.
                    </p>
                  ) : null}

                  {payment.rejectionReason ? (
                    <div className="bg-error-container text-on-error-container mt-3 rounded-xl p-3">
                      <p className="label-large">Why this was not accepted</p>
                      <p className="body-medium mt-1">{payment.rejectionReason}</p>
                    </div>
                  ) : null}

                  {canSubmit ? (
                    <ProofForm
                      paymentId={payment.id}
                      amountLabel={formatNaira(payment.amountKobo)}
                      isResubmission={isResubmission}
                      accept={ACCEPTED_PROOF_MIME}
                    />
                  ) : (
                    <p className="body-medium mt-3 text-on-surface-variant">
                      {PAYMENT_MEMBER_ACTIONABLE_STATUSES.includes(status) &&
                      (!instructions.state.acceptsUploads || !instructions.configured)
                        ? 'Payment uploads are temporarily unavailable. Please contact the EHEMS team.'
                        : status === 'submitted'
                          ? 'Waiting in the admin verification queue. Nothing else to do for now.'
                          : 'With an EHEMS admin for review.'}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-labelledby="start-a-purchase">
        <h2 id="start-a-purchase" className="title-large text-on-surface">
          Start a purchase
        </h2>
        <p className="body-large mt-2 text-on-surface-variant">
          The amount below is calculated for your account. Upgrades are charged at the difference
          between the two official tier prices, and the 50% Advanced discount applies only to a
          first-time buyer&rsquo;s first Advanced tier.
        </p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {available.map((priced) =>
            priced === null ? null : (
              <li
                key={priced.tier.id}
                className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title-medium text-on-surface">{priced.tier.name}</h3>
                  <span className="title-small text-on-surface">
                    {priced.isFree ? 'Free' : formatNairaShort(priced.amountKobo)}
                  </span>
                </div>
                <p className="body-medium mt-1 text-on-surface-variant">
                  {priced.tier.mentorship}
                  {priced.isUpgrade ? ' · upgrade difference' : ''}
                  {!priced.isFree && priced.tier.discountedPriceKobo !== null && !priced.isUpgrade
                    ? ` · first-purchase price ${formatNairaShort(priced.tier.discountedPriceKobo)}`
                    : ''}
                </p>
                <form action={startPurchaseAction} className="mt-3">
                  <input type="hidden" name="tierId" value={priced.tier.id} />
                  <button
                    type="submit"
                    disabled={
                      !priced.isFree &&
                      (!instructions.state.acceptsUploads || !instructions.configured)
                    }
                    className="bg-primary text-on-primary text-label-large hover:bg-primary/90 disabled:bg-surface-container-highest disabled:text-on-surface-variant rounded-xl px-4 py-2.5 font-semibold shadow-sm transition-colors"
                  >
                    {priced.isFree ? 'Join free tier' : 'Get payment instructions'}
                  </button>
                </form>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}

/**
 * The proof form.
 *
 * A server component rendering a plain `<form>` — no client component and no
 * state, because a plain form posts to a server action and comes back with a
 * redirect. The only client-side behaviour is `required` on the file input, which
 * the server re-checks anyway.
 */
function ProofForm({
  paymentId,
  amountLabel,
  isResubmission,
  accept,
}: {
  paymentId: string;
  amountLabel: string;
  isResubmission: boolean;
  accept: string;
}) {
  const action = isResubmission ? resubmitPaymentProofAction : submitPaymentProofAction;
  const heading = isResubmission ? 'Send new proof' : 'Submit proof of payment';
  const fieldPrefix = `${isResubmission ? 'resubmit' : 'submit'}-${paymentId}`;

  return (
    <form action={action} className="mt-4 space-y-3" aria-label={`${heading} for ${amountLabel}`}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <p className="body-medium text-on-surface">Pay {amountLabel} exactly as shown, then:</p>

      <div>
        <label
          htmlFor={`method-${fieldPrefix}`}
          className="label-medium text-on-surface block font-medium"
        >
          How did you pay?
        </label>
        <select
          id={`method-${fieldPrefix}`}
          name="paymentMethod"
          required
          defaultValue="bank_transfer"
          className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
        >
          <option value="bank_transfer">{PAYMENT_METHOD_LABELS.bank_transfer}</option>
          <option value="mobile_money">{PAYMENT_METHOD_LABELS.mobile_money}</option>
          <option value="cash">{PAYMENT_METHOD_LABELS.cash} (pay at the office)</option>
        </select>
      </div>

      <div>
        <label
          htmlFor={`bank-${fieldPrefix}`}
          className="label-medium text-on-surface block font-medium"
        >
          Bank or provider
        </label>
        <input
          id={`bank-${fieldPrefix}`}
          name="bankName"
          type="text"
          maxLength={120}
          className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
        />
      </div>

      <div>
        <label
          htmlFor={`ref-${fieldPrefix}`}
          className="label-medium text-on-surface block font-medium"
        >
          Reference
        </label>
        <input
          id={`ref-${fieldPrefix}`}
          name="paymentReference"
          type="text"
          required
          maxLength={120}
          className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
        />
      </div>

      <div>
        <label
          htmlFor={`date-${fieldPrefix}`}
          className="label-medium text-on-surface block font-medium"
        >
          Transfer date
        </label>
        <input
          id={`date-${fieldPrefix}`}
          name="transferDate"
          type="date"
          required
          className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
        />
      </div>

      <div>
        <label
          htmlFor={`file-${fieldPrefix}`}
          className="label-medium text-on-surface block font-medium"
        >
          Receipt photo or PDF
        </label>
        <input
          id={`file-${fieldPrefix}`}
          name="proof"
          type="file"
          required
          accept={accept}
          className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
        />
        <p className="body-small text-on-surface-variant mt-1">
          JPEG, PNG, WebP, HEIC, or PDF, up to 5 MB. Stored encrypted.
        </p>
      </div>

      <button
        type="submit"
        className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-3 font-semibold shadow-sm transition-colors"
      >
        {heading}
      </button>
    </form>
  );
}

function PaymentInstructionsCard({
  instructions,
}: {
  instructions: Awaited<ReturnType<typeof getPaymentInstructions>>;
}) {
  return (
    <section
      className="bg-primary-container text-on-primary-container mt-5 rounded-2xl p-5"
      aria-labelledby="payment-instructions"
    >
      <h2 id="payment-instructions" className="title-medium">
        Payment instructions
      </h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <Instruction label="Bank" value={instructions.bankName} />
        <Instruction label="Account name" value={instructions.accountName} />
        <Instruction label="Account number" value={instructions.accountNumber} />
        <Instruction label="Reference" value={instructions.referenceFormat} />
        {instructions.mobileMoneyEnabled ? (
          <>
            <Instruction label="Mobile-money provider" value={instructions.mobileMoneyProvider} />
            <Instruction label="Mobile-money number" value={instructions.mobileMoneyNumber} />
            <Instruction
              label="Mobile-money account name"
              value={instructions.mobileMoneyAccountName}
            />
          </>
        ) : null}
      </dl>
      {instructions.supportName || instructions.supportPhone || instructions.supportEmail ? (
        <p className="body-small mt-4">
          Payment help: {instructions.supportName ?? 'EHEMS support'}
          {instructions.supportPhone ? ` · ${instructions.supportPhone}` : ''}
          {instructions.supportEmail ? ` · ${instructions.supportEmail}` : ''}
        </p>
      ) : null}
    </section>
  );
}

function Instruction({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="label-medium opacity-80">{label}</dt>
      <dd className="body-large font-semibold">{value ?? 'Not configured'}</dd>
    </div>
  );
}
