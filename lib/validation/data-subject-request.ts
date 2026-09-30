import { z } from 'zod';
import { DATA_SUBJECT_REQUEST_STATUSES, DATA_SUBJECT_REQUEST_TYPES } from '@/lib/ndpa/types';

export const dataSubjectRequestSchema = z.object({
  requestType: z.enum(DATA_SUBJECT_REQUEST_TYPES),
});

/**
 * Shape check for an admin handling a request.
 *
 * Whether notes are *required* is a business rule and lives in
 * `lib/ndpa/dsr-state.ts` — a rule in a schema would ship to the client and
 * could be bypassed by calling the action directly.
 */
export const dataSubjectRequestHandlingSchema = z.object({
  requestId: z.string().trim().min(1, 'A request must be selected.'),
  to: z.enum(DATA_SUBJECT_REQUEST_STATUSES),
  notes: z.string().trim().max(2000, 'Keep handling notes under 2000 characters.').optional(),
});

export type DataSubjectRequestHandlingInput = z.infer<typeof dataSubjectRequestHandlingSchema>;
