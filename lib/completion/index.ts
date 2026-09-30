/**
 * Manual completion gate (BR-008/BR-009).
 *
 * This module never auto-completes an enrolment. It persists the admin's review
 * state, evaluates every condition, and only changes `Enrolment.status` to
 * `completed` when an admin explicitly submits a review with all conditions met.
 *
 * Attendance is read per programme. Every programme linked to the enrolment must
 * independently clear its own snapshotted threshold, so a member cannot satisfy
 * the gate with strong attendance in one programme while short in another.
 */

import { prisma } from '@/lib/db/client';
import type { CompletionReviewInput } from '@/lib/validation/completion';

export type CompletionMissingCondition =
  'verified_payment' | 'attendance' | 'assignments' | 'performance' | 'feedback';

export type CompletionProgrammeAttendance = {
  programmeId: string;
  programmeName: string;
  attendancePercentage: number;
  attendanceThreshold: number;
  met: boolean;
};

export type CompletionReviewOutcome =
  | {
      ok: true;
      completed: boolean;
      /** Pooled enrolment-wide figure. Display only, never the gate. */
      overallAttendancePercentage: number;
      programmes: CompletionProgrammeAttendance[];
      missing: CompletionMissingCondition[];
    }
  | { ok: false; message: string };

export type CompletionCandidate = {
  enrolmentId: string;
  memberName: string;
  memberEmail: string;
  tierName: string;
  status: string;
  overallAttendancePercentage: number;
  programmes: CompletionProgrammeAttendance[];
  performanceSatisfactory: boolean;
  feedbackConsidered: boolean;
  paymentVerified: boolean;
  checklist: Array<{
    id: string;
    requirementName: string;
    isCompleted: boolean;
    notes: string | null;
  }>;
};

function toProgrammeAttendance(input: {
  programmeId: string;
  programmeName: string;
  attendancePercentage: number;
  attendanceThreshold: number;
}): CompletionProgrammeAttendance {
  return { ...input, met: input.attendancePercentage >= input.attendanceThreshold };
}

/**
 * Attendance passes only when the enrolment sits on at least one programme and
 * every one of them clears its own threshold. No programme means no attendance
 * evidence, so it fails rather than defaulting to a pass.
 */
function attendanceMet(programmes: CompletionProgrammeAttendance[]): boolean {
  return programmes.length > 0 && programmes.every((programme) => programme.met);
}

export async function listCompletionCandidates(actorId: string): Promise<CompletionCandidate[]> {
  const enrolments = await prisma.enrolment.findMany({
    where: { status: { in: ['active', 'completed'] } },
    orderBy: { enrolledAt: 'asc' },
    include: {
      user: { select: { name: true, email: true } },
      tier: { select: { name: true } },
      payments: { where: { status: 'verified' }, select: { id: true }, take: 1 },
      programmes: {
        select: { programmeId: true, attendancePercentage: true, attendanceThreshold: true },
      },
      assignmentChecklists: {
        orderBy: { requirementName: 'asc' },
        select: { id: true, requirementName: true, isCompleted: true, notes: true },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'COMPLETION_CANDIDATES_VIEWED',
      entityType: 'Enrolment',
      entityId: 'completion-candidates',
      metadata: { resultCount: enrolments.length },
    },
  });

  return enrolments.map((enrolment) => ({
    enrolmentId: enrolment.id,
    memberName: enrolment.user.name,
    memberEmail: enrolment.user.email,
    tierName: enrolment.tier.name,
    status: enrolment.status,
    overallAttendancePercentage: enrolment.attendancePercentage,
    programmes: enrolment.programmes.map((link) =>
      toProgrammeAttendance({
        programmeId: link.programmeId,
        programmeName: '',
        attendancePercentage: link.attendancePercentage,
        attendanceThreshold: link.attendanceThreshold,
      }),
    ),
    performanceSatisfactory: enrolment.performanceSatisfactory,
    feedbackConsidered: enrolment.feedbackConsidered,
    paymentVerified: enrolment.payments.length > 0,
    checklist: enrolment.assignmentChecklists,
  }));
}

function missingConditions(input: {
  paymentVerified: boolean;
  attendanceSatisfied: boolean;
  checklistComplete: boolean;
  performanceSatisfactory: boolean;
  feedbackConsidered: boolean;
}): CompletionMissingCondition[] {
  const missing: CompletionMissingCondition[] = [];
  if (!input.paymentVerified) missing.push('verified_payment');
  if (!input.attendanceSatisfied) missing.push('attendance');
  if (!input.checklistComplete) missing.push('assignments');
  if (!input.performanceSatisfactory) missing.push('performance');
  if (!input.feedbackConsidered) missing.push('feedback');
  return missing;
}

/** Persist the review and explicitly complete only when the gate is satisfied. */
export async function reviewCompletion(
  actorId: string,
  input: CompletionReviewInput,
): Promise<CompletionReviewOutcome> {
  return prisma.$transaction(async (tx) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: input.enrolmentId },
      include: {
        payments: { where: { status: 'verified' }, select: { id: true }, take: 1 },
        programmes: {
          select: { programmeId: true, attendancePercentage: true, attendanceThreshold: true },
        },
        assignmentChecklists: { select: { id: true, requirementName: true, isCompleted: true } },
      },
    });
    if (!enrolment) return { ok: false as const, message: 'That enrolment does not exist.' };
    if (enrolment.status === 'completed') {
      return {
        ok: false as const,
        message: 'This enrolment is already completed and cannot be reopened.',
      };
    }
    if (enrolment.status !== 'active') {
      return {
        ok: false as const,
        message: 'Only an active enrolment can be reviewed for completion.',
      };
    }

    const checklistIds = new Set(input.checklistIds);
    const invalidChecklistId = input.checklistIds.some(
      (id) => !enrolment.assignmentChecklists.some((checklist) => checklist.id === id),
    );
    if (invalidChecklistId) {
      return { ok: false as const, message: 'That checklist does not belong to this enrolment.' };
    }

    // Requirements the admin records while reviewing. Each one is created with
    // the state the admin actually attested: naming a requirement is not the
    // same as satisfying it, so `complete: false` stays incomplete. Names
    // already on the enrolment are skipped so a re-submitted form does not
    // duplicate rows or double-count the gate.
    const seenRequirementNames = new Set(
      enrolment.assignmentChecklists.map((checklist) => checklist.requirementName.toLowerCase()),
    );
    const createdChecklists: Array<{ id: string; isCompleted: boolean }> = [];
    for (const requirement of input.newRequirements) {
      const nameKey = requirement.name.toLowerCase();
      if (seenRequirementNames.has(nameKey)) continue;
      seenRequirementNames.add(nameKey);
      const created = await tx.assignmentChecklist.create({
        data: {
          enrolmentId: enrolment.id,
          requirementName: requirement.name,
          isCompleted: requirement.complete,
          completedAt: requirement.complete ? new Date() : null,
          markedBy: actorId,
        },
        select: { id: true, isCompleted: true },
      });
      createdChecklists.push(created);
    }
    if (createdChecklists.length > 0) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'COMPLETION_CHECKLIST_REQUIREMENTS_ADDED',
          entityType: 'Enrolment',
          entityId: enrolment.id,
          metadata: { requirementCount: createdChecklists.length },
        },
      });
    }

    for (const checklist of enrolment.assignmentChecklists) {
      const complete = checklistIds.has(checklist.id);
      if (complete !== checklist.isCompleted) {
        await tx.assignmentChecklist.update({
          where: { id: checklist.id },
          data: {
            isCompleted: complete,
            completedAt: complete ? new Date() : null,
            markedBy: actorId,
          },
        });
      }
    }

    const programmes: CompletionProgrammeAttendance[] = enrolment.programmes.map((link) =>
      toProgrammeAttendance({
        programmeId: link.programmeId,
        programmeName: '',
        attendancePercentage: link.attendancePercentage,
        attendanceThreshold: link.attendanceThreshold,
      }),
    );
    // Existing rows count only when the submitted checkbox says so; newly
    // recorded requirements count with the state the admin attested.
    const totalChecklistCount = enrolment.assignmentChecklists.length + createdChecklists.length;
    const completedChecklistCount =
      enrolment.assignmentChecklists.filter((checklist) => checklistIds.has(checklist.id)).length +
      createdChecklists.filter((checklist) => checklist.isCompleted).length;
    const checklistComplete =
      totalChecklistCount > 0 && completedChecklistCount === totalChecklistCount;
    const missing = missingConditions({
      paymentVerified: enrolment.payments.length > 0,
      attendanceSatisfied: attendanceMet(programmes),
      checklistComplete,
      performanceSatisfactory: input.performanceSatisfactory,
      feedbackConsidered: input.feedbackConsidered,
    });

    await tx.enrolment.update({
      where: { id: enrolment.id },
      data: {
        assignmentChecklistCompleted: checklistComplete,
        performanceSatisfactory: input.performanceSatisfactory,
        feedbackConsidered: input.feedbackConsidered,
      },
    });

    if (missing.length > 0) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'COMPLETION_REVIEWED',
          entityType: 'Enrolment',
          entityId: enrolment.id,
          metadata: { completed: false, missing, programmes },
        },
      });
      return {
        ok: true as const,
        completed: false,
        overallAttendancePercentage: enrolment.attendancePercentage,
        programmes,
        missing,
      };
    }

    await tx.enrolment.update({
      where: { id: enrolment.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        completionMarkedBy: actorId,
        certificateEligible: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'COMPLETION_MARKED',
        entityType: 'Enrolment',
        entityId: enrolment.id,
        metadata: {
          from: enrolment.status,
          to: 'completed',
          overallAttendancePercentage: enrolment.attendancePercentage,
          programmes,
          missing: [],
        },
      },
    });

    return {
      ok: true as const,
      completed: true,
      overallAttendancePercentage: enrolment.attendancePercentage,
      programmes,
      missing: [],
    };
  });
}
