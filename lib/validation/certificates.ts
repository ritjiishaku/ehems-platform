import { z } from 'zod';

/**
 * `max(40)` is not a UX guess. The largest approved catalogue entry is 27
 * certificates, so 40 cannot be exhausted by any legitimate single issuance even
 * once the missing 27th name arrives (D-5). It is a body-size ceiling.
 */
export const ISSUE_SELECTION_LIMIT = 40;

/**
 * Certificate issuance input.
 *
 * Shape only. Whether the enrolment is eligible is `lib/certificates/`'s job —
 * this schema ships to the client bundle, so a rule encoded here would be a rule an
 * attacker can read and skip (AGENTS.md §7).
 */
export const issueCertificatesSchema = z.object({
  enrolmentId: z.string().trim().min(1),
  certificateIds: z
    .array(z.string().trim().min(1))
    .min(1, 'Select at least one certificate to issue.')
    .max(ISSUE_SELECTION_LIMIT),
});

export type IssueCertificatesInput = z.infer<typeof issueCertificatesSchema>;
