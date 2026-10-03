import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFeedbackForm,
  listAllFeedbackResponses,
  listAvailableFeedbackForms,
  listOwnFeedback,
  setFeedbackFormActive,
  submitFeedback,
} from '@/lib/feedback';
import { prisma } from '@/lib/db/client';

const suffix = randomBytes(4).toString('hex');
const formIds: string[] = [];
const responseIds: string[] = [];
let adminId = '';
let memberId = '';
let otherMemberId = '';

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: `feedback-admin-${suffix}@example.test`,
      name: 'Feedback Admin',
      passwordHash: 'x',
      roleId: 'role-super-admin',
    },
  });
  const member = await prisma.user.create({
    data: {
      email: `feedback-member-${suffix}@example.test`,
      name: 'Feedback Member',
      passwordHash: 'x',
    },
  });
  const other = await prisma.user.create({
    data: {
      email: `feedback-other-${suffix}@example.test`,
      name: 'Other Member',
      passwordHash: 'x',
    },
  });
  adminId = admin.id;
  memberId = member.id;
  otherMemberId = other.id;
});

afterAll(async () => {
  await prisma.feedbackResponse.deleteMany({ where: { id: { in: responseIds } } });
  await prisma.feedbackForm.deleteMany({ where: { id: { in: formIds } } });
  for (const id of [adminId, memberId, otherMemberId]) {
    await prisma.user
      .update({
        where: { id },
        data: {
          email: `erased-feedback-${id.slice(-6)}-${suffix}@anonymised.invalid`,
          name: 'Erased user',
          deletedAt: new Date(),
        },
      })
      .catch(() => null);
  }
  await prisma.$disconnect();
});

async function newForm(overrides: { title?: string; active?: boolean } = {}) {
  const result = await createFeedbackForm(adminId, {
    title: overrides.title ?? `Form ${randomBytes(3).toString('hex')}`,
    description: 'How did it go?',
    active: overrides.active ?? true,
  });
  if (!result.ok) throw new Error(`setup failed: ${result.message}`);
  formIds.push(result.id);
  return result.id;
}

describe('feedback submission (FR-051)', () => {
  it('records a rating and comment', async () => {
    const formId = await newForm();
    const result = await submitFeedback(memberId, {
      formId,
      rating: 4,
      comment: 'Useful session',
      isAnonymous: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('setup failed');
    responseIds.push(result.id);

    const row = await prisma.feedbackResponse.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.userId).toBe(memberId);
    expect(row.responseData).toMatchObject({ rating: 4, comment: 'Useful session' });

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: result.id, action: 'FEEDBACK_SUBMITTED' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toMatchObject({ rating: 4, isAnonymous: false, hasComment: true });
  });

  it('refuses a rating outside 1-5 even when the caller skips the schema', async () => {
    const formId = await newForm();
    const result = await submitFeedback(memberId, {
      formId,
      rating: 9,
      comment: '',
      isAnonymous: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('between 1 and 5');
    expect(await prisma.feedbackResponse.count({ where: { formId } })).toBe(0);
  });

  it('updates rather than duplicates a second submission', async () => {
    const formId = await newForm();
    const first = await submitFeedback(memberId, {
      formId,
      rating: 2,
      comment: 'First answer',
      isAnonymous: false,
    });
    if (!first.ok) throw new Error('setup failed');
    responseIds.push(first.id);

    const second = await submitFeedback(memberId, {
      formId,
      rating: 5,
      comment: 'Corrected answer',
      isAnonymous: false,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('setup failed');
    expect(second.id).toBe(first.id);

    // One row, not two — otherwise a count the admin reviews is wrong.
    expect(await prisma.feedbackResponse.count({ where: { formId } })).toBe(1);

    const row = await prisma.feedbackResponse.findUniqueOrThrow({ where: { id: first.id } });
    expect(row.responseData).toMatchObject({ rating: 5, comment: 'Corrected answer' });

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: first.id, action: 'FEEDBACK_UPDATED' },
    });
    expect(audit?.metadata).toMatchObject({ replaced: true });
  });

  it('refuses a response to a closed form', async () => {
    const formId = await newForm();
    await setFeedbackFormActive(adminId, formId, false);

    const result = await submitFeedback(memberId, {
      formId,
      rating: 3,
      comment: '',
      isAnonymous: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('closed');
  });

  it('refuses an unknown form', async () => {
    const result = await submitFeedback(memberId, {
      formId: 'no-such-form',
      rating: 3,
      comment: '',
      isAnonymous: false,
    });
    expect(result.ok).toBe(false);
  });
});

describe('anonymity is to the reviewer, not to the system', () => {
  it('keeps the author on the row and hides the name from the admin view', async () => {
    const formId = await newForm();
    const result = await submitFeedback(memberId, {
      formId,
      rating: 5,
      comment: 'Anonymous praise',
      isAnonymous: true,
    });
    if (!result.ok) throw new Error('setup failed');
    responseIds.push(result.id);

    // The link is retained: it is what makes "one response per member per form"
    // and "what has this member already submitted?" answerable.
    const row = await prisma.feedbackResponse.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.userId).toBe(memberId);

    const { responses } = await listAllFeedbackResponses(adminId, formId);
    expect(responses).toHaveLength(1);
    expect(responses[0].isAnonymous).toBe(true);
    expect(responses[0].authorName).toBeNull();
    expect(responses[0].authorEmail).toBeNull();
    // The content itself is still reviewable.
    expect(responses[0].comment).toBe('Anonymous praise');
  });

  it('shows the author when anonymity was not requested', async () => {
    const formId = await newForm();
    const result = await submitFeedback(otherMemberId, {
      formId,
      rating: 3,
      comment: 'Fine',
      isAnonymous: false,
    });
    if (!result.ok) throw new Error('setup failed');
    responseIds.push(result.id);

    const { responses } = await listAllFeedbackResponses(adminId, formId);
    expect(responses[0].authorName).toBe('Other Member');
    expect(responses[0].authorEmail).toBe(`feedback-other-${suffix}@example.test`);
  });
});

describe('member reads', () => {
  it('shows the member their own responses only', async () => {
    const formId = await newForm();
    const result = await submitFeedback(memberId, {
      formId,
      rating: 4,
      comment: 'Mine',
      isAnonymous: false,
    });
    if (!result.ok) throw new Error('setup failed');
    responseIds.push(result.id);

    const own = await listOwnFeedback(memberId);
    expect(own.some((entry) => entry.id === result.id)).toBe(true);

    const otherOwn = await listOwnFeedback(otherMemberId);
    expect(otherOwn.some((entry) => entry.id === result.id)).toBe(false);
  });

  it('surfaces the member own answer on the open form', async () => {
    const formId = await newForm();
    const result = await submitFeedback(memberId, {
      formId,
      rating: 3,
      comment: 'Already said',
      isAnonymous: false,
    });
    if (!result.ok) throw new Error('setup failed');
    responseIds.push(result.id);

    const forms = await listAvailableFeedbackForms(memberId);
    const form = forms.find((entry) => entry.id === formId);
    expect(form?.ownResponse).toEqual({ rating: 3, comment: 'Already said' });
    expect(form?.responseCount).toBe(1);
  });

  it('hides a closed form from the available list', async () => {
    const formId = await newForm();
    await setFeedbackFormActive(adminId, formId, false);
    const forms = await listAvailableFeedbackForms(memberId);
    expect(forms.some((entry) => entry.id === formId)).toBe(false);
  });
});

describe('form lifecycle', () => {
  it('closing a form keeps its responses', async () => {
    const formId = await newForm();
    const result = await submitFeedback(memberId, {
      formId,
      rating: 4,
      comment: 'Evidence',
      isAnonymous: false,
    });
    if (!result.ok) throw new Error('setup failed');
    responseIds.push(result.id);

    await setFeedbackFormActive(adminId, formId, false);

    // `feedback_response.form_id` is ON DELETE CASCADE, so deleting the form would
    // silently destroy the evidence behind BR-008's "relevant feedback" condition.
    expect(await prisma.feedbackResponse.count({ where: { formId } })).toBe(1);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: formId, action: 'FEEDBACK_FORM_DEACTIVATED' },
    });
    expect(audit?.metadata).toMatchObject({ rowDeleted: false, retainedResponses: 1 });
  });

  it('audits the admin review read', async () => {
    await listAllFeedbackResponses(adminId);
    const audit = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: 'FEEDBACK_RESPONSES_VIEWED' },
    });
    expect(audit).not.toBeNull();
  });

  it('refuses a redundant state change', async () => {
    const formId = await newForm();
    const result = await setFeedbackFormActive(adminId, formId, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('already open');
  });
});
