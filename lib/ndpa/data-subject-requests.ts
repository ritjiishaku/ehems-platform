import { prisma } from '@/lib/db/client';
import { DSR_TERMINAL_STATUSES, validateTransition, type DsrTransitionResult } from './dsr-state';
import type { DataSubjectRequestStatus, DataSubjectRequestType } from './types';

const DSR_RETENTION_CATEGORY = 'data_subject_request';

/** Pseudo entity id for the queue-level audit entry written on every admin read. */
const DSR_QUEUE_ENTITY_ID = 'queue';

export async function submitDataSubjectRequest(
  userId: string,
  requestType: DataSubjectRequestType,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const retentionPolicy = await tx.retentionPolicy.findUnique({
      where: { category: DSR_RETENTION_CATEGORY },
    });
    if (!retentionPolicy) {
      throw new Error('Data-subject request retention policy is not configured');
    }

    const request = await tx.dataSubjectRequest.create({
      data: { userId, requestType, status: 'pending' },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'DATA_SUBJECT_REQUEST_SUBMITTED',
        entityType: 'DataSubjectRequest',
        entityId: request.id,
        metadata: { requestType },
      },
    });
    return request.id;
  });
}

export type AdminDataSubjectRequest = {
  id: string;
  requestType: string;
  status: string;
  handlingNotes: string | null;
  handledBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  memberName: string;
  memberEmail: string;
  handlerName: string | null;
};

/**
 * The admin queue of data subject requests, oldest first.
 *
 * Staff access to a member's record is itself an auditable event (SEC-015, and
 * the ndpa-compliance skill's "including reads" rule), so listing writes one
 * `DATA_SUBJECT_REQUESTS_VIEWED` entry per page load rather than one per row —
 * a per-row entry would bury the audit trail in list traffic.
 */
export async function listDataSubjectRequestsForAdmin(
  actorId: string,
): Promise<AdminDataSubjectRequest[]> {
  return prisma.$transaction(async (tx) => {
    const requests = await tx.dataSubjectRequest.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { name: true, email: true } },
        handledByUser: { select: { name: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'DATA_SUBJECT_REQUESTS_VIEWED',
        entityType: 'DataSubjectRequest',
        // `entity_id` is NOT NULL, so the read is attributed to a stable
        // pseudo-entity rather than being left unindexed.
        entityId: DSR_QUEUE_ENTITY_ID,
        metadata: { resultCount: requests.length },
      },
    });

    return requests.map((request) => ({
      id: request.id,
      requestType: request.requestType,
      status: request.status,
      handlingNotes: request.handlingNotes,
      handledBy: request.handledBy,
      resolvedAt: request.resolvedAt,
      createdAt: request.createdAt,
      memberName: request.user.name,
      memberEmail: request.user.email,
      handlerName: request.handledByUser?.name ?? null,
    }));
  });
}

export type TransitionInput = {
  requestId: string;
  actorId: string;
  to: string;
  notes: string | null;
};

export type TransitionOutcome =
  | { ok: true; from: DataSubjectRequestStatus; to: DataSubjectRequestStatus }
  | { ok: false; message: string };

/**
 * Move a request to a new status and record who did it.
 *
 * The transition rules live in `./dsr-state`; this function only applies them
 * and writes the audit entry. Every path that changes a request's status goes
 * through here, so `handled_by` and the audit trail cannot drift apart.
 */
export async function transitionDataSubjectRequest(
  input: TransitionInput,
): Promise<TransitionOutcome> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.dataSubjectRequest.findUnique({ where: { id: input.requestId } });
    if (!request) {
      return { ok: false, message: 'That request no longer exists.' };
    }

    const verdict: DsrTransitionResult = validateTransition(request.status, input.to, input.notes);
    if (!verdict.ok) {
      return { ok: false, message: verdict.message };
    }

    const to = input.to as DataSubjectRequestStatus;
    const from = request.status as DataSubjectRequestStatus;
    const terminal = DSR_TERMINAL_STATUSES.includes(to);

    // Conditional on the status we just read. Two admins acting on the same
    // request at once would otherwise both pass `validateTransition` and both
    // write, so a `rejected` and a `completed` could both be recorded. Matching
    // the status we decided against makes the second writer a no-op instead.
    const claimed = await tx.dataSubjectRequest.updateMany({
      where: { id: request.id, status: from },
      data: {
        status: to,
        // Notes accumulate rather than overwrite, so a progress note written on
        // the way to in_progress is not lost when the request is closed.
        handlingNotes: input.notes?.trim()
          ? [request.handlingNotes, input.notes.trim()].filter(Boolean).join('\n\n')
          : request.handlingNotes,
        handledBy: input.actorId,
        resolvedAt: terminal ? new Date() : request.resolvedAt,
      },
    });
    if (claimed.count !== 1) {
      return {
        ok: false,
        message: 'Someone else updated this request a moment ago. Reload and try again.',
      };
    }

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: 'DATA_SUBJECT_REQUEST_STATUS_CHANGED',
        entityType: 'DataSubjectRequest',
        entityId: request.id,
        metadata: {
          from,
          to,
          requestType: request.requestType,
          memberId: request.userId,
        },
      },
    });

    return { ok: true, from, to };
  });
}
