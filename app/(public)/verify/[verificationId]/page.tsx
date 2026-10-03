import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { verifyCertificate } from '@/lib/certificates';

/**
 * Public certificate verification.
 *
 * This is the whole reason a certificate carries a `verificationId`: an employer
 * who has never seen EHEMS can confirm a credential from a printout. It is
 * therefore unauthenticated by design, and that shapes two decisions:
 *
 * 1. **The record is intentionally narrow.** Name, certificate, tier, issue date,
 *    issuing body. No email, phone, user id, or enrolment — a public page is the
 *    worst possible place for those. `verifyCertificate` enforces that in `lib/`,
 *    not in this component.
 * 2. **An unknown id and a malformed id render identically.** Saying "that id is
 *    not the right shape" would let someone enumerate the format; saying
 *    "no such certificate" is the whole answer either way.
 */
export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ verificationId: string }>;
}) {
  const { verificationId } = await params;
  const result = await verifyCertificate(decodeURIComponent(verificationId));

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <p className="title-small text-on-surface-variant">EHEMS</p>
      <h1 className="headline-medium mt-2 text-on-surface">Certificate verification</h1>

      {result.found ? (
        <section
          className="mt-8 rounded-2xl border border-outline-variant bg-surface-container p-6"
          aria-labelledby="verified-heading"
        >
          <p className="label-large text-on-surface-variant flex items-center gap-2">
            <span
              aria-hidden="true"
              className="bg-primary text-on-primary inline-flex h-6 w-6 items-center justify-center rounded-full text-body-small"
            >
              ✓
            </span>
            Verified certificate
          </p>

          <h2 id="verified-heading" className="headline-small mt-3 text-on-surface">
            {result.certificateName}
          </h2>

          <dl className="body-large text-on-surface mt-5 grid gap-2">
            <div className="flex flex-wrap gap-2">
              <dt className="text-on-surface-variant">Awarded to:</dt>
              <dd className="text-on-surface">{result.memberName}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-on-surface-variant">Tier:</dt>
              <dd className="text-on-surface">{result.tierName}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-on-surface-variant">Issued:</dt>
              <dd className="text-on-surface">{formatDate(new Date(result.issuedAt))}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-on-surface-variant">Issued by:</dt>
              <dd className="text-on-surface">{result.issuingBody}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-on-surface-variant">Verification ID:</dt>
              <dd className="text-on-surface font-mono">{result.verificationId}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <section
          className="mt-8 rounded-2xl border border-outline-variant bg-surface-container p-6"
          aria-labelledby="not-found-heading"
        >
          <h2 id="not-found-heading" className="headline-small text-on-surface">
            No certificate found
          </h2>
          <p className="body-large text-on-surface-variant mt-3">
            No certificate matches that verification ID. Check it for typing errors — the format is{' '}
            <span className="font-mono">EHEMS-YYYY-XXXXXXXXXX</span>.
          </p>
        </section>
      )}

      <p className="body-medium text-on-surface-variant mt-8">
        <Link href="/" className="text-primary underline-offset-4 hover:underline">
          Back to the EHEMS site
        </Link>
      </p>
    </div>
  );
}
