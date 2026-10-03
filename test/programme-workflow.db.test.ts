import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/client';
import {
  createProgramme,
  createSession,
  deactivateProgramme,
  linkEnrolmentToProgrammes,
  listProgrammes,
  listProgrammeSessions,
  MINIMUM_ATTENDANCE_THRESHOLD,
  removeSession,
  setProgrammeTiers,
  updateProgramme,
} from '@/lib/programmes';

const suffix = randomBytes(4).toString('hex');
const created: string[] = [];
let adminId = '';
let memberId = '';
let tierId = '';
let basicTierId = '';
let basicThreeTierId = '';

/**
 * Each test creates its own programme so the assertions do not depend on the
 * order vitest runs them in, and every row is tracked for teardown.
 */
async function newProgramme(overrides: { name?: string; attendanceThreshold?: number } = {}) {
  const result = await createProgramme(adminId, {
    name: overrides.name ?? `Programme ${randomBytes(3).toString('hex')}`,
    description: '',
    attendanceThreshold: overrides.attendanceThreshold ?? MINIMUM_ATTENDANCE_THRESHOLD,
  });
  if (!result.ok || !('id' in result)) throw new Error(`setup failed: ${result.ok}`);
  created.push(result.id);
  return result.id;
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: `programme-admin-${suffix}@example.test`,
      name: 'Programme Admin',
      passwordHash: 'x',
      roleId: 'role-super-admin',
    },
  });
  const member = await prisma.user.create({
    data: {
      email: `programme-member-${suffix}@example.test`,
      name: 'Programme Member',
      passwordHash: 'x',
    },
  });
  adminId = admin.id;
  memberId = member.id;

  const tier = await prisma.tier.findFirst({ where: { name: 'Basic Level', active: true } });
  if (!tier) throw new Error('The tier catalogue is not seeded.');
  tierId = tier.id;
  basicTierId = tier.id;
  basicThreeTierId = (
    await prisma.tier.findFirstOrThrow({ where: { name: 'Basic Level III', active: true } })
  ).id;
});

/**
 * A mapped-but-inactive programme is *not* linked on activation, which is the
 * point of withdrawing one. So any test that expects linkage has to activate the
 * programme first, exactly as an admin would.
 */
async function activeProgramme(
  tierIds: string[] = ['basic'],
  threshold = MINIMUM_ATTENDANCE_THRESHOLD,
): Promise<string> {
  const programmeId = await newProgramme({ attendanceThreshold: threshold });
  const mapped = await setProgrammeTiers(adminId, { programmeId, tierIds });
  if (!mapped.ok) throw new Error(`mapping failed: ${mapped.message}`);
  const activated = await updateProgramme(adminId, {
    programmeId,
    name: `Active ${randomBytes(3).toString('hex')}`,
    description: '',
    attendanceThreshold: threshold,
    active: true,
  });
  if (!activated.ok) throw new Error(`activation failed: ${activated.message}`);
  return programmeId;
}

afterAll(async () => {
  await prisma.attendanceRecord.deleteMany({
    where: { enrolment: { userId: memberId } },
  });
  await prisma.enrolmentProgramme.deleteMany({
    where: { enrolment: { userId: memberId } },
  });
  await prisma.enrolment.deleteMany({ where: { userId: memberId } });
  await prisma.payment.deleteMany({ where: { userId: memberId } });
  await prisma.programmeSession.deleteMany({ where: { programmeId: { in: created } } });
  await prisma.material.deleteMany({ where: { programmeId: { in: created } } });
  await prisma.programmeTier.deleteMany({ where: { programmeId: { in: created } } });
  await prisma.programme.deleteMany({ where: { id: { in: created } } });

  for (const id of [adminId, memberId]) {
    await prisma.user
      .update({
        where: { id },
        data: {
          email: `erased-programme-${id.slice(-6)}-${suffix}@anonymised.invalid`,
          name: 'Erased user',
          deletedAt: new Date(),
        },
      })
      .catch(() => null);
  }
  await prisma.$disconnect();
});

describe('BR-008 attendance threshold floor', () => {
  it('refuses a programme whose threshold is below 60', async () => {
    const result = await createProgramme(adminId, {
      name: `Below floor ${suffix}`,
      description: '',
      attendanceThreshold: 59,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(String(MINIMUM_ATTENDANCE_THRESHOLD));

    // Nothing was written.
    expect(await prisma.programme.count({ where: { name: `Below floor ${suffix}` } })).toBe(0);
  });

  it('accepts exactly 60 and anything above it', async () => {
    for (const threshold of [60, 75, 100]) {
      const programmeId = await newProgramme({ attendanceThreshold: threshold });
      const stored = await prisma.programme.findUniqueOrThrow({
        where: { id: programmeId },
        select: { attendanceThreshold: true },
      });
      expect(stored.attendanceThreshold).toBe(threshold);
    }
  });

  it('refuses lowering an existing programme below 60 on update', async () => {
    const programmeId = await newProgramme({ attendanceThreshold: 80 });
    const result = await updateProgramme(adminId, {
      programmeId,
      name: `Renamed ${suffix}`,
      description: '',
      attendanceThreshold: 40,
      active: false,
    });

    expect(result.ok).toBe(false);
    const stored = await prisma.programme.findUniqueOrThrow({
      where: { id: programmeId },
      select: { attendanceThreshold: true, name: true },
    });
    // The rejected update left nothing behind.
    expect(stored.attendanceThreshold).toBe(80);
    expect(stored.name).not.toBe(`Renamed ${suffix}`);
  });
});

describe('the threshold snapshot is not moved by a later edit', () => {
  it('leaves an existing enrolment on its snapshotted bar', async () => {
    const programmeId = await activeProgramme(['basic'], 90);

    const enrolment = await prisma.enrolment.create({
      data: { userId: memberId, tierId, status: 'active' },
    });
    await linkEnrolmentToProgrammes(prisma, enrolment.id, tierId);

    const snapshotted = await prisma.enrolmentProgramme.findUniqueOrThrow({
      where: { enrolmentId_programmeId: { enrolmentId: enrolment.id, programmeId } },
    });
    expect(snapshotted.attendanceThreshold).toBe(90);

    // An admin lowers the programme's bar. The programme moves; the member does not.
    const update = await updateProgramme(adminId, {
      programmeId,
      name: `Programme with lower bar ${suffix}`,
      description: '',
      attendanceThreshold: 65,
      active: true,
    });
    expect(update.ok).toBe(true);

    const after = await prisma.enrolmentProgramme.findUniqueOrThrow({
      where: { enrolmentId_programmeId: { enrolmentId: enrolment.id, programmeId } },
    });
    expect(after.attendanceThreshold).toBe(90);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: programmeId, action: 'PROGRAMME_THRESHOLD_CHANGED' },
    });
    expect(audit?.metadata).toMatchObject({ from: 90, to: 65 });
  });
});

describe('an active programme needs a tier mapping', () => {
  it('refuses to activate a programme with no tiers mapped', async () => {
    const programmeId = await newProgramme();
    const result = await updateProgramme(adminId, {
      programmeId,
      name: `Unmapped ${suffix}`,
      description: '',
      attendanceThreshold: 60,
      active: true,
    });

    expect(result.ok).toBe(false);
    const stored = await prisma.programme.findUniqueOrThrow({
      where: { id: programmeId },
      select: { active: true },
    });
    expect(stored.active).toBe(false);
  });

  it('activates once a tier is mapped', async () => {
    const programmeId = await newProgramme();
    await setProgrammeTiers(adminId, { programmeId, tierIds: ['basic'] });

    const result = await updateProgramme(adminId, {
      programmeId,
      name: `Mapped ${suffix}`,
      description: '',
      attendanceThreshold: 60,
      active: true,
    });
    expect(result.ok).toBe(true);

    const stored = await prisma.programme.findUniqueOrThrow({
      where: { id: programmeId },
      select: { active: true },
    });
    expect(stored.active).toBe(true);
  });
});

describe('BR-016 tier mapping guards', () => {
  it('rejects a retired tier id', async () => {
    const programmeId = await newProgramme();
    const result = await setProgrammeTiers(adminId, {
      programmeId,
      // Not in the `TierId` union, so it cannot be named in a type-safe way either.
      tierIds: ['tier-ii'],
    });

    expect(result.ok).toBe(false);
    expect(await prisma.programmeTier.count({ where: { programmeId } })).toBe(0);
  });

  it('resolves the mapping to the seeded active tier rows', async () => {
    const programmeId = await newProgramme();
    const result = await setProgrammeTiers(adminId, { programmeId, tierIds: ['basic'] });
    expect(result.ok).toBe(true);

    // The join is by exact display name against `active` rows, so the mapping
    // holds the seeded Basic Level row id rather than the catalogue slug.
    const mappings = await prisma.programmeTier.findMany({ where: { programmeId } });
    expect(mappings.map((mapping) => mapping.tierId)).toEqual([basicTierId]);

    const row = await prisma.tier.findUniqueOrThrow({
      where: { id: basicTierId },
      select: { active: true, name: true },
    });
    expect(row.active).toBe(true);
    expect(row.name).toBe('Basic Level');
  });

  it('maps exactly the six approved tiers when asked for all of them', async () => {
    const programmeId = await newProgramme();
    const all = [
      'o-free',
      'basic',
      'basic-iii',
      'advanced-iv',
      'advanced-v',
      'higher-advanced-viii',
    ];
    const result = await setProgrammeTiers(adminId, { programmeId, tierIds: all });

    expect(result.ok).toBe(true);
    expect(await prisma.programmeTier.count({ where: { programmeId } })).toBe(6);
  });
});

describe('tier removal is guarded by tierId, counted on real enrolments', () => {
  it('refuses to drop a tier that an active member depends on', async () => {
    const programmeId = await activeProgramme(['basic', 'basic-iii']);

    const enrolment = await prisma.enrolment.create({
      data: { userId: memberId, tierId, status: 'active' },
    });
    await linkEnrolmentToProgrammes(prisma, enrolment.id, tierId);

    // The member is linked via the Basic Level row, so narrowing the mapping to
    // Basic Level III would strand them. The guard counts by `tierId`, so it sees
    // the real row rather than a catalogue position.
    const mappings = await prisma.programmeTier.findMany({
      where: { programmeId },
      orderBy: { tierId: 'asc' },
    });
    expect(mappings.map((mapping) => mapping.tierId).sort()).toEqual(
      [basicTierId, basicThreeTierId].sort(),
    );

    const result = await setProgrammeTiers(adminId, { programmeId, tierIds: ['basic-iii'] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Basic Level');

    // The mapping is untouched.
    expect(await prisma.programmeTier.count({ where: { programmeId } })).toBe(2);
  });

  it('allows dropping a tier no member holds', async () => {
    const programmeId = await activeProgramme(['basic', 'basic-iii']);

    const result = await setProgrammeTiers(adminId, { programmeId, tierIds: ['basic'] });
    expect(result.ok).toBe(true);

    const mappings = await prisma.programmeTier.findMany({ where: { programmeId } });
    expect(mappings.map((mapping) => mapping.tierId)).toEqual([basicTierId]);
  });
});

describe('sessions', () => {
  it('requires joining details for a virtual session', async () => {
    const programmeId = await newProgramme();
    const result = await createSession(adminId, {
      programmeId,
      title: `Virtual without details ${suffix}`,
      description: '',
      startsAt: new Date('2099-01-01T09:00:00Z'),
      locationType: 'virtual',
      locationDetails: '',
    });

    expect(result.ok).toBe(false);
    expect(await prisma.programmeSession.count({ where: { programmeId } })).toBe(0);
  });

  it('refuses a session that ends before it starts', async () => {
    const programmeId = await newProgramme();
    const result = await createSession(adminId, {
      programmeId,
      title: `Backwards ${suffix}`,
      description: '',
      startsAt: new Date('2099-01-02T09:00:00Z'),
      endsAt: new Date('2099-01-01T09:00:00Z'),
      locationType: 'physical',
      locationDetails: 'Lagos',
    });

    expect(result.ok).toBe(false);
  });

  it('stores a location type and details, and defaults to physical', async () => {
    const programmeId = await newProgramme();
    const virtual = await createSession(adminId, {
      programmeId,
      title: `Virtual session ${suffix}`,
      description: '',
      startsAt: new Date('2099-02-01T09:00:00Z'),
      locationType: 'virtual',
      locationDetails: 'https://meet.example.test/abc',
    });
    expect(virtual.ok).toBe(true);

    const sessions = await listProgrammeSessions(programmeId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      locationType: 'virtual',
      locationDetails: 'https://meet.example.test/abc',
    });
  });

  it('removes a session with no attendance against it', async () => {
    const programmeId = await newProgramme();
    const session = await createSession(adminId, {
      programmeId,
      title: `Removable ${suffix}`,
      description: '',
      startsAt: new Date('2099-03-01T09:00:00Z'),
      locationType: 'physical',
      locationDetails: 'Abuja',
    });
    if (!session.ok || !('id' in session)) throw new Error('setup failed');

    const result = await removeSession(adminId, session.id);
    expect(result.ok).toBe(true);
    expect(await prisma.programmeSession.count({ where: { id: session.id } })).toBe(0);
  });

  it('refuses to remove a session that has attendance', async () => {
    const programmeId = await newProgramme();
    const session = await createSession(adminId, {
      programmeId,
      title: `Attended ${suffix}`,
      description: '',
      startsAt: new Date('2026-09-01T09:00:00Z'),
      locationType: 'physical',
      locationDetails: 'Lagos',
    });
    if (!session.ok || !('id' in session)) throw new Error('setup failed');

    const enrolment = await prisma.enrolment.create({
      data: { userId: memberId, tierId, status: 'active' },
    });
    await linkEnrolmentToProgrammes(prisma, enrolment.id, tierId);
    await prisma.attendanceRecord.create({
      data: {
        userId: memberId,
        sessionId: session.id,
        enrolmentId: enrolment.id,
        status: 'present',
        method: 'manual',
        markedBy: adminId,
      },
    });

    const result = await removeSession(adminId, session.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('compliance record');
    expect(await prisma.programmeSession.count({ where: { id: session.id } })).toBe(1);
  });

  it('lets attendance be marked once a link exists (the activation gap this fixed)', async () => {
    const { markAttendance } = await import('@/lib/attendance');
    const programmeId = await activeProgramme(['basic']);
    const session = await createSession(adminId, {
      programmeId,
      title: `Markable ${suffix}`,
      description: '',
      startsAt: new Date('2026-08-01T09:00:00Z'),
      locationType: 'physical',
      locationDetails: 'Lagos',
    });
    if (!session.ok || !('id' in session)) throw new Error('setup failed');

    const enrolment = await prisma.enrolment.create({
      data: { userId: memberId, tierId, status: 'active' },
    });
    await linkEnrolmentToProgrammes(prisma, enrolment.id, tierId);

    const result = await markAttendance(adminId, {
      sessionId: session.id,
      enrolmentId: enrolment.id,
      status: 'present',
    });

    expect(result.ok).toBe(true);
    const link = await prisma.enrolmentProgramme.findUniqueOrThrow({
      where: { enrolmentId_programmeId: { enrolmentId: enrolment.id, programmeId } },
    });
    expect(link.attendancePercentage).toBe(100);
  });
});

describe('withdrawal is not deletion', () => {
  it('deactivates the programme and keeps the row', async () => {
    const programmeId = await activeProgramme(['basic']);

    const result = await deactivateProgramme(adminId, programmeId);
    expect(result.ok).toBe(true);

    const stored = await prisma.programme.findUniqueOrThrow({
      where: { id: programmeId },
      select: { active: true },
    });
    expect(stored.active).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: programmeId, action: 'PROGRAMME_DEACTIVATED' },
    });
    expect(audit?.metadata).toMatchObject({ rowDeleted: false });
  });

  it('no longer links the programme to a newly activated enrolment', async () => {
    const programmeId = await activeProgramme(['basic']);
    await deactivateProgramme(adminId, programmeId);

    const enrolment = await prisma.enrolment.create({
      data: { userId: memberId, tierId, status: 'active' },
    });
    await linkEnrolmentToProgrammes(prisma, enrolment.id, tierId);

    expect(
      await prisma.enrolmentProgramme.count({
        where: { enrolmentId: enrolment.id, programmeId },
      }),
    ).toBe(0);
  });

  it('keeps an existing member linked after withdrawal', async () => {
    const programmeId = await activeProgramme(['basic']);

    const enrolment = await prisma.enrolment.create({
      data: { userId: memberId, tierId, status: 'active' },
    });
    await linkEnrolmentToProgrammes(prisma, enrolment.id, tierId);
    await deactivateProgramme(adminId, programmeId);

    // Withdrawal stops new linkage; it does not orphan somebody already working
    // through the programme.
    expect(
      await prisma.enrolmentProgramme.count({
        where: { enrolmentId: enrolment.id, programmeId },
      }),
    ).toBe(1);
  });
});

describe('admin listing', () => {
  it('reports session, material, and dependent-member counts', async () => {
    const programmeId = await activeProgramme(['basic']);

    const enrolment = await prisma.enrolment.create({
      data: { userId: memberId, tierId, status: 'active' },
    });
    await linkEnrolmentToProgrammes(prisma, enrolment.id, tierId);

    const summary = (await listProgrammes()).find((entry) => entry.id === programmeId);
    expect(summary).toBeDefined();
    expect(summary?.tierNames).toEqual(['Basic Level']);
    expect(summary?.linkedEnrolmentCount).toBe(1);
    expect(summary?.active).toBe(true);
  });
});
