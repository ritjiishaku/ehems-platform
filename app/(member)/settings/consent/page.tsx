import Link from 'next/link';
import type { ConsentType } from '@prisma/client';
import { requireSession } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db/client';
import { withdrawConsentAction } from './actions';

const CONSENT_LABELS: Record<ConsentType, string> = {
  data_processing: 'Data processing',
  marketing: 'Marketing',
  sensitive_data: 'Sensitive data',
  cross_border_transfer: 'Cross-border transfer',
};

function formatDate(date: Date): string {
  return date.toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  });
}

export default async function ConsentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await requireSession();
  const { status, error } = await searchParams;
  const records = await prisma.consentRecord.findMany({
    where: { userId: user.id },
    orderBy: { capturedAt: 'desc' },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/dashboard"
        className="text-label-large text-primary underline-offset-4 hover:underline"
      >
        Back to dashboard
      </Link>
      <h1 className="headline-medium mt-5 text-on-surface">Privacy and consent</h1>
      <p className="body-large mt-3 text-on-surface-variant">
        You can withdraw a consent without deleting your account. EHEMS keeps the consent history
        and records the withdrawal.
      </p>

      {status === 'withdrawn' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Your consent withdrawal has been recorded.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          We could not process that request. Refresh the page and try again.
        </p>
      ) : null}

      <section aria-labelledby="consent-history-heading" className="mt-8 space-y-4">
        <h2 id="consent-history-heading" className="title-large text-on-surface">
          Consent history
        </h2>
        {records.length === 0 ? (
          <p className="body-large text-on-surface-variant">No consent records were found.</p>
        ) : (
          records.map((record) => (
            <article
              key={record.id}
              className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="title-medium text-on-surface">
                    {CONSENT_LABELS[record.consentType]}
                  </h3>
                  <p className="body-medium mt-1 text-on-surface-variant">
                    Version {record.consentVersion} · Recorded {formatDate(record.capturedAt)}
                  </p>
                  <p className="body-medium mt-3 text-on-surface">{record.consentText}</p>
                  {record.withdrawnAt ? (
                    <p className="label-large mt-3 text-on-surface-variant">
                      Withdrawn {formatDate(record.withdrawnAt)}
                    </p>
                  ) : null}
                </div>
                {!record.withdrawnAt ? (
                  <form action={withdrawConsentAction}>
                    <input type="hidden" name="consentId" value={record.id} />
                    <button
                      type="submit"
                      className="border-outline text-label-large text-on-surface hover:bg-surface-container rounded-full border px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Withdraw consent
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
