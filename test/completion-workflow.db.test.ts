import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/client';
import { reviewCompletion } from '@/lib/completion';

const suffix = randomBytes(4).toString('hex');
let adminId = '';
let memberId = '';
let programmeId = '';
let sessionId = '';
let enrolmentId = '';
let emptyEnrolmentId = '';
let partialEnrolmentId = '';
let pooledEnrolmentId = '';
let secondProgrammeId = '';
let checklistIds: string[] = [];

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: `completion-admin-${suffix}@example.test`,
      name: 'Completion Admin',
      passwordHash: 'x',
      roleId: 'role-super-admin',
    },
  });
  const member = await prisma.user.create({
    data: {
      email: `completion-member-${suffix}@example.test`,
      name: 'Completion Member',
      passwordHash: 'x',
    },
  });
  const programme = await prisma.programme.create({
    data: { name: `Completion Programme ${suffix}`, attendanceThreshold: 60 },
  });
  const session = await prisma.programmeSession.create({
    data: {
      programmeId: programme.id,
      title: 'Completion session',
      startsAt: new Date('2026-09-01T09:00:00Z'),
    },
  });
  const enrolment = await prisma.enrolment.create({
    data: {
      userId: member.id,
      tierId: 'tier-basic',
      status: 'active',
      attendancePercentage: 100,
      // The gate reads the per-programme cache, not the pooled enrolment figure.
      programmes: {
        create: { programmeId: programme.id, attendanceThreshold: 60, attendancePercentage: 100 },
      },
    },
  });
  await prisma.payment.create({
    data: {
      userId: member.id,
      enrolmentId: enrolment.id,
      amountKobo: 30_000_000,
      currency: 'NGN',
      status: 'verified',
      verifiedAt: new Date(),
      verifiedBy: admin.id,
    },
  });
  const checklist = await Promise.all(
    ['Assignments complete', 'Tests/projects complete'].map((requirementName) =>
      prisma.assignmentChecklist.create({ data: { enrolmentId: enrolment.id, requirementName } }),
    ),
  );

  // Two further enrolments for the "no requirements recorded yet" paths. Both
  // are otherwise fully eligible, so the checklist is the only failing gate.
  const extraEnrolments = await Promise.all(
    [0, 1].map(() =>
      prisma.enrolment.create({
        data: {
          userId: member.id,
          tierId: 'tier-basic',
          status: 'active',
          attendancePercentage: 100,
          programmes: {
            create: {
              programmeId: programme.id,
              attendanceThreshold: 60,
              attendancePercentage: 100,
            },
          },
          payments: {
            create: {
              userId: member.id,
              amountKobo: 30_000_000,
              currency: 'NGN',
              status: 'verified',
              verifiedAt: new Date(),
              verifiedBy: admin.id,
            },
          },
        },
        select: { id: true },
      }),
    ),
  );

  // A second programme, linked only by the pooled-attendance test below.
  const secondProgramme = await prisma.programme.create({
    data: { name: `Completion Programme B ${suffix}`, attendanceThreshold: 60 },
  });

  // Fully eligible except that it spans two programmes.
  const pooledEnrolment = await prisma.enrolment.create({
    data: {
      userId: member.id,
      tierId: 'tier-basic',
      status: 'active',
      programmes: {
        create: {
          programmeId: programme.id,
          attendanceThreshold: 60,
          attendancePercentage: 100,
        },
      },
      payments: {
        create: {
          userId: member.id,
          amountKobo: 30_000_000,
          currency: 'NGN',
          status: 'verified',
          verifiedAt: new Date(),
          verifiedBy: admin.id,
        },
      },
    },
    select: { id: true },
  });

  secondProgrammeId = secondProgramme.id;
  pooledEnrolmentId = pooledEnrolment.id;

  adminId = admin.id;
  memberId = member.id;
  programmeId = programme.id;
  sessionId = session.id;
  enrolmentId = enrolment.id;
  emptyEnrolmentId = extraEnrolments[0].id;
  partialEnrolmentId = extraEnrolments[1].id;
  checklistIds = checklist.map((item) => item.id);
});

afterAll(async () => {
  for (const id of [enrolmentId, emptyEnrolmentId, partialEnrolmentId]) {
    await prisma.payment.deleteMany({ where: { enrolmentId: id } });
    await prisma.assignmentChecklist.deleteMany({ where: { enrolmentId: id } });
    await prisma.attendanceRecord.deleteMany({ where: { enrolmentId: id } });
    await prisma.enrolmentProgramme.deleteMany({ where: { enrolmentId: id } });
    await prisma.enrolment.deleteMany({ where: { id } });
  }
  await prisma.programmeSession.deleteMany({ where: { id: sessionId } });
  await prisma.programme.deleteMany({ where: { id: programmeId } });

  for (const id of [adminId, memberId]) {
    await prisma.user
      .update({
        where: { id },
        data: {
          email: `erased-completion-${id.slice(-6)}-${suffix}@anonymised.invalid`,
          name: 'Erased user',
          deletedAt: new Date(),
        },
      })
      .catch(() => null);
  }
  await prisma.$disconnect();
});

describe('manual completion gate', () => {
  it('blocks completion when assignment, performance, and feedback conditions are missing', async () => {
    const result = await reviewCompletion(adminId, {
      enrolmentId,
      performanceSatisfactory: false,
      feedbackConsidered: false,
      checklistIds: [],
      newRequirements: [],
    });

    expect(result).toMatchObject({
      ok: true,
      completed: false,
      missing: ['assignments', 'performance', 'feedback'],
    });
    expect((await prisma.enrolment.findUniqueOrThrow({ where: { id: enrolmentId } })).status).toBe(
      'active',
    );
  });

  it('marks completion only after every BR-008 condition is satisfied', async () => {
    const result = await reviewCompletion(adminId, {
      enrolmentId,
      performanceSatisfactory: true,
      feedbackConsidered: true,
      checklistIds,
      newRequirements: [],
    });

    expect(result).toMatchObject({
      ok: true,
      completed: true,
      missing: [],
    });
    expect(result.ok && result.programmes.every((programme) => programme.met)).toBe(true);
    const enrolment = await prisma.enrolment.findUniqueOrThrow({ where: { id: enrolmentId } });
    expect(enrolment.status).toBe('completed');
    expect(enrolment.certificateEligible).toBe(true);
    expect(enrolment.completionMarkedBy).toBe(adminId);
  });

  it('does not reopen a completed enrolment', async () => {
    const result = await reviewCompletion(adminId, {
      enrolmentId,
      performanceSatisfactory: true,
      feedbackConsidered: true,
      checklistIds,
      newRequirements: [],
    });
    expect(result).toEqual({
      ok: false,
      message: 'This enrolment is already completed and cannot be reopened.',
    });
  });
});

describe('requirements recorded during review', () => {
  it('treats an empty checklist as an unmet gate rather than a vacuous pass', async () => {
    const blocked = await reviewCompletion(adminId, {
      enrolmentId: emptyEnrolmentId,
      performanceSatisfactory: true,
      feedbackConsidered: true,
      checklistIds: [],
      newRequirements: [],
    });
    expect(blocked).toMatchObject({ ok: true, completed: false, missing: ['assignments'] });
    expect(
      (await prisma.enrolment.findUniqueOrThrow({ where: { id: emptyEnrolmentId } })).status,
    ).toBe('active');

    const completed = await reviewCompletion(adminId, {
      enrolmentId: emptyEnrolmentId,
      performanceSatisfactory: true,
      feedbackConsidered: true,
      checklistIds: [],
      newRequirements: [
        { name: 'Capstone report', complete: true },
        { name: 'Business plan', complete: true },
      ],
    });
    expect(completed).toMatchObject({ ok: true, completed: true, missing: [] });
    expect(
      (await prisma.enrolment.findUniqueOrThrow({ where: { id: emptyEnrolmentId } })).status,
    ).toBe('completed');
  });

  it('keeps a requirement incomplete when the admin records it as outstanding', async () => {
    const result = await reviewCompletion(adminId, {
      enrolmentId: partialEnrolmentId,
      performanceSatisfactory: true,
      feedbackConsidered: true,
      checklistIds: [],
      newRequirements: [{ name: 'Capstone report', complete: false }],
    });
    expect(result).toMatchObject({ ok: true, completed: false, missing: ['assignments'] });

    const rows = await prisma.assignmentChecklist.findMany({
      where: { enrolmentId: partialEnrolmentId },
      select: { requirementName: true, isCompleted: true, completedAt: true },
    });
    expect(rows).toEqual([
      { requirementName: 'Capstone report', isCompleted: false, completedAt: null },
    ]);
  });
});

describe('attendance is gated per programme', () => {
  it('blocks completion when one programme is short even when the pooled figure passes', async () => {
    // Pooled 100% would have passed the old single-percentage gate. Programme B
    // is at 0% against its own 60% threshold, so completion must stay blocked.
    await prisma.enrolment.update({
      where: { id: pooledEnrolmentId },
      data: { attendancePercentage: 100 },
    });
    await prisma.enrolmentProgramme.update({
      where: {
        enrolmentId_programmeId: { enrolmentId: pooledEnrolmentId, programmeId },
      },
      data: { attendancePercentage: 100 },
    });
    await prisma.enrolmentProgramme.create({
      data: {
        enrolmentId: pooledEnrolmentId,
        programmeId: secondProgrammeId,
        attendanceThreshold: 60,
        attendancePercentage: 0,
      },
    });

    const result = await reviewCompletion(adminId, {
      enrolmentId: pooledEnrolmentId,
      performanceSatisfactory: true,
      feedbackConsidered: true,
      checklistIds: [],
      newRequirements: [{ name: 'Capstone report', complete: true }],
    });

    expect(result).toMatchObject({ ok: true, completed: false, missing: ['attendance'] });
    expect(
      (await prisma.enrolment.findUniqueOrThrow({ where: { id: pooledEnrolmentId } })).status,
    ).toBe('active');
    expect(result.ok && result.overallAttendancePercentage).toBe(100);
    expect(result.ok && result.programmes.map((p) => p.met)).toEqual([true, false]);
  });
});
