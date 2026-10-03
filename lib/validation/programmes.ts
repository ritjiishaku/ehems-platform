import { z } from 'zod';

/**
 * Shape validation for the programme and session CMS.
 *
 * These schemas check **shape only**. The rules that actually protect the
 * business — the BR-008 attendance floor, the "an active programme needs a tier
 * mapping" rule, and the tier-removal dependency guard — live in
 * `lib/programmes/` and are deliberately *not* expressed here. A schema that
 * ships to the browser discloses its rule and can be bypassed (AGENTS.md §7), and
 * the threshold floor in particular is a completion condition: encoding it as a
 * `z.number().min(60)` would both leak the number to the client and give a false
 * impression that the server trusts the parsed value.
 */

export const SESSION_LOCATION_TYPES = ['physical', 'virtual', 'hybrid'] as const;

export type SessionLocationType = (typeof SESSION_LOCATION_TYPES)[number];

export function isSessionLocationType(value: string): value is SessionLocationType {
  return (SESSION_LOCATION_TYPES as readonly string[]).includes(value);
}

export const programmeCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().default(''),
  /**
   * Parsed as a plain bounded integer. The BR-008 floor of 60 is a business rule
   * and is enforced in `lib/programmes/`; this only rejects values that are not
   * numbers at all, so the domain layer can return a message that explains *why*
   * 60 is the floor instead of the form silently rejecting it.
   */
  attendanceThreshold: z.coerce.number().int().min(0).max(100),
});

export type ProgrammeCreateInput = z.infer<typeof programmeCreateSchema>;

export const programmeUpdateSchema = programmeCreateSchema.extend({
  active: z.boolean(),
});

export type ProgrammeUpdateInput = z.infer<typeof programmeUpdateSchema>;

/**
 * Tier ids arrive as the code catalogue's `TierId` values (BR-016). The schema
 * takes strings and lets `lib/programmes` narrow them, because the catalogue is
 * the authority and a schema-side `z.enum` would duplicate it.
 */
export const programmeTiersSchema = z.object({
  programmeId: z.string().trim().min(1),
  tierIds: z.array(z.string().trim().min(1)).min(1),
});

export type ProgrammeTiersInput = z.infer<typeof programmeTiersSchema>;

const sessionFields = {
  programmeId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().default(''),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  locationType: z.enum(SESSION_LOCATION_TYPES).default('physical'),
  locationDetails: z.string().trim().max(1000).optional().default(''),
};

export const sessionCreateSchema = z
  .object(sessionFields)
  .refine((value) => value.endsAt === undefined || value.endsAt >= value.startsAt, {
    message: 'The session cannot end before it starts.',
    path: ['endsAt'],
  });

export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;

export const sessionUpdateSchema = sessionCreateSchema.extend({
  sessionId: z.string().trim().min(1),
});

export type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>;

/**
 * Materials carry a link to a file rather than an upload. Phase 1 has no
 * object-storage pipeline for learning materials, and the PRD treats them as
 * tier-gated links, so the admin pastes the URL an admin already uploaded.
 */
export const materialCreateSchema = z.object({
  programmeId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().default(''),
  fileUrl: z.string().trim().url().max(2000),
});

export type MaterialCreateInput = z.infer<typeof materialCreateSchema>;
