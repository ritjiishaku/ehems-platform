/**
 * Programme, session, and tier-mapping administration.
 *
 * The three rules that matter here are all about *not letting an admin edit
 * something a paying member's entitlement depends on*, so they are enforced in
 * this module and not in the Zod schemas (AGENTS.md §7 — a schema that ships to
 * the client discloses its rule and can be bypassed):
 *
 * 1. **The attendance threshold has a floor of 60, and lowering it never moves a
 *    bar an existing member is held to** (BR-008). BR-008 sets 60% as the bar for
 *    completion, so a programme may demand *more* than 60 but never less —
 *    otherwise an admin could make a programme completable at 0% attendance. The
 *    second half is subtler, and is the reason `EnrolmentProgramme` carries its own
 *    `attendance_threshold` column: once a member is linked, their bar is frozen.
 * 2. **An active programme needs at least one tier mapping.** Programmes are
 *    reached through the tier a member holds (`ProgrammeTier`, D-6). A programme
 *    with no mapping is unreachable, so activating one would create a programme
 *    nobody can ever enrol on.
 * 3. **Removing a tier mapping is refused while members depend on it.** The count
 *    is by `tierId` — never by tier *name*, never by array position. Names are
 *    contractual display strings and positions move whenever the catalogue is
 *    reordered (BR-016 makes order explicit for exactly this reason).
 *
 * ## Deletion policy
 *
 * Programmes, materials, and sessions are never hard-deleted on the admin path.
 * `active` flags carry withdrawal and an audit entry records who did it, so
 * attendance, completion reviews, and mentor lineage keep resolving. A session is
 * the one exception: it can be deleted, but only while it has no attendance
 * against it, because an attendance record describes something that happened
 * (`attendance_record.session_id` is `ON DELETE RESTRICT`, so the database
 * enforces the same rule even if this module is bypassed).
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { isTierId, listActiveTiers, type TierId } from '@/lib/pricing/tiers';
import type {
  MaterialCreateInput,
  ProgrammeCreateInput,
  ProgrammeTiersInput,
  ProgrammeUpdateInput,
  SessionCreateInput,
  SessionUpdateInput,
} from '@/lib/validation/programmes';

/** BR-008: completion needs at least 60% attendance, so 60 is the lowest bar a programme may set. */
export const MINIMUM_ATTENDANCE_THRESHOLD = 60;

export type ProgrammeFailure = { ok: false; message: string };
export type ProgrammeOk = { ok: true };
export type ProgrammeCreated = { ok: true; id: string };

type Outcome = ProgrammeOk | ProgrammeCreated | ProgrammeFailure;

type Tx = Prisma.TransactionClient;

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export type ProgrammeSummary = {
  id: string;
  name: string;
  description: string | null;
  attendanceThreshold: number;
  active: boolean;
  tierNames: string[];
  sessionCount: number;
  materialCount: number;
  /**
   * Active or completed enrolments linked to this programme. Shown beside the
   * deactivate control so an admin sees the blast radius before acting.
   */
  linkedEnrolmentCount: number;
};

export async function listProgrammes(): Promise<ProgrammeSummary[]> {
  const programmes = await prisma.programme.findMany({
    orderBy: { name: 'asc' },
    include: {
      tiers: { include: { tier: { select: { name: true } } } },
      _count: { select: { sessions: true, materials: true } },
      enrolments: {
        where: { enrolment: { status: { in: ['active', 'completed'] } } },
        select: { enrolmentId: true },
      },
    },
  });

  return programmes.map((programme) => ({
    id: programme.id,
    name: programme.name,
    description: programme.description,
    attendanceThreshold: programme.attendanceThreshold,
    active: programme.active,
    tierNames: programme.tiers.map((mapping) => mapping.tier.name),
    sessionCount: programme._count.sessions,
    materialCount: programme._count.materials,
    linkedEnrolmentCount: programme.enrolments.length,
  }));
}

export type SessionSummary = {
  id: string;
  programmeId: string;
  programmeName: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  locationType: string;
  locationDetails: string | null;
  /** Attendance recorded against this session; a non-zero count blocks removal. */
  attendanceCount: number;
};

export async function listProgrammeSessions(programmeId: string): Promise<SessionSummary[]> {
  const sessions = await prisma.programmeSession.findMany({
    where: { programmeId },
    orderBy: { startsAt: 'asc' },
    include: {
      programme: { select: { name: true } },
      _count: { select: { attendanceRecords: true } },
    },
  });

  return sessions.map((session) => ({
    id: session.id,
    programmeId: session.programmeId,
    programmeName: session.programme.name,
    title: session.title,
    description: session.description,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    locationType: session.locationType,
    locationDetails: session.locationDetails,
    attendanceCount: session._count.attendanceRecords,
  }));
}

export type MaterialSummary = {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  active: boolean;
};

export async function listProgrammeMaterials(programmeId: string): Promise<MaterialSummary[]> {
  const materials = await prisma.material.findMany({
    where: { programmeId },
    orderBy: { title: 'asc' },
  });
  return materials.map((material) => ({
    id: material.id,
    title: material.title,
    description: material.description,
    fileUrl: material.fileUrl,
    active: material.active,
  }));
}

/* -------------------------------------------------------------------------- */
/* Programme writes                                                            */
/* -------------------------------------------------------------------------- */

export async function createProgramme(
  actorId: string,
  input: ProgrammeCreateInput,
): Promise<ProgrammeCreated | ProgrammeFailure> {
  if (input.attendanceThreshold < MINIMUM_ATTENDANCE_THRESHOLD) {
    return {
      ok: false,
      message: `The attendance threshold cannot be below ${MINIMUM_ATTENDANCE_THRESHOLD}% (BR-008).`,
    };
  }

  const programme = await prisma.programme.create({
    data: {
      name: input.name,
      description: input.description || null,
      attendanceThreshold: input.attendanceThreshold,
      // New programmes start inactive. A programme is not reachable until it has a
      // tier mapping, and rule 2 is what stops it being switched on before then.
      active: false,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'PROGRAMME_CREATED',
      entityType: 'Programme',
      entityId: programme.id,
      metadata: { name: programme.name, attendanceThreshold: programme.attendanceThreshold },
    },
  });

  return { ok: true, id: programme.id };
}

export async function updateProgramme(
  actorId: string,
  input: ProgrammeUpdateInput & { programmeId: string },
): Promise<Outcome> {
  if (input.attendanceThreshold < MINIMUM_ATTENDANCE_THRESHOLD) {
    return {
      ok: false,
      message: `The attendance threshold cannot be below ${MINIMUM_ATTENDANCE_THRESHOLD}% (BR-008).`,
    };
  }

  const programme = await prisma.programme.findUnique({
    where: { id: input.programmeId },
    select: { id: true, name: true, active: true, attendanceThreshold: true },
  });
  if (!programme) return { ok: false, message: 'That programme does not exist.' };

  // Rule 2, checked before the write so the programme is never briefly active with
  // nothing behind it.
  if (input.active && !programme.active) {
    const mappingCount = await prisma.programmeTier.count({
      where: { programmeId: programme.id },
    });
    if (mappingCount === 0) {
      return {
        ok: false,
        message: 'Map at least one tier before activating this programme.',
      };
    }
  }

  await prisma.programme.update({
    where: { id: programme.id },
    data: {
      name: input.name,
      description: input.description || null,
      attendanceThreshold: input.attendanceThreshold,
      active: input.active,
    },
  });

  // Rule 1, second half: lowering the programme threshold applies to future
  // enrolments only. The snapshot on `EnrolmentProgramme` is deliberately left
  // alone, and the audit entry records the affected count so the divergence
  // between the programme and its existing members is legible later.
  const thresholdChanged = programme.attendanceThreshold !== input.attendanceThreshold;
  if (thresholdChanged) {
    const existingLinks = await prisma.enrolmentProgramme.count({
      where: { programmeId: programme.id },
    });
    await prisma.auditLog.create({
      data: {
        actorId,
        action: 'PROGRAMME_THRESHOLD_CHANGED',
        entityType: 'Programme',
        entityId: programme.id,
        metadata: {
          from: programme.attendanceThreshold,
          to: input.attendanceThreshold,
          existingEnrolmentsUnaffected: existingLinks,
          note: 'EnrolmentProgramme.attendance_threshold is snapshotted and was not updated.',
        },
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: input.active && !programme.active ? 'PROGRAMME_ACTIVATED' : 'PROGRAMME_UPDATED',
      entityType: 'Programme',
      entityId: programme.id,
      metadata: {
        name: input.name,
        attendanceThreshold: input.attendanceThreshold,
        active: input.active,
      },
    },
  });

  return { ok: true };
}

/**
 * Withdrawal, not deletion. The row survives so historic attendance, completion
 * reviews, and mentor lineage keep resolving — BR-015's "mentors must first have
 * been mentees" chain depends on exactly these records persisting.
 */
export async function deactivateProgramme(actorId: string, programmeId: string): Promise<Outcome> {
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: { id: true, name: true, active: true },
  });
  if (!programme) return { ok: false, message: 'That programme does not exist.' };
  if (!programme.active) {
    return { ok: false, message: 'That programme is already withdrawn.' };
  }

  await prisma.programme.update({ where: { id: programmeId }, data: { active: false } });

  const stillLinked = await prisma.enrolmentProgramme.count({
    where: { programmeId, enrolment: { status: { in: ['active', 'completed'] } } },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'PROGRAMME_DEACTIVATED',
      entityType: 'Programme',
      entityId: programmeId,
      metadata: { name: programme.name, stillLinkedEnrolments: stillLinked, rowDeleted: false },
    },
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Tier mapping                                                                */
/* -------------------------------------------------------------------------- */

/** Exact display names for a set of catalogue ids, in display order. */
function namesForTierIds(ids: TierId[]): string[] {
  const wanted = new Set(ids);
  return listActiveTiers()
    .filter((tier) => wanted.has(tier.id))
    .map((tier) => tier.name);
}

/**
 * Replace a programme's tier mappings wholesale.
 *
 * `tierIds` are code-catalogue ids, and BR-016 is enforced twice over:
 * `isTierId` rejects a retired tier because it is absent from the `TierId` union
 * entirely, and the row lookup requires `active: true` so a deactivated tier row
 * cannot be mapped even if it is somehow named here. The catalogue id → row
 * join is by exact display name, the same join `lib/payments/catalogue.ts` uses,
 * so a mapping cannot point at a different row than an enrolment would.
 */
export async function setProgrammeTiers(
  actorId: string,
  input: ProgrammeTiersInput,
): Promise<Outcome> {
  if (input.tierIds.some((id) => !isTierId(id))) {
    return {
      ok: false,
      message:
        'One or more of those tiers does not exist. Retired tiers are never mappable (BR-016).',
    };
  }

  // Deduplicate, so naming the same tier twice is one mapping rather than an error.
  const requested = Array.from(new Set(input.tierIds)) as TierId[];

  const programme = await prisma.programme.findUnique({
    where: { id: input.programmeId },
    select: { id: true, name: true },
  });
  if (!programme) return { ok: false, message: 'That programme does not exist.' };

  const wantedNames = namesForTierIds(requested);
  const rows = await prisma.tier.findMany({
    where: { name: { in: wantedNames }, active: true },
    select: { id: true, name: true },
  });
  if (rows.length !== requested.length) {
    return {
      ok: false,
      message: 'One or more of those tiers are not configured in this database.',
    };
  }

  const existing = await prisma.programmeTier.findMany({
    where: { programmeId: programme.id },
    select: { tierId: true },
  });
  const existingIds = existing.map((mapping) => mapping.tierId);
  const targetIds = rows.map((row) => row.id);

  // Rule 3. Counted by `tierId`: anything dropping out of the mapping is checked
  // against active/completed enrolments holding that same tierId. Comparing names
  // or catalogue positions here would silently miss a reordering.
  const removedTierIds = existingIds.filter((tierId) => !targetIds.includes(tierId));
  if (removedTierIds.length > 0) {
    const dependents = await prisma.enrolment.count({
      where: {
        tierId: { in: removedTierIds },
        status: { in: ['active', 'completed'] },
        programmes: { some: { programmeId: programme.id } },
      },
    });
    if (dependents > 0) {
      const removedNames = await prisma.tier.findMany({
        where: { id: { in: removedTierIds } },
        select: { name: true },
      });
      return {
        ok: false,
        message:
          `${dependents} active or completed member(s) on ${removedNames
            .map((tier) => tier.name)
            .join(', ')} depend on this programme. ` +
          'Withdraw the programme instead of changing its tier mapping.',
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.programmeTier.deleteMany({ where: { programmeId: programme.id } });
    await tx.programmeTier.createMany({
      data: rows.map((row) => ({ programmeId: programme.id, tierId: row.id })),
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'PROGRAMME_TIERS_SET',
        entityType: 'Programme',
        entityId: programme.id,
        metadata: {
          from: existingIds,
          to: rows.map((row) => row.id),
          tierNames: rows.map((row) => row.name),
          blockedRemovals: removedTierIds,
        },
      },
    });
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * PRD §16.2 location rule: a virtual or hybrid session must carry its joining
 * details, and a physical one must say where.
 *
 * Details are stored as free text on purpose. Meeting URLs rotate and live
 * off-platform, which is the same reasoning that keeps `CommunityLink.url` an
 * opaque string rather than a vetted provider — community links are data, not
 * code.
 *
 * The end-after-start rule is enforced here as well as in the schema. It looks
 * redundant, and deliberately is: the schema copy reaches the browser and can be
 * bypassed, so a domain call that skipped it would happily persist a session
 * whose end precedes its start. The domain layer is the enforcement point
 * (AGENTS.md §7); the schema copy is only there to give the form a message.
 */
function validateSessionShape(
  locationType: string,
  locationDetails: string,
  startsAt: Date,
  endsAt: Date | null,
): string | null {
  const hasDetails = locationDetails.trim().length > 0;
  if (!hasDetails) {
    return locationType === 'physical'
      ? 'A physical session needs its venue details.'
      : 'A virtual or hybrid session needs its joining details (meeting link or dial-in).';
  }
  if (endsAt !== null && endsAt.getTime() < startsAt.getTime()) {
    return 'The session cannot end before it starts.';
  }
  return null;
}

export async function createSession(
  actorId: string,
  input: SessionCreateInput,
): Promise<ProgrammeCreated | ProgrammeFailure> {
  const shapeError = validateSessionShape(
    input.locationType,
    input.locationDetails,
    input.startsAt,
    input.endsAt ?? null,
  );
  if (shapeError) return { ok: false, message: shapeError };

  const programme = await prisma.programme.findUnique({
    where: { id: input.programmeId },
    select: { id: true, name: true },
  });
  if (!programme) return { ok: false, message: 'That programme does not exist.' };

  const session = await prisma.programmeSession.create({
    data: {
      programmeId: programme.id,
      title: input.title,
      description: input.description || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      locationType: input.locationType,
      locationDetails: input.locationDetails || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'PROGRAMME_SESSION_CREATED',
      entityType: 'ProgrammeSession',
      entityId: session.id,
      metadata: {
        programmeId: programme.id,
        programmeName: programme.name,
        title: session.title,
        startsAt: session.startsAt.toISOString(),
        locationType: session.locationType,
      },
    },
  });

  return { ok: true, id: session.id };
}

export async function updateSession(actorId: string, input: SessionUpdateInput): Promise<Outcome> {
  const shapeError = validateSessionShape(
    input.locationType,
    input.locationDetails,
    input.startsAt,
    input.endsAt ?? null,
  );
  if (shapeError) return { ok: false, message: shapeError };

  const session = await prisma.programmeSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, title: true, startsAt: true, programmeId: true },
  });
  if (!session) return { ok: false, message: 'That session does not exist.' };

  const attendanceCount = await prisma.attendanceRecord.count({ where: { sessionId: session.id } });

  // Moving a session that already has attendance would silently change what an
  // already-taken record refers to, so it is refused rather than rewriting history.
  if (attendanceCount > 0 && input.startsAt.getTime() !== session.startsAt.getTime()) {
    return {
      ok: false,
      message:
        'This session already has attendance recorded, so its date and time cannot be moved.',
    };
  }

  await prisma.programmeSession.update({
    where: { id: session.id },
    data: {
      title: input.title,
      description: input.description || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      locationType: input.locationType,
      locationDetails: input.locationDetails || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'PROGRAMME_SESSION_UPDATED',
      entityType: 'ProgrammeSession',
      entityId: session.id,
      metadata: {
        programmeId: session.programmeId,
        title: input.title,
        from: session.startsAt.toISOString(),
        to: input.startsAt.toISOString(),
        attendanceCount,
      },
    },
  });

  return { ok: true };
}

/**
 * The only hard delete on the admin path, and it is conditional: a session with
 * attendance against it is refused, because that record describes something that
 * happened (SEC-007).
 */
export async function removeSession(actorId: string, sessionId: string): Promise<Outcome> {
  const session = await prisma.programmeSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      startsAt: true,
      programmeId: true,
      programme: { select: { name: true } },
    },
  });
  if (!session) return { ok: false, message: 'That session does not exist.' };

  const attendanceCount = await prisma.attendanceRecord.count({ where: { sessionId } });
  if (attendanceCount > 0) {
    return {
      ok: false,
      message:
        'This session has attendance recorded against it and cannot be removed. ' +
        'Attendance is a compliance record (SEC-007).',
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.programmeSession.delete({ where: { id: sessionId } });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'PROGRAMME_SESSION_REMOVED',
        entityType: 'ProgrammeSession',
        entityId: sessionId,
        metadata: {
          title: session.title,
          startsAt: session.startsAt.toISOString(),
          programmeId: session.programmeId,
          programmeName: session.programme.name,
          attendanceCount: 0,
        },
      },
    });
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Materials                                                                   */
/* -------------------------------------------------------------------------- */

export async function createMaterial(
  actorId: string,
  input: MaterialCreateInput,
): Promise<ProgrammeCreated | ProgrammeFailure> {
  const programme = await prisma.programme.findUnique({
    where: { id: input.programmeId },
    select: { id: true, name: true },
  });
  if (!programme) return { ok: false, message: 'That programme does not exist.' };

  const material = await prisma.material.create({
    data: {
      programmeId: programme.id,
      title: input.title,
      description: input.description || null,
      fileUrl: input.fileUrl,
      active: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'PROGRAMME_MATERIAL_CREATED',
      entityType: 'Material',
      entityId: material.id,
      metadata: {
        programmeId: programme.id,
        programmeName: programme.name,
        title: material.title,
      },
    },
  });

  return { ok: true, id: material.id };
}

/** Materials are withdrawn, never deleted: a member may already have downloaded one. */
export async function deactivateMaterial(actorId: string, materialId: string): Promise<Outcome> {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { id: true, title: true, programmeId: true, active: true },
  });
  if (!material) return { ok: false, message: 'That material does not exist.' };
  if (!material.active) {
    return { ok: false, message: 'That material is already withdrawn.' };
  }

  await prisma.material.update({ where: { id: materialId }, data: { active: false } });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'PROGRAMME_MATERIAL_DEACTIVATED',
      entityType: 'Material',
      entityId: materialId,
      metadata: { title: material.title, programmeId: material.programmeId, rowDeleted: false },
    },
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Activation-time enrolment linkage                                           */
/* -------------------------------------------------------------------------- */

/**
 * Link a newly activated enrolment to every active programme mapped to its tier,
 * snapshotting each programme's attendance threshold onto the link.
 *
 * Called from the only two places an enrolment becomes `active`:
 *
 *   - `lib/payments/activate-enrolment.ts` — the single paid activation point
 *     (AGENTS.md §4)
 *   - `lib/auth/index.ts` — the D-1 zero-cost O'Free exception
 *
 * Without this, `markAttendance` finds no link and rejects every mark ("not
 * enrolled on this programme"), and `lib/completion` has no per-programme
 * percentage to read. The snapshot is taken here, once, so a later threshold edit
 * cannot move a bar the member has already been working against.
 *
 * `upsert` with an empty `update` is deliberate: re-activating must be safe, and
 * must **not** re-snapshot and quietly lower an already committed bar.
 */
export async function linkEnrolmentToProgrammes(
  tx: Tx,
  enrolmentId: string,
  tierId: string,
): Promise<number> {
  const programmes = await tx.programme.findMany({
    where: { tiers: { some: { tierId } }, active: true },
    select: { id: true, attendanceThreshold: true },
  });

  for (const programme of programmes) {
    await tx.enrolmentProgramme.upsert({
      where: { enrolmentId_programmeId: { enrolmentId, programmeId: programme.id } },
      create: {
        enrolmentId,
        programmeId: programme.id,
        attendanceThreshold: programme.attendanceThreshold,
      },
      update: {},
    });
  }

  return programmes.length;
}
