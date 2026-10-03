import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listMemberCertificates } from '@/lib/certificates';
import { formatDate } from '@/lib/format';

/**
 * A member's own certificates.
 *
 * Scoped to the signed-in user id, so this cannot render another member's
 * credentials. It is a record, not a download: certificate *auto-generation* is
 * out of scope for Phase 1 (AGENTS.md §9), and the catalogue's `templateUrl` is
 * shown as data rather than rendered into a file.
 *
 * No certificate count is printed. The catalogue is missing its 27th approved name
 * (D-5), and a count here would state a completeness the data does not have.
 */
export default async function MemberCertificatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const certificates = await listMemberCertificates(user.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="title-small text-on-surface-variant">Member area</p>
          <h1 className="headline-medium mt-2 text-on-surface">Your certificates</h1>
        </div>
        <Link
          href="/dashboard"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>

      {certificates.length === 0 ? (
        <p className="body-large text-on-surface-variant mt-8">
          You do not hold any certificates yet. Certificates are issued by an EHEMS administrator
          after your enrolment is marked complete — they are never issued automatically.
        </p>
      ) : (
        <ul className="mt-8 grid gap-4">
          {certificates.map((certificate) => (
            <li
              key={`${certificate.certificateId}-${certificate.verificationId}`}
              className="rounded-2xl border border-outline-variant bg-surface-container p-5"
            >
              <h2 className="title-large text-on-surface">{certificate.name}</h2>
              {certificate.description ? (
                <p className="body-medium text-on-surface-variant mt-2">
                  {certificate.description}
                </p>
              ) : null}

              <dl className="body-medium text-on-surface-variant mt-4 grid gap-1 sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-on-surface">Issued:</dt>
                  <dd>{formatDate(new Date(certificate.issuedAt))}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-on-surface">Tier:</dt>
                  <dd>{certificate.tierName}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-on-surface">Issued by:</dt>
                  <dd>{certificate.issuingBody}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-on-surface">Verification ID:</dt>
                  <dd className="font-mono">{certificate.verificationId}</dd>
                </div>
              </dl>

              <p className="body-medium mt-4">
                <Link
                  href={`/verify/${certificate.verificationId}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  View public verification record
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
