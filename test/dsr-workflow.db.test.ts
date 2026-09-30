import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prisma } from '@/lib/db/client';
import {
  listDataSubjectRequestsForAdmin,
  submitDataSubjectRequest,
  transitionDataSubjectRequest,
} from '@/lib/ndpa/data-subject-requests';

const suffix = randomBytes(4).toString('hex');
let adminId = '';
let memberId = '';
let requestId = '';

beforeAll(async () => {
  const adminRole = await prisma.role.findFirstOrThrow({ where: { id: 'role-super-admin' } });
  const admin = await prisma.user.create({
    data: {
      email: `dsr-admin-${suffix}@example.test`,
      name: 'DSR Admin',
      passwordHash: 'x',
      roleId: adminRole.id,
    },
  });
  const member = await prisma.user.create({
    data: {
      email: `dsr-member-${suffix}@example.test`,
      name: 'DSR Member',
      passwordHash: 'x',
    },
  });
  adminId = admin.id;
  memberId = member.id;
  requestId = await submitDataSubjectRequest(member.id, 'access');
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM data_subject_request WHERE id = ${requestId}`;
  // The audit trail is append-only and the actor FK is RESTRICT, so these users
  // cannot be hard-deleted - and must not be. Scrub them the way the erasure
  // path does, which leaves the audit entries pointing at a tombstone.
  await prisma.user.update({
    where: { id: memberId },
    data: {
      email: `erased-member-${suffix}@anonymised.invalid`,
      name: 'Erased member',
      deletedAt: new Date(),
    },
  });
  await prisma.user.update({
    where: { id: adminId },
    data: {
      email: `erased-admin-${suffix}@anonymised.invalid`,
      name: 'Erased admin',
      deletedAt: new Date(),
    },
  });
  await prisma.$disconnect();
});

it('records the submission with an audit entry', async () => {
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: requestId } });
  expect(audit.action).toBe('DATA_SUBJECT_REQUEST_SUBMITTED');
  expect(audit.actorId).toBe(memberId);
});

it('walks pending -> in_progress -> completed and records the handler', async () => {
  const pickedUp = await transitionDataSubjectRequest({
    requestId,
    actorId: adminId,
    to: 'in_progress',
    notes: 'Verified identity by phone.',
  });
  expect(pickedUp).toEqual({ ok: true, from: 'pending', to: 'in_progress' });

  const closed = await transitionDataSubjectRequest({
    requestId,
    actorId: adminId,
    to: 'completed',
    notes: 'Emailed a copy of the account record.',
  });
  expect(closed).toEqual({ ok: true, from: 'in_progress', to: 'completed' });

  const stored = await prisma.dataSubjectRequest.findUniqueOrThrow({ where: { id: requestId } });
  expect(stored.status).toBe('completed');
  expect(stored.handledBy).toBe(adminId);
  expect(stored.resolvedAt).not.toBeNull();
  // Progress notes are kept, not overwritten.
  expect(stored.handlingNotes).toContain('Verified identity by phone.');
  expect(stored.handlingNotes).toContain('Emailed a copy');
});

it('refuses to reopen a closed request and writes no further transition', async () => {
  const reopened = await transitionDataSubjectRequest({
    requestId,
    actorId: adminId,
    to: 'in_progress',
    notes: null,
  });
  expect(reopened.ok).toBe(false);
  expect(reopened.ok === false && reopened.message).toMatch(/closed/i);

  const changes = await prisma.auditLog.count({
    where: { entityId: requestId, action: 'DATA_SUBJECT_REQUEST_STATUS_CHANGED' },
  });
  expect(changes).toBe(2);
});

it('refuses a rejection with no reason', async () => {
  const second = await submitDataSubjectRequest(memberId, 'erasure');
  const outcome = await transitionDataSubjectRequest({
    requestId: second,
    actorId: adminId,
    to: 'rejected',
    notes: '   ',
  });
  expect(outcome.ok).toBe(false);

  const withReason = await transitionDataSubjectRequest({
    requestId: second,
    actorId: adminId,
    to: 'rejected',
    notes: 'Payment records are retained for the statutory period.',
  });
  expect(withReason.ok).toBe(true);
  await prisma.$executeRaw`DELETE FROM data_subject_request WHERE id = ${second}`;
});

it('audits the admin read of the queue', async () => {
  const rows = await listDataSubjectRequestsForAdmin(adminId);
  // Not `rows[0]` — a developer database may already hold other requests, and
  // the queue is ordered oldest first. Assert this member is in it.
  expect(rows.some((row) => row.memberEmail === `dsr-member-${suffix}@example.test`)).toBe(true);
  expect(rows.some((row) => row.id === requestId && row.status === 'completed')).toBe(true);

  const read = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'DATA_SUBJECT_REQUESTS_VIEWED' },
    orderBy: { createdAt: 'desc' },
  });
  expect(read.actorId).toBe(adminId);
  expect(read.entityId).toBe('queue');
});

it('refuses UPDATE and DELETE on the audit log at the database level', async () => {
  const entry = await prisma.auditLog.findFirstOrThrow({ where: { entityId: requestId } });
  await expect(
    prisma.$executeRaw`UPDATE audit_log SET action = 'TAMPERED' WHERE id = ${entry.id}`,
  ).rejects.toThrow();
  await expect(prisma.$executeRaw`DELETE FROM audit_log WHERE id = ${entry.id}`).rejects.toThrow();
});

it('refuses to hard-delete a member who has audit history', async () => {
  // SEC-015 plus the RESTRICT actor FK. Erasure is anonymisation, not a
  // DELETE, so this refusal is the compliance guarantee working - not a bug to
  // work around by relaxing the constraint.
  await expect(prisma.user.delete({ where: { id: memberId } })).rejects.toThrow();
});
