import { Resend } from 'resend';
import type { EmailProvider, EmailProviderResult, SendEmailOptions } from './types';

/**
 * Resend provider (production transactional email).
 *
 * Chosen over SMTP because the send is a single HTTPS call: no connection pool,
 * no retry policy to hand-roll, and no credential-shaped strings in the process
 * environment beyond one API key. The free tier's 3,000 emails a month is well
 * clear of Phase 1 volume.
 *
 * Resend is imported lazily so that neither the SDK nor a missing key can affect
 * any code path that does not send email. `lib/auth` runs during page renders;
 * a top-level `new Resend()` with an undefined key would put a provider
 * constructor on the critical path of a request that never sends mail.
 *
 * Not called directly by any feature (AGENTS.md §7): the notification service
 * owns dispatch, so swapping to another vendor is a change to this file alone.
 */

/** Resend's own limit; useful in the log when a failure is a size problem. */
const RESEND_MAX_SUBJECT_LENGTH = 998;

function isConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Sender identity. Read from the environment rather than hardcoded, because the
 * sending domain is still unresolved (CR-08) and will change. Resend only
 * accepts a domain you have verified, so this must be set alongside the API key.
 */
function sender(): string {
  const from = process.env.EMAIL_FROM?.trim() ?? '';
  const name = process.env.EMAIL_FROM_NAME?.trim();

  if (!name) return from;
  // EMAIL_FROM is documented as a bare address, but an operator pasting
  // "EHEMS <no-reply@ehems.ng>" into it is a natural mistake and the result would
  // be a mangled nested header that some MTAs reject. Detect and respect it.
  if (from.includes('<')) return from;
  return `${name} <${from}>`;
}

export class ResendEmailProvider implements EmailProvider {
  name = 'resend';

  private client(): Resend | null {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    return new Resend(key);
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailProviderResult> {
    if (!isConfigured()) {
      // Not an exception. The caller treats a failed send as non-fatal, and a
      // missing key is a deployment problem to surface in a log, not a crash in
      // the middle of someone registering.
      return {
        success: false,
        error:
          'Email is not configured. Set RESEND_API_KEY and EMAIL_FROM before accepting registrations.',
      };
    }

    const resend = this.client();
    if (!resend) {
      return { success: false, error: 'Resend API key was unreadable at send time.' };
    }

    // `from`/`subject` fall back to empty strings only to satisfy the SDK's types;
    // isConfigured() has already guaranteed both are present.
    const { data, error } = await resend.emails.send({
      from: sender(),
      to: options.to,
      subject: options.subject.slice(0, RESEND_MAX_SUBJECT_LENGTH),
      html: options.html,
      text: options.text,
    });

    if (error) {
      // Resend's message goes to the log, never to a member. It names verified
      // domains and validation internals, which is the same disclosure the auth
      // pages had before MemberSafeError.
      return { success: false, error: `Resend rejected the message: ${error.message}` };
    }

    if (!data?.id) {
      // A 2xx with no id would otherwise read as a success we cannot verify.
      return { success: false, error: 'Resend accepted the message but returned no id.' };
    }

    return { success: true, messageId: data.id };
  }
}
