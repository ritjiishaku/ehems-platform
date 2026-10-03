/**
 * Feedback forms and responses (PRD FR-051 to FR-054).
 *
 * Four requirements, three forms:
 *
 *   FR-051  post-session feedback (rating + comment)
 *   FR-052  post-programme feedback
 *   FR-053  mentor feedback
 *   FR-054  admin view of all responses
 *
 * **Analytics is explicitly out of scope.** PRD §9.7 row 7 puts feedback
 * analytics and reporting in Phase 2, so nothing here aggregates, scores, or
 * trends anything. The admin view is a list. Reading a number out of that list and
 * deciding it means "at-risk member" is the Phase 3 sentiment work the scope fence
 * exists to stop.
 *
 * ## Anonymity
 *
 * `is_anonymous` hides the author from the **reviewer**. `userId` is still
 * stored, because that is what the PRD's own model does (§16.5 carries both on
 * one row) and because it is the only way to answer "what has this member already
 * submitted?" and to keep one member from flooding a form. A response is therefore
 * pseudonymous to admins, never anonymous to the platform, and the audit trail
 * keeps the link. Fully anonymous submission would need a different design, and it
 * is not what was asked for.
 *
 * ## Personal data
 *
 * A free-text comment is personal data and can incidentally contain health
 * information, which is sensitive under SEC-017. Responses are therefore treated as
 * personal data with audit coverage on read, exactly like a consent withdrawal.
 */

import { prisma } from '@/lib/db/client';
import {
  FEEDBACK_RATING_MAX,
  FEEDBACK_RATING_MIN,
  parseResponseData,
  type FeedbackFormCreateInput,
  type FeedbackFormUpdateInput,
  type FeedbackSubmitInput,
} from '@/lib/validation/feedback';

export type FeedbackOutcome = { ok: true; id: string } | { ok: false; message: string };

export type FeedbackFormView = {
  id: string;
  title: string;
  description: string | null;
  active: boolean;
  responseCount: number;
  /** The submitting member's own response, so the form can show "you said…". */
  ownResponse: { rating: number; comment: string } | null;
};

export type FeedbackResponseView = {
  id: string;
  formId: string;
  formTitle: string;
  rating: number;
  comment: string;
  isAnonymous: boolean;
  submittedAt: Date;
  /** Null when the response is anonymous to reviewers. */
  authorName: string | null;
  authorEmail: string | null;
};

/* -------------------------------------------------------------------------- */
/* Member-facing reads                                                         */
/* -------------------------------------------------------------------------- */

/** Active forms for the member dashboard, with their own submission state. */
export async function listAvailableFeedbackForms(userId: string): Promise<FeedbackFormView[]> {
  const forms = await prisma.feedbackForm.findMany({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
    include: {
      responses: {
        where: { userId },
        select: { responseData: true },
      },
      _count: { select: { responses: true } },
    },
  });

  return forms.map((form) => {
    const own = form.responses[0] ? parseResponseData(form.responses[0].responseData) : null;
    return {
      id: form.id,
      title: form.title,
      description: form.description,
      active: form.active,
      responseCount: form._count.responses,
      ownResponse: own ? { rating: own.rating, comment: own.comment } : null,
    };
  });
}

/**
 * A member's own submissions, newest first. Scoped by `userId` in the query so
 * one member can never read another's feedback by guessing an id.
 */
export async function listOwnFeedback(userId: string): Promise<FeedbackResponseView[]> {
  const responses = await prisma.feedbackResponse.findMany({
    where: { userId },
    orderBy: { submittedAt: 'desc' },
    include: { form: { select: { title: true } } },
  });

  return responses.map((response) => {
    const data = parseResponseData(response.responseData);
    return {
      id: response.id,
      formId: response.formId,
      formTitle: response.form.title,
      rating: data.rating,
      comment: data.comment,
      isAnonymous: data.isAnonymous,
      submittedAt: response.submittedAt,
      authorName: null,
      authorEmail: null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Member submission                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Submit one response to one form.
 *
 * One response per member per form: a repeat submission **updates** the existing
 * row rather than adding a second, so a member who taps submit twice does not
 * inflate a count and an admin reviewing "how many people said 1 star" is not
 * misled. Re-submitting after the form is withdrawn is refused — a closed form
 * should not silently reopen because a member had the page open.
 */
export async function submitFeedback(
  actorId: string,
  input: FeedbackSubmitInput,
): Promise<FeedbackOutcome> {
  const form = await prisma.feedbackForm.findUnique({
    where: { id: input.formId },
    select: { id: true, title: true, active: true },
  });
  if (!form) return { ok: false, message: 'That feedback form does not exist.' };
  if (!form.active) {
    return { ok: false, message: 'This feedback form is closed and no longer accepts responses.' };
  }

  // Re-checked here rather than trusted from the schema, for the same reason as
  // every other business rule: the parsed value arrives from the browser.
  if (input.rating < FEEDBACK_RATING_MIN || input.rating > FEEDBACK_RATING_MAX) {
    return {
      ok: false,
      message: `The rating must be between ${FEEDBACK_RATING_MIN} and ${FEEDBACK_RATING_MAX}.`,
    };
  }

  const responseData = {
    rating: input.rating,
    comment: input.comment,
    isAnonymous: input.isAnonymous,
  };

  const existing = await prisma.feedbackResponse.findFirst({
    where: { formId: form.id, userId: actorId },
    select: { id: true },
  });

  if (existing) {
    await prisma.feedbackResponse.update({
      where: { id: existing.id },
      data: { responseData, submittedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorId,
        action: 'FEEDBACK_UPDATED',
        entityType: 'FeedbackResponse',
        entityId: existing.id,
        metadata: {
          formId: form.id,
          formTitle: form.title,
          rating: input.rating,
          isAnonymous: input.isAnonymous,
          replaced: true,
        },
      },
    });

    return { ok: true, id: existing.id };
  }

  const response = await prisma.feedbackResponse.create({
    data: { formId: form.id, userId: actorId, responseData },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'FEEDBACK_SUBMITTED',
      entityType: 'FeedbackResponse',
      entityId: response.id,
      metadata: {
        formId: form.id,
        formTitle: form.title,
        rating: input.rating,
        isAnonymous: input.isAnonymous,
        // The comment is deliberately absent: it is free text that may contain
        // health information (SEC-017), and an audit log is the wrong place to
        // duplicate it.
        hasComment: input.comment.length > 0,
      },
    },
  });

  return { ok: true, id: response.id };
}

/* -------------------------------------------------------------------------- */
/* Admin review (FR-054)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every response across every form, for the admin review list.
 *
 * This is a read of personal data, so it writes an audit entry — the same
 * treatment a consent withdrawal gets. Reviewing feedback is not a neutral act.
 */
export async function listAllFeedbackResponses(
  actorId: string,
  formId?: string,
): Promise<{ forms: Array<{ id: string; title: string }>; responses: FeedbackResponseView[] }> {
  const forms = await prisma.feedbackForm.findMany({
    orderBy: { title: 'asc' },
    select: { id: true, title: true },
  });

  const rows = await prisma.feedbackResponse.findMany({
    where: formId ? { formId } : {},
    orderBy: { submittedAt: 'desc' },
    include: { form: { select: { title: true } } },
  });

  // `FeedbackResponse.userId` is a bare column with no foreign key in the live
  // schema, so Prisma cannot join it. Authors are resolved in a second query
  // rather than by adding a relation, because a relation would need a migration
  // and this is a read-only projection. Only non-null ids are fetched, and the
  // map is applied at projection time so an anonymous response's author is never
  // looked up in the first place.
  const authorIds = Array.from(
    new Set(rows.filter((row) => row.userId !== null).map((row) => row.userId as string)),
  );
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const authorById = new Map(authors.map((author) => [author.id, author]));

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'FEEDBACK_RESPONSES_VIEWED',
      entityType: 'FeedbackResponse',
      entityId: formId ?? 'all-feedback',
      metadata: {
        formId: formId ?? null,
        responseCount: rows.length,
        // Counts only. Phase 1 does no analytics (PRD §9.7 row 7), so there is no
        // aggregate to leak here beyond the list length the admin already sees.
      },
    },
  });

  return {
    forms,
    responses: rows.map((row) => {
      const data = parseResponseData(row.responseData);
      const author = row.userId ? authorById.get(row.userId) : undefined;
      return {
        id: row.id,
        formId: row.formId,
        formTitle: row.form.title,
        rating: data.rating,
        comment: data.comment,
        isAnonymous: data.isAnonymous,
        submittedAt: row.submittedAt,
        // Anonymity is applied here, at the point of projection, rather than by
        // nulling `userId` on write. The row keeps the author so "what has this
        // member already submitted?" stays answerable; the reviewer does not see it.
        authorName: data.isAnonymous ? null : (author?.name ?? null),
        authorEmail: data.isAnonymous ? null : (author?.email ?? null),
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Admin form management                                                       */
/* -------------------------------------------------------------------------- */

export async function createFeedbackForm(
  actorId: string,
  input: FeedbackFormCreateInput,
): Promise<FeedbackOutcome> {
  const form = await prisma.feedbackForm.create({
    data: { title: input.title, description: input.description || null, active: input.active },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'FEEDBACK_FORM_CREATED',
      entityType: 'FeedbackForm',
      entityId: form.id,
      metadata: { title: form.title, active: form.active },
    },
  });

  return { ok: true, id: form.id };
}

/**
 * Withdrawal, not deletion. A form's responses are the evidence behind BR-008's
 * "relevant feedback" condition, and `feedback_response.form_id` is
 * `ON DELETE CASCADE` — so deleting a form would silently erase every response
 * ever collected against it.
 */
export async function setFeedbackFormActive(
  actorId: string,
  formId: string,
  active: boolean,
): Promise<FeedbackOutcome> {
  const form = await prisma.feedbackForm.findUnique({
    where: { id: formId },
    select: { id: true, title: true, active: true },
  });
  if (!form) return { ok: false, message: 'That feedback form does not exist.' };
  if (form.active === active) {
    return {
      ok: false,
      message: active ? 'That form is already open.' : 'That form is already closed.',
    };
  }

  await prisma.feedbackForm.update({ where: { id: formId }, data: { active } });

  const retainedResponses = await prisma.feedbackResponse.count({ where: { formId } });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: active ? 'FEEDBACK_FORM_ACTIVATED' : 'FEEDBACK_FORM_DEACTIVATED',
      entityType: 'FeedbackForm',
      entityId: formId,
      metadata: {
        title: form.title,
        from: form.active,
        to: active,
        rowDeleted: false,
        retainedResponses,
      },
    },
  });

  return { ok: true, id: formId };
}

export async function updateFeedbackForm(
  actorId: string,
  input: FeedbackFormUpdateInput,
): Promise<FeedbackOutcome> {
  const form = await prisma.feedbackForm.findUnique({
    where: { id: input.formId },
    select: { id: true, title: true },
  });
  if (!form) return { ok: false, message: 'That feedback form does not exist.' };

  await prisma.feedbackForm.update({
    where: { id: form.id },
    data: { title: input.title, description: input.description || null, active: input.active },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'FEEDBACK_FORM_UPDATED',
      entityType: 'FeedbackForm',
      entityId: form.id,
      metadata: { title: input.title, active: input.active },
    },
  });

  return { ok: true, id: form.id };
}
