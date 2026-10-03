import { z } from 'zod';

/**
 * Feedback is stored as a form plus a JSONB response rather than the concrete
 * `Feedback` row in PRD §16.5, because the live schema models it that way and
 * three separate forms are required (FR-051 post-session, FR-052 post-programme,
 * FR-053 mentor). A JSONB payload lets one table carry all three without three
 * near-identical tables.
 *
 * The response shape is therefore *our* contract rather than the PRD's, and it is
 * defined here once so the member form and the admin view agree:
 *
 *   rating       1-5, required — FR-051 specifies a rating plus a comment
 *   comment      free text, optional but capped
 *   isAnonymous  true hides the author from the admin review view
 *
 * `is_anonymous` is the PRD's own field on a row that also carries `user_id`, so
 * anonymity is deliberately **to the reviewer, not to the system**. `userId` is
 * always stored: it is what lets a member see their own submissions, what stops
 * one member flooding a form with duplicates, and what BR-008's "relevant
 * feedback" evidence needs to point at.
 */

/** FR-051: rating plus comment. 5-point scale, no half stars. */
export const FEEDBACK_RATING_MIN = 1;
export const FEEDBACK_RATING_MAX = 5;

export const feedbackSubmitSchema = z.object({
  formId: z.string().trim().min(1),
  rating: z.coerce.number().int().min(FEEDBACK_RATING_MIN).max(FEEDBACK_RATING_MAX),
  comment: z.string().trim().max(2000).optional().default(''),
  isAnonymous: z.boolean(),
});

export type FeedbackSubmitInput = z.infer<typeof feedbackSubmitSchema>;

export const feedbackFormCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().default(''),
  active: z.boolean().optional().default(true),
});

export type FeedbackFormCreateInput = z.infer<typeof feedbackFormCreateSchema>;

export const feedbackFormUpdateSchema = feedbackFormCreateSchema.extend({
  formId: z.string().trim().min(1),
});

export type FeedbackFormUpdateInput = z.infer<typeof feedbackFormUpdateSchema>;

/** The stored `response_data` payload, after a round trip through the database. */
export type FeedbackResponseData = {
  rating: number;
  comment: string;
  isAnonymous: boolean;
};

/**
 * Parse an untyped `response_data` back into the shape above.
 *
 * `jsonb` is untyped by definition, so a row written by an older build — or by
 * hand in psql — may not match. Anything unrecognised is coerced to a safe
 * default rather than trusted, because this value reaches an admin screen and a
 * reviewer must not be shown `undefined` where a rating should be.
 */
export function parseResponseData(value: unknown): FeedbackResponseData {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;

  const rating = Number(record.rating);
  return {
    rating:
      Number.isInteger(rating) && rating >= FEEDBACK_RATING_MIN && rating <= FEEDBACK_RATING_MAX
        ? rating
        : FEEDBACK_RATING_MIN,
    comment: typeof record.comment === 'string' ? record.comment.slice(0, 2000) : '',
    isAnonymous: record.isAnonymous === true,
  };
}
