import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/client';
import { getAttendanceSheet, markAttendance } from '@/lib/attendance';

const suffix = randomBytes(4).toString('hex');
let adminId = '';
let memberId = '';
let programmeId = '';
let secondProgrammeId = '';
let futureOnlyProgrammeId = '';
let enrolmentId = '';
let heldSessionId = '';
let futureSessionId = '';

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: `attendance-admin-${suffix}@example.test`,
      name: 'Attendance Admin',
      passwordHash: 'x',
      roleId: 'role-super-admin',
    },
  });
  const member = await prisma.user.create({
    data: {
      email: `attendance-member-${suffix}@example.test`,
      name: 'Attendance Member',
      passwordHash: 'x',
    },
  });
  // Programme A: one held session and one future session.
  const programme = await prisma.programme.create({
    data: { name: `Attendance Programme A ${suffix}`, attendanceThreshold: 60 },
  });
  const held = await prisma.programmeSession.create({
    data: {
      programmeId: programme.id,
      title: 'Held session',
      startsAt: new Date('2026-09-01T09:00:00Z'),
    },
  });
  const future = await prisma.programmeSession.create({
    data: {
      programmeId: programme.id,
      title: 'Future session',
      startsAt: new Date('2099-09-01T09:00:00Z'),
    },
  });

  // Programme B: three held sessions, so it has a denominator to fail against.
  const secondProgramme = await prisma.programme.create({
    data: { name: `Attendance Programme B ${suffix}`, attendanceThreshold: 60 },
  });
  for (let index = 0; index < 3; index += 1) {
    await prisma.programmeSession.create({
      data: {
        programmeId: secondProgramme.id,
        title: `Held session ${index + 1}`,
        startsAt: new Date(`2026-09-0${index + 2}T09:00:00Z`),
      },
    });
  }

  // Programme C: no held sessions at all, so its percentage must be 0 and it
  // must fail its own gate rather than defaulting to a pass.
  const futureOnlyProgramme = await prisma.programme.create({
    data: { name: `Attendance Programme C ${suffix}`, attendanceThreshold: 60 },
  });
  await prisma.programmeSession.create({
    data: {
      programmeId: futureOnlyProgramme.id,
      title: 'Future only session',
      startsAt: new Date('2099-10-01T09:00:00Z'),
    },
  });

  const enrolment = await prisma.enrolment.create({
    data: {
      userId: member.id,
      tierId: 'tier-basic',
      status: 'active',
      programmes: {
        create: [
          { programmeId: programme.id, attendanceThreshold: 60 },
          { programmeId: secondProgramme.id, attendanceThreshold: 60 },
          { programmeId: futureOnlyProgramme.id, attendanceThreshold: 60 },
        ],
      },
    },
  });

  adminId = admin.id;
  memberId = member.id;
  programmeId = programme.id;
  secondProgrammeId = secondProgramme.id;
  futureOnlyProgrammeId = futureOnlyProgramme.id;
  enrolmentId = enrolment.id;
  heldSessionId = held.id;
  futureSessionId = future.id;
});

afterAll(async () => {
  await prisma.attendanceRecord.deleteMany({ where: { enrolmentId } });
  await prisma.enrolmentProgramme.deleteMany({ where: { enrolmentId } });
  await prisma.enrolment.deleteMany({ where: { id: enrolmentId } });
  await prisma.programmeSession.deleteMany({
    where: { programmeId: { in: [programmeId, secondProgrammeId, futureOnlyProgrammeId] } },
  });
  await prisma.programme.deleteMany({
    where: { id: { in: [programmeId, secondProgrammeId, futureOnlyProgrammeId] } },
  });

  for (const id of [adminId, memberId]) {
    await prisma.user
      .update({
        where: { id },
        data: {
          email: `erased-attendance-${id.slice(-6)}-${suffix}@anonymised.invalid`,
          name: 'Erased user',
          deletedAt: new Date(),
        },
      })
      .catch(() => null);
  }
  await prisma.$disconnect();
});

describe('manual attendance', () => {
  it('shows the session and linked active member in the sheet', async () => {
    const sheet = await getAttendanceSheet(heldSessionId, adminId);
    expect(sheet?.members).toHaveLength(1);
    expect(sheet?.members[0]?.memberName).toBe('Attendance Member');
    expect(sheet?.members[0]?.status).toBeNull();
  });

  it('marks present with method manual and counts only held sessions', async () => {
    const outcome = await markAttendance(adminId, {
      sessionId: heldSessionId,
      enrolmentId,
      status: 'present',
      notes: 'Checked at the door',
    });
    // Pooled figure across all three programmes: 1 of 4 held sessions.
    expect(outcome).toEqual({ ok: true, attendancePercentage: 25 });

    const record = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { enrolmentId_sessionId: { enrolmentId, sessionId: heldSessionId } },
    });
    expect(record.method).toBe('manual');
    expect(record.markedBy).toBe(adminId);
    expect(record.status).toBe('present');
    expect(await prisma.attendanceRecord.count({ where: { enrolmentId } })).toBe(1);
    expect(futureSessionId).not.toBe(heldSessionId);
  });

  it('re-marks the same row and recalculates the cached percentage', async () => {
    const outcome = await markAttendance(adminId, {
      sessionId: heldSessionId,
      enrolmentId,
      status: 'absent',
      notes: 'Updated after review',
    });
    expect(outcome).toEqual({ ok: true, attendancePercentage: 0 });
    expect(await prisma.attendanceRecord.count({ where: { enrolmentId } })).toBe(1);

    const enrolment = await prisma.enrolment.findUniqueOrThrow({ where: { id: enrolmentId } });
    expect(enrolment.attendancePercentage).toBe(0);
    const link = await prisma.enrolmentProgramme.findUniqueOrThrow({
      where: { enrolmentId_programmeId: { enrolmentId, programmeId } },
    });
    expect(link.attendancePercentage).toBe(0);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ATTENDANCE_MARKED', entityId: `${enrolmentId}:${heldSessionId}` },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.actorId).toBe(adminId);
    expect((audit.metadata as { from?: string }).from).toBe('present');
  });
});

describe('attendance is measured per programme', () => {
  it('does not let pooled attendance from one programme clear another', async () => {
    // Programme A: 1 held session marked present -> 100%.
    // Programme B: 3 held sessions, unmarked           -> 0%.
    // Programme C: 0 held sessions                     -> 0%.
    // Pooled: 1/4 = 25%. Per programme, A passes and B and C fail.
    const outcome = await markAttendance(adminId, {
      sessionId: heldSessionId,
      enrolmentId,
      status: 'present',
    });
    expect(outcome).toEqual({ ok: true, attendancePercentage: 25 });

    const links = await prisma.enrolmentProgramme.findMany({
      where: { enrolmentId },
      select: { programmeId: true, attendancePercentage: true },
    });
    const percentageFor = (id: string) =>
      links.find((link) => link.programmeId === id)?.attendancePercentage;

    expect(percentageFor(programmeId)).toBe(100);
    expect(percentageFor(secondProgrammeId)).toBe(0);
    expect(percentageFor(futureOnlyProgrammeId)).toBe(0);
  });

  it('holds a programme with no held sessions at 0%', async () => {
    // Programme C has a session but it has not happened yet, so there is no
    // attendance evidence and it must not read as 100% or as a pass.
    const link = await prisma.enrolmentProgramme.findUniqueOrThrow({
      where: { enrolmentId_programmeId: { enrolmentId, programmeId: futureOnlyProgrammeId } },
    });
    expect(link.attendancePercentage).toBe(0);
  });
});
