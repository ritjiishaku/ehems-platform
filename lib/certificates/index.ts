/**
 * Manual certificate issuance (BR-010).
 *
 * Three rules define this module, and all three are things an implementation gets
 * wrong by accident:
 *
 * 1. **Issuance is an explicit admin action, never a side effect of completion.**
 *    `reviewCompletion` sets `certificateEligible` and stops. It does not import
 *    this file, and this file is not called from it. A member whose enrolment was
 *    completed a second ago holds *zero* certificates until an admin issues them,
 *    which is the behaviour BR-010 requires and the opposite of what an
 *    auto-generation implementation would do.
 * 2. **A certificate exists only after the enrolment is `completed`.** The check is
 *    on the re-read row inside the transaction, not on an argument, so this cannot
 *    be reached by passing some other id that happens to be eligible.
 * 3. **An issued record is immutable.** There is no update and no revoke in this
 *    file. A member already holding a certificate is *skipped*, not re-issued: the
 *    `verificationId` printed on their certificate must keep resolving to the same
 *    record forever, and silently minting a second one is how a certificate becomes
 *    unfalsifiable.
 *
 * ## The 27th certificate (D-5)
 *
 * The client approved a 27-certificate catalogue but supplied 26 names, so the
 * catalogue is incomplete and **no per-tier counts or completeness claims appear
 * anywhere in this module or its callers**. Issuance works against whatever
 * `TierCertificate` rows exist; the workflow does not need to know how many there
 * are. When the missing name arrives it is a seed change, not a code change.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { sendNotification } from '@/lib/notifications';
import type { IssueCertificatesInput } from '@/lib/validation/certificates';
import {
  isWellFormedVerificationId,
  newVerificationId,
  normaliseVerificationId,
} from './verification-id';

export { isWellFormedVerificationId, normaliseVerificationId };

type Tx = Prisma.TransactionClient;

export type CatalogueEntry = {
  certificateId: string;
  name: string;
  description: string | null;
  alreadyIssued: boolean;
  issuedAt: string | null;
  verificationId: string | null;
};

export type CertificateCandidate = {
  enrolmentId: string;
  memberName: string;
  memberEmail: string;
  tierName: string;
  status: string;
  completedAt: string | null;
  certificateEligible: boolean;
  /** True only when every gate below is satisfied; display hint for the admin UI. */
  eligible: boolean;
  /** Why the enrolment cannot be issued against, when `eligible` is false. */
  blockedBecause: string | null;
  catalogue: CatalogueEntry[];
  pendingCount: number;
};

export type IssuedCertificate = {
  certificateId: string;
  name: string;
  verificationId: string;
  issuedAt: string;
};

export type IssueOutcome =
  | {
      ok: true;
      issued: IssuedCertificate[];
      /** Already held by this member; reported, never rewritten. */
      skipped: Array<{ certificateId: string; name: string; verificationId: string }>;
      /**
       * Selection entries that were not in the enrolment's tier catalogue, or that
       * collapsed into an already-selected name. Surfaced rather than dropped so an
       * admin cannot believe they issued something they did not.
       */
      rejected: Array<{ certificateId: string; reason: string }>;
    }
  | { ok: false; message: string };

/**
 * Collapse a selection to one row per certificate *name*.
 *
 * AGENTS.md §3 requires names duplicated across tiers to be de-duplicated before
 * issuance. Today `CertificateCatalogue.name` is `@unique`, so the tier mapping
 * cannot produce two rows with one name and this is a second line of defence
 * rather than the mechanism — which is the same posture as the retired-tier
 * typing. It is kept because the uniqueness that makes it a no-op is a schema
 * property, not a law: dropping that constraint must not silently start issuing
 * duplicates.
 *
 * First occurrence wins so the surviving row is deterministic. Ties are broken on
 * `certificateId` because the admin's checkbox order is not a meaningful priority.
 */
function dedupeByName(entries: ReadonlyArray<{ certificateId: string; name: string }>): {
  kept: typeof entries;
  duplicates: Array<{ certificateId: string; reason: string }>;
} {
  const byName = new Map<string, (typeof entries)[number]>();
  const kept: (typeof entries)[number][] = [];
  const duplicates: Array<{ certificateId: string; reason: string }> = [];

  for (const entry of [...entries].sort((a, b) =>
    a.certificateId === b.certificateId ? 0 : a.certificateId < b.certificateId ? -1 : 1,
  )) {
    const key = entry.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      duplicates.push({
        certificateId: entry.certificateId,
        reason: `"${entry.name}" is already selected as "${existing.name}".`,
      });
      continue;
    }
    byName.set(key, entry);
    kept.push(entry);
  }

  return { kept, duplicates };
}

/**
 * Completed enrolments that could hold certificates, with their tier catalogue and
 * what has already been issued.
 *
 * Reading this list is audited, matching `listCompletionCandidates` — an admin
 * browsing who-is-issuable is still an admin action on member records.
 */
export async function listCertificateCandidates(actorId: string): Promise<CertificateCandidate[]> {
  const enrolments = await prisma.enrolment.findMany({
    where: { status: { in: ['completed', 'active'] } },
    orderBy: [{ completedAt: 'desc' }, { enrolledAt: 'asc' }],
    include: {
      user: { select: { name: true, email: true } },
      tier: {
        select: {
          name: true,
          certificates: {
            select: { certificate: { select: { id: true, name: true, description: true } } },
          },
        },
      },
      certificates: {
        select: { certificateId: true, issuedAt: true, verificationId: true },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'CERTIFICATE_CANDIDATES_VIEWED',
      entityType: 'Enrolment',
      entityId: 'certificate-candidates',
      metadata: { resultCount: enrolments.length },
    },
  });

  return enrolments.map((enrolment) => {
    const issuedByCertificate = new Map(
      enrolment.certificates.map((certificate) => [certificate.certificateId, certificate]),
    );
    // A member holds one row per catalogue name, so an issued row with the same
    // name must suppress every catalogue entry carrying that name — otherwise a
    // duplicate mapping would offer the admin a certificate they cannot issue.
    const issuedNames = new Set(
      enrolment.tier.certificates
        .map((link) => link.certificate)
        .filter((certificate) => issuedByCertificate.has(certificate.id))
        .map((certificate) => certificate.name.trim().toLowerCase()),
    );

    const catalogue: CatalogueEntry[] = enrolment.tier.certificates
      .map((link) => link.certificate)
      .map((certificate) => {
        const issued = issuedByCertificate.get(certificate.id);
        const suppressedByName = !issued && issuedNames.has(certificate.name.trim().toLowerCase());
        return {
          certificateId: certificate.id,
          name: certificate.name,
          description: certificate.description,
          alreadyIssued: Boolean(issued) || suppressedByName,
          issuedAt: issued ? issued.issuedAt.toISOString() : null,
          verificationId: issued ? issued.verificationId : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const eligible = enrolment.status === 'completed' && enrolment.certificateEligible;
    const blockedBecause = !eligible
      ? enrolment.status !== 'completed'
        ? 'The enrolment is not completed yet. An admin must mark completion first.'
        : 'The enrolment is not marked certificate-eligible.'
      : null;

    return {
      enrolmentId: enrolment.id,
      memberName: enrolment.user.name,
      memberEmail: enrolment.user.email,
      tierName: enrolment.tier.name,
      status: enrolment.status,
      completedAt: enrolment.completedAt ? enrolment.completedAt.toISOString() : null,
      certificateEligible: enrolment.certificateEligible,
      eligible,
      blockedBecause,
      catalogue,
      pendingCount: catalogue.filter((entry) => !entry.alreadyIssued).length,
    };
  });
}

/**
 * Create the `MemberCertificate` rows for one enrolment.
 *
 * Runs in a transaction so a partial issuance is impossible: either the admin's
 * selection lands whole or nothing does. `verificationId` uniqueness is retried
 * rather than assumed — see `verification-id.ts`.
 */
async function createRows(
  tx: Tx,
  enrolmentId: string,
  userId: string,
  actorId: string,
  entries: ReadonlyArray<{ certificateId: string; name: string }>,
): Promise<IssuedCertificate[]> {
  const created: IssuedCertificate[] = [];

  for (const entry of entries) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const verificationId = newVerificationId();
      // The well-formed check is the same assertion that distinguishes "the random
      // generator produced a value I can publish" from "it produced something that
      // will not verify". Cheap, and it fails loudly at write time instead of at
      // the moment a member tries to use their certificate.
      if (!isWellFormedVerificationId(verificationId)) continue;

      try {
        const row = await tx.memberCertificate.create({
          data: {
            userId,
            certificateId: entry.certificateId,
            enrolmentId,
            issuedBy: actorId,
            verificationId,
          },
          select: { verificationId: true, issuedAt: true },
        });
        created.push({
          certificateId: entry.certificateId,
          name: entry.name,
          verificationId: row.verificationId,
          issuedAt: row.issuedAt.toISOString(),
        });
        break;
      } catch (error) {
        // Only the unique-constraint collision is retried. Anything else — a missing
        // catalogue row, a database outage — is a real failure and must surface,
        // because rolling the transaction back is the correct response to it.
        if (!isUniqueViolation(error)) throw error;
      }
    }
  }

  return created;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export async function issueCertificates(
  actorId: string,
  input: IssueCertificatesInput,
): Promise<IssueOutcome> {
  const result = await prisma.$transaction(async (tx) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: input.enrolmentId },
      select: {
        id: true,
        userId: true,
        status: true,
        certificateEligible: true,
        user: { select: { name: true, email: true } },
        tier: { select: { name: true, certificates: { select: { certificateId: true } } } },
        certificates: {
          select: {
            certificateId: true,
            verificationId: true,
            certificate: { select: { name: true } },
          },
        },
      },
    });

    if (!enrolment) return { ok: false as const, message: 'That enrolment does not exist.' };

    // BR-010. Re-read inside the transaction, so this cannot be reached with an id
    // that is eligible by some other route.
    if (enrolment.status !== 'completed') {
      return {
        ok: false as const,
        message: 'Certificates are issued only after an admin marks the enrolment completed.',
      };
    }
    if (!enrolment.certificateEligible) {
      return {
        ok: false as const,
        message: 'This enrolment is not marked certificate-eligible.',
      };
    }

    const requestedIds = [...new Set(input.certificateIds)];
    const catalogueIds = new Set(enrolment.tier.certificates.map((link) => link.certificateId));

    // A selection outside the enrolment's own tier is a bug or a crafted request, and
    // it is refused rather than issued: tier mapping is what entitles a member to a
    // certificate, so honouring an id that bypasses it would make the mapping
    // decorative.
    const outOfCatalogue = requestedIds.filter((id) => !catalogueIds.has(id));
    const inCatalogue = requestedIds.filter((id) => catalogueIds.has(id));

    if (inCatalogue.length === 0) {
      return {
        ok: false as const,
        message:
          outOfCatalogue.length > 0
            ? 'None of the selected certificates belong to this member\u2019s tier.'
            : 'Select at least one certificate to issue.',
      };
    }

    const catalogueRows = await tx.certificateCatalogue.findMany({
      where: { id: { in: inCatalogue } },
      select: { id: true, name: true, active: true },
    });
    const rowsById = new Map(catalogueRows.map((row) => [row.id, row]));

    const rejected: Array<{ certificateId: string; reason: string }> = [
      ...outOfCatalogue.map((certificateId) => ({
        certificateId,
        reason: 'This certificate is not in the member\u2019s tier catalogue.',
      })),
      // A deactivated catalogue entry is retained for the audit trail but is no
      // longer issuable; issuing it would put a withdrawn credential in a member's
      // hands.
      ...inCatalogue
        .filter((id) => rowsById.get(id)?.active === false)
        .map((certificateId) => ({
          certificateId,
          reason: 'This certificate is deactivated in the catalogue.',
        })),
    ];

    const eligibleIds = new Set(inCatalogue.filter((id) => rowsById.get(id)?.active !== false));
    const named = inCatalogue
      .filter((id) => eligibleIds.has(id))
      .map((id) => ({ certificateId: id, name: rowsById.get(id)!.name }));

    const { kept, duplicates } = dedupeByName(named);

    // Immutability: a member who already holds a certificate keeps the one they
    // have. Reported as skipped so the admin sees a complete accounting of what
    // their selection did, but never written a second time.
    const heldIds = new Set(enrolment.certificates.map((certificate) => certificate.certificateId));
    const toIssue = kept.filter((entry) => !heldIds.has(entry.certificateId));
    const skipped = enrolment.certificates
      .filter((certificate) => eligibleIds.has(certificate.certificateId))
      .map((certificate) => ({
        certificateId: certificate.certificateId,
        name: certificate.certificate.name,
        verificationId: certificate.verificationId,
      }));

    const allRejected = [...rejected, ...duplicates];

    if (toIssue.length === 0) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'CERTIFICATE_ISSUANCE_DECLINED',
          entityType: 'Enrolment',
          entityId: enrolment.id,
          metadata: { reason: 'nothing_issuable', rejected: allRejected, skipped },
        },
      });
      return {
        ok: true as const,
        issued: [],
        skipped,
        rejected: allRejected,
        recipient: null,
        tierName: null,
      };
    }

    const issued = await createRows(tx, enrolment.id, enrolment.userId, actorId, toIssue);

    if (issued.length !== toIssue.length) {
      // Exhausted the collision retries. Throwing rolls the whole batch back rather
      // than issuing a partial set, which would leave the member with some of what
      // the admin asked for and no record of the rest.
      throw new Error(`Could not allocate unique verification ids for enrolment ${enrolment.id}`);
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'CERTIFICATE_ISSUED',
        entityType: 'Enrolment',
        entityId: enrolment.id,
        metadata: {
          memberId: enrolment.userId,
          tierName: enrolment.tier.name,
          issued: issued.map((certificate) => ({
            certificateId: certificate.certificateId,
            name: certificate.name,
            verificationId: certificate.verificationId,
          })),
          skipped,
          rejected: allRejected,
        },
      },
    });

    return {
      ok: true as const,
      issued,
      skipped,
      rejected: allRejected,
      recipient: {
        userId: enrolment.userId,
        email: enrolment.user.email,
        name: enrolment.user.name,
      },
      tierName: enrolment.tier.name,
    };
  });

  if (!result.ok) return result;

  // After the commit. A mail provider outage must not un-issue a certificate the
  // admin legitimately granted.
  if (result.issued.length > 0 && result.recipient && result.tierName) {
    await sendNotification({
      event: 'CERTIFICATE_ISSUED',
      recipient: result.recipient,
      payload: {
        name: result.recipient.name,
        tierName: result.tierName,
        certificateId: result.issued[0].certificateId,
        verificationUrl: verificationUrlFor(result.issued[0].verificationId),
      },
    }).catch(() => null);
  }

  return {
    ok: true,
    issued: result.issued,
    skipped: result.skipped,
    rejected: result.rejected,
  };
}

/**
 * The public verification URL printed on a certificate.
 *
 * Derived from the deployment origin rather than a setting, because there is no
 * `NEXT_PUBLIC_SITE_URL` and AGENTS.md §2 forbids putting a secret in one — a
 * site URL is not a secret, but introducing the variable here would set the
 * precedent for secrets arriving in the client bundle later.
 */
function verificationUrlFor(verificationId: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'http://localhost:3000';
  return `${origin.replace(/\/+$/, '')}/verify/${verificationId}`;
}

export type MemberCertificateView = {
  certificateId: string;
  name: string;
  description: string | null;
  issuedAt: string;
  verificationId: string;
  tierName: string;
  issuingBody: string;
  /** Template is data, not a rendered file; Phase 1 does not auto-generate (AGENTS.md §9). */
  templateUrl: string | null;
};

/** A member's own certificates. Scoped by user id, so it cannot leak another's. */
export async function listMemberCertificates(userId: string): Promise<MemberCertificateView[]> {
  const certificates = await prisma.memberCertificate.findMany({
    where: { userId },
    orderBy: { issuedAt: 'desc' },
    select: {
      certificateId: true,
      issuedAt: true,
      verificationId: true,
      certificate: {
        select: {
          name: true,
          description: true,
          templateUrl: true,
          issuingBody: true,
        },
      },
      enrolment: { select: { tier: { select: { name: true } } } },
    },
  });

  return certificates.map((row) => ({
    certificateId: row.certificateId,
    name: row.certificate.name,
    description: row.certificate.description,
    issuedAt: row.issuedAt.toISOString(),
    verificationId: row.verificationId,
    tierName: row.enrolment.tier.name,
    issuingBody: row.certificate.issuingBody,
    templateUrl: row.certificate.templateUrl,
  }));
}

export type PublicVerificationResult =
  | {
      found: true;
      certificateName: string;
      issuingBody: string;
      memberName: string;
      tierName: string;
      issuedAt: string;
      verificationId: string;
    }
  | { found: false };

/**
 * Resolve a public `verificationId`.
 *
 * Deliberately narrow. A certificate is a credential for a named person, so this
 * returns the holder's name and nothing else — no email, no phone, no user id, no
 * enrolment. Broadening it later is a decision to make deliberately rather than an
 * oversight to inherit.
 */
export async function verifyCertificate(
  rawVerificationId: string,
): Promise<PublicVerificationResult> {
  if (!isWellFormedVerificationId(rawVerificationId)) return { found: false };

  const row = await prisma.memberCertificate.findUnique({
    where: { verificationId: normaliseVerificationId(rawVerificationId) },
    select: {
      verificationId: true,
      issuedAt: true,
      certificate: { select: { name: true, issuingBody: true } },
      user: { select: { name: true } },
      enrolment: { select: { tier: { select: { name: true } } } },
    },
  });

  if (!row) return { found: false };

  return {
    found: true,
    certificateName: row.certificate.name,
    issuingBody: row.certificate.issuingBody,
    memberName: row.user.name,
    tierName: row.enrolment.tier.name,
    issuedAt: row.issuedAt.toISOString(),
    verificationId: row.verificationId,
  };
}
