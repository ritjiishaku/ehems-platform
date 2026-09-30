import { z } from 'zod';

/**
 * How many "add a requirement" rows the review form renders. Phase 1 is manual,
 * so a fixed, small number of slots is enough; a longer list is a data question,
 * not a UI one.
 */
export const COMPLETION_REQUIREMENT_SLOTS = 5;

export const completionReviewSchema = z.object({
  enrolmentId: z.string().trim().min(1),
  performanceSatisfactory: z.boolean(),
  feedbackConsidered: z.boolean(),
  checklistIds: z.array(z.string().trim().min(1)).default([]),
  /**
   * A checklist with no rows is not a satisfied gate: BR-008 requires
   * assignments/tests/projects to be complete, and an absent requirement is not
   * evidence of completion. The admin therefore records requirements while
   * reviewing, otherwise an enrolment with no seeded checklist rows could never
   * complete.
   */
  newRequirements: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        complete: z.boolean(),
      }),
    )
    .max(COMPLETION_REQUIREMENT_SLOTS)
    .default([]),
});

export type CompletionReviewInput = z.infer<typeof completionReviewSchema>;
export type CompletionNewRequirement = CompletionReviewInput['newRequirements'][number];
