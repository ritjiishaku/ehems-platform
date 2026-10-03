import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';
import { listCertificateCandidates } from '@/lib/certificates';
import { formatDate } from '@/lib/format';
import { hasPermission } from '@/lib/permissions';
import { issueCertificatesAction } from './actions';

/**
 * Manual certificate issuance (BR-010).
 *
 * Nothing on this screen runs automatically. Marking an enrolment completed makes
 * a member *eligible*; it issues nothing. This page is the only place a
 * `MemberCertificate` row can be created in Phase 1.
 *
 * There is deliberately **no certificate count** anywhere on this screen. The
 * client approved a 27-certificate catalogue and supplied 26 names (D-5), so a
 * per-tier count would publish an incompleteness as a fact. The page shows the
 * catalogue it was given, which is honest about what is known.
 */
export default async function AdminCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    count?: string;
    skipped?: string;
    rejected?: string;
    error?: string;
  }>;
}) {
  const admin = await requireRole('admin', 'super_admin');
  const [query, candidates] = await Promise.all([
    searchParams,
    listCertificateCandidates(admin.id),
  ]);
  const canIssue = hasPermission(admin, 'certificate.issue');

  const issued = candidates.filter((candidate) => candidate.status === 'completed');
  const awaitingCompletion = candidates.filter((candidate) => candidate.status !== 'completed');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Certificate issuance</h1>
          <p className="body-large text-on-surface-variant mt-3">
            Issuing a certificate is a separate, explicit admin action. Completing an enrolment
            makes a member eligible; it never issues a certificate by itself.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to admin
        </Link>
      </div>

      {query.status === 'issued' ? (
        <div
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          <p>
            Issued {query.count ?? '0'} certificate{query.count === '1' ? '' : 's'}.
          </p>
          {query.skipped ? (
            <p className="body-medium mt-2">
              {query.skipped} already held by this member and left untouched — issued certificates
              are immutable.
            </p>
          ) : null}
          {query.rejected ? (
            <p className="body-medium mt-2">
              {query.rejected} selection{query.rejected === '1' ? ' was' : 's were'} refused. Reload
              the catalogue below for the reason.
            </p>
          ) : null}
        </div>
      ) : null}

      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {query.error === 'invalid-input'
            ? 'Select at least one certificate before issuing.'
            : query.error}
        </p>
      ) : null}

      <h2 className="headline-small text-on-surface mt-10">Eligible members ({issued.length})</h2>

      {issued.length === 0 ? (
        <p className="body-large text-on-surface-variant mt-4">
          No completed enrolments are waiting for certificates. Mark an enrolment complete under
          Completion first.
        </p>
      ) : null}

      <div className="mt-4 grid gap-4">
        {issued.map((candidate) => (
          <article
            key={candidate.enrolmentId}
            className="rounded-2xl border border-outline-variant bg-surface-container p-5"
          >
            <h3 className="title-large text-on-surface">
              {candidate.memberName}{' '}
              <span className="text-on-surface-variant">— {candidate.tierName}</span>
            </h3>
            <p className="body-medium text-on-surface-variant mt-1">
              {candidate.memberEmail}
              {candidate.completedAt
                ? ` · completed ${formatDate(new Date(candidate.completedAt))}`
                : null}
            </p>

            {!candidate.eligible ? (
              <p className="body-medium text-error mt-4">{candidate.blockedBecause}</p>
            ) : null}

            {candidate.pendingCount === 0 ? (
              <p className="body-large text-on-surface-variant mt-4">
                This member holds every certificate in their tier catalogue.
              </p>
            ) : (
              <form action={issueCertificatesAction} className="mt-4">
                <input type="hidden" name="enrolmentId" value={candidate.enrolmentId} />
                <fieldset disabled={!canIssue || !candidate.eligible}>
                  <legend className="label-large text-on-surface">
                    Issue certificates ({candidate.pendingCount} available)
                  </legend>

                  <ul className="mt-3 grid gap-2">
                    {candidate.catalogue.map((entry) => (
                      <li key={entry.certificateId} className="body-medium">
                        <label
                          className={`flex items-start gap-3 rounded-xl px-3 py-2 ${
                            entry.alreadyIssued
                              ? 'text-on-surface-variant'
                              : 'text-on-surface hover:bg-surface-container-high'
                          }`}
                        >
                          <input
                            type="checkbox"
                            name="certificateIds"
                            value={entry.certificateId}
                            disabled={entry.alreadyIssued}
                            className="mt-1 h-5 w-5 accent-primary"
                          />
                          <span>
                            <span className="label-large">{entry.name}</span>
                            {entry.alreadyIssued ? (
                              <span className="body-small text-on-surface-variant block">
                                Issued {entry.issuedAt ? formatDate(new Date(entry.issuedAt)) : ''}{' '}
                                · {entry.verificationId}
                              </span>
                            ) : entry.description ? (
                              <span className="body-small text-on-surface-variant block">
                                {entry.description}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="submit"
                    className="mt-4 inline-flex items-center rounded-full bg-primary px-5 py-2 text-label-large text-on-primary disabled:opacity-50"
                  >
                    Issue selected certificates
                  </button>
                </fieldset>
              </form>
            )}
          </article>
        ))}
      </div>

      {awaitingCompletion.length > 0 ? (
        <>
          <h2 className="headline-small text-on-surface mt-10">
            Not yet completed ({awaitingCompletion.length})
          </h2>
          <p className="body-large text-on-surface-variant mt-2">
            These members cannot receive certificates until an admin marks completion. They are
            listed so the gap is visible rather than inferred.
          </p>
          <ul className="mt-4 grid gap-2">
            {awaitingCompletion.map((candidate) => (
              <li
                key={candidate.enrolmentId}
                className="body-medium text-on-surface-variant rounded-xl bg-surface-container-low px-4 py-3"
              >
                {candidate.memberName} — {candidate.tierName}:{' '}
                {candidate.blockedBecause ?? 'not completed'}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
