/**
 * Phase 1 manual attendance domain.
 *
 * The database row is not the percentage truth. Every mark upserts one
 * `(enrolment, session)` decision, then recomputes the cached percentage from
 * held programme sessions and their records in the same transaction.
 *
 * Attendance is measured **per programme** (PRD §12.3): each `EnrolmentProgramme`
 * caches its own percentage against its own sessions and its own snapshotted
 * threshold. `Enrolment.attendancePercentage` remains only as a pooled
 * enrolment-wide figure for member-facing display. A member on two programmes
 * cannot use strong attendance in one to clear the threshold in the other, and
 * `lib/completion` reads the per-programme numbers for exactly that reason.
 */

import { prisma } from '@/lib/db/client';
import { isAttendanceStatus, type AttendanceStatus } from '@/lib/validation/attendance';

export const ATTENDED_STATUSES: readonly AttendanceStatus[] = ['present', 'late'];

export type AttendanceSession = {
  id: string;
  title: string;
  startsAt: Date;
  programmeId: string;
  programmeName: string;
  attendanceThreshold: number;
};

export type AttendanceSheet = AttendanceSession & {
  members: Array<{
    enrolmentId: string;
    memberName: string;
    memberEmail: string;
    tierName: string;
    status: AttendanceStatus | null;
    notes: string | null;
    /** This programme's own percentage, not the pooled enrolment figure. */
    attendancePercentage: number;
  }>;
};

export type AttendanceOutcome =
  { ok: true; attendancePercentage: number } | { ok: false; message: string };

export async function listAttendanceSessions(actorId: string): Promise<AttendanceSession[]> {
  const sessions = await prisma.programmeSession.findMany({
    orderBy: { startsAt: 'desc' },
    include: {
      programme: { select: { id: true, name: true, attendanceThreshold: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'ATTENDANCE_SESSIONS_VIEWED',
      entityType: 'ProgrammeSession',
      entityId: 'attendance-sessions',
      metadata: { resultCount: sessions.length },
    },
  });

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    startsAt: session.startsAt,
    programmeId: session.programme.id,
    programmeName: session.programme.name,
    attendanceThreshold: session.programme.attendanceThreshold,
  }));
}

export async function getAttendanceSheet(
  sessionId: string,
  actorId: string,
): Promise<AttendanceSheet | null> {
  // The nested `where` cannot filter on `session.programmeId` because that would
  // make the query reference its own initializer; all links come back and the one
  // for this programme is picked in the map below.
  const session = await prisma.programmeSession.findUnique({
    where: { id: sessionId },
    include: {
      programme: {
        include: {
          enrolments: {
            where: { enrolment: { status: { in: ['active', 'completed'] } } },
            include: {
              enrolment: {
                include: {
                  user: { select: { name: true, email: true } },
                  tier: { select: { name: true } },
                  attendanceRecords: {
                    where: { sessionId },
                    select: { status: true, notes: true },
                  },
                  programmes: { select: { programmeId: true, attendancePercentage: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session) return null;

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'ATTENDANCE_SHEET_VIEWED',
      entityType: 'ProgrammeSession',
      entityId: session.id,
      metadata: {
        programmeId: session.programme.id,
        memberCount: session.programme.enrolments.length,
      },
    },
  });

  return {
    id: session.id,
    title: session.title,
    startsAt: session.startsAt,
    programmeId: session.programme.id,
    programmeName: session.programme.name,
    attendanceThreshold: session.programme.attendanceThreshold,
    members: session.programme.enrolments.map(({ enrolment }) => ({
      enrolmentId: enrolment.id,
      memberName: enrolment.user.name,
      memberEmail: enrolment.user.email,
      tierName: enrolment.tier.name,
      status:
        enrolment.attendanceRecords[0] && isAttendanceStatus(enrolment.attendanceRecords[0].status)
          ? enrolment.attendanceRecords[0].status
          : null,
      notes: enrolment.attendanceRecords[0]?.notes ?? null,
      attendancePercentage:
        enrolment.programmes.find((link) => link.programmeId === session.programme.id)
          ?.attendancePercentage ?? 0,
    })),
  };
}

export type ProgrammeAttendance = {
  programmeId: string;
  programmeName: string;
  attendancePercentage: number;
  attendanceThreshold: number;
};

export type AttendanceBreakdown = {
  /** Per-programme percentages, each measured against that programme's own sessions. */
  byProgramme: ProgrammeAttendance[];
  /**
   * Enrolment-wide average across all held sessions. Kept on `Enrolment` for the
   * member-facing summary only. It is NOT a completion signal: pooling sessions
   * across programmes is exactly what PRD §12.3 forbids.
   */
  overallPercentage: number;
};

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Recompute attendance per programme and cache it, plus the enrolment-wide
 * average used for display.
 */
async function recomputeAttendance(
  tx: Tx,
  enrolmentId: string,
  now = new Date(),
): Promise<AttendanceBreakdown> {
  const enrolment = await tx.enrolment.findUnique({
    where: { id: enrolmentId },
    include: { programmes: { include: { programme: { include: { sessions: true } } } } },
  });
  if (!enrolment) return { byProgramme: [], overallPercentage: 0 };

  const heldSessionIdsByProgramme = enrolment.programmes.map((link) => ({
    link,
    heldSessionIds: link.programme.sessions
      .filter((session) => session.startsAt <= now)
      .map((session) => session.id),
  }));

  const records = await tx.attendanceRecord.findMany({
    where: {
      enrolmentId,
      sessionId: {
        in: heldSessionIdsByProgramme.flatMap((entry) => entry.heldSessionIds),
      },
    },
    select: { sessionId: true, status: true },
  });
  const attendedSessionIds = new Set(
    records
      .filter((record) => ATTENDED_STATUSES.includes(record.status as AttendanceStatus))
      .map((record) => record.sessionId),
  );

  const byProgramme: ProgrammeAttendance[] = [];
  let overallHeld = 0;
  let overallAttended = 0;

  for (const { link, heldSessionIds } of heldSessionIdsByProgramme) {
    const attended = heldSessionIds.filter((id) => attendedSessionIds.has(id)).length;
    const percentage =
      heldSessionIds.length === 0 ? 0 : Math.round((attended / heldSessionIds.length) * 100);

    if (link.attendancePercentage !== percentage) {
      await tx.enrolmentProgramme.update({
        where: { enrolmentId_programmeId: { enrolmentId, programmeId: link.programmeId } },
        data: { attendancePercentage: percentage },
      });
    }
    byProgramme.push({
      programmeId: link.programmeId,
      programmeName: link.programme.name,
      attendancePercentage: percentage,
      attendanceThreshold: link.attendanceThreshold,
    });
    overallHeld += heldSessionIds.length;
    overallAttended += attended;
  }

  const overallPercentage =
    overallHeld === 0 ? 0 : Math.round((overallAttended / overallHeld) * 100);
  await tx.enrolment.update({
    where: { id: enrolmentId },
    data: { attendancePercentage: overallPercentage },
  });

  return { byProgramme, overallPercentage };
}

/** Mark one member for one session; Phase 1 always writes `method = manual`. */
export async function markAttendance(
  actorId: string,
  input: { sessionId: string; enrolmentId: string; status: AttendanceStatus; notes?: string },
): Promise<AttendanceOutcome> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.programmeSession.findUnique({
      where: { id: input.sessionId },
      include: { programme: { select: { id: true } } },
    });
    if (!session) return { ok: false as const, message: 'That session does not exist.' };
    if (session.startsAt > new Date()) {
      return {
        ok: false as const,
        message: 'Attendance cannot be marked before the session starts.',
      };
    }

    const enrolment = await tx.enrolment.findFirst({
      where: {
        id: input.enrolmentId,
        status: { in: ['active', 'completed'] },
        programmes: { some: { programmeId: session.programme.id } },
      },
      include: { user: { select: { id: true } } },
    });
    if (!enrolment) {
      return { ok: false as const, message: 'That member is not enrolled on this programme.' };
    }

    const previous = await tx.attendanceRecord.findUnique({
      where: {
        enrolmentId_sessionId: { enrolmentId: input.enrolmentId, sessionId: input.sessionId },
      },
      select: { status: true },
    });

    await tx.attendanceRecord.upsert({
      where: {
        enrolmentId_sessionId: { enrolmentId: input.enrolmentId, sessionId: input.sessionId },
      },
      create: {
        userId: enrolment.user.id,
        sessionId: input.sessionId,
        enrolmentId: input.enrolmentId,
        status: input.status,
        method: 'manual',
        markedBy: actorId,
        notes: input.notes?.trim() || null,
      },
      update: {
        status: input.status,
        method: 'manual',
        markedBy: actorId,
        markedAt: new Date(),
        notes: input.notes?.trim() || null,
      },
    });

    const breakdown = await recomputeAttendance(tx, input.enrolmentId);
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'ATTENDANCE_MARKED',
        entityType: 'AttendanceRecord',
        entityId: `${input.enrolmentId}:${input.sessionId}`,
        metadata: {
          enrolmentId: input.enrolmentId,
          sessionId: input.sessionId,
          from: previous?.status ?? null,
          to: input.status,
          method: 'manual',
          overallAttendancePercentage: breakdown.overallPercentage,
          programmeAttendance: breakdown.byProgramme,
        },
      },
    });

    return { ok: true as const, attendancePercentage: breakdown.overallPercentage };
  });
}
