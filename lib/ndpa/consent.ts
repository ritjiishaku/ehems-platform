/**
 * NDPA consent text and version (SEC-011).
 *
 * A ConsentRecord is only meaningful alongside the exact text the person
 * agreed to. If the checkbox label on the registration form and the string
 * written to the database are separate literals, they can drift, and the
 * platform would end up holding consent to wording nobody was ever shown. So
 * both the form and the record read this one constant.
 *
 * `prisma/seed.ts` seeds the matching `consent_version` SystemSetting from
 * `CONSENT_VERSION` for the same reason.
 *
 * Bump `CONSENT_VERSION` whenever `CONSENT_TEXT` changes in substance. Existing
 * ConsentRecords keep their original version and text — a new row is written
 * when consent is re-granted, never by rewriting history (SEC-012).
 */

export const CONSENT_VERSION = '1.0';

export const CONSENT_TEXT = 'I agree to the EHEMS Terms and Privacy Policy (NDPA SEC-011 consent).';
