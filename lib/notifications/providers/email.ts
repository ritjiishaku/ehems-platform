import { ResendEmailProvider } from './resend';
import type { EmailProvider, EmailProviderResult, SendEmailOptions } from './types';

/**
 * Email provider seam.
 *
 * Features never import a vendor SDK: they call `sendNotification` in
 * `../service`, which resolves a provider here. That is what lets SMS, WhatsApp,
 * and Telegram arrive in Phase 2 without touching feature code (AGENTS.md §7).
 *
 * The contract itself lives in `./types` so `resend.ts` can implement it without
 * importing this module, which would otherwise be a cycle.
 */

export type { SendEmailOptions, EmailProviderResult, EmailProvider } from './types';

/**
 * ConsoleEmailProvider (Default Phase 1 Provider)
 *
 * Logs emails cleanly to stdout during development and testing, ensuring no
 * accidental external emails are dispatched while keeping delivery tracking testable.
 *
 * The production refusal matters: FR-055/056/057 make these emails CONFIRMED
 * requirements, so silently succeeding in production would mean an admin rejects
 * a member's payment, no email goes out, and nothing anywhere records it.
 */
export class ConsoleEmailProvider implements EmailProvider {
  name = 'console';
  public sentEmails: SendEmailOptions[] = [];

  async sendEmail(options: SendEmailOptions): Promise<EmailProviderResult> {
    if (process.env.NODE_ENV === 'production') {
      return {
        success: false,
        error: 'Transactional email provider is not configured for production',
      };
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.sentEmails.push(options);

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[EmailProvider:${this.name}] Sent "${options.subject}" (${messageId})`);
    }

    return {
      success: true,
      messageId,
    };
  }
}

/**
 * MockFailEmailProvider (For unit testing failure paths)
 */
export class MockFailEmailProvider implements EmailProvider {
  name = 'mock-fail';

  async sendEmail(options: SendEmailOptions): Promise<EmailProviderResult> {
    void options;
    return {
      success: false,
      error: 'Simulated email provider network timeout',
    };
  }
}

// Singleton email provider instance
/**
 * Whether a real transactional provider is configured.
 *
 * Checked by the provider selector rather than inferred from `NODE_ENV`, because
 * what matters is whether the *variables* are present. A staging deploy should
 * send real mail to the tester, and a production deploy missing its key should
 * be reported as a configuration fault rather than silently logging to stdout.
 */
export function isTransactionalEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

let defaultEmailProvider: EmailProvider | null = null;

/**
 * Picks the provider for this environment.
 *
 * The console provider is used only when no transactional provider is
 * configured *and* this is not production, so its production refusal stays
 * reachable as a guard rather than becoming the default path. `setEmailProvider`
 * overrides this for tests.
 */
function selectEmailProvider(): EmailProvider {
  if (isTransactionalEmailConfigured()) return new ResendEmailProvider();
  return new ConsoleEmailProvider();
}

export function getEmailProvider(): EmailProvider {
  defaultEmailProvider ??= selectEmailProvider();
  return defaultEmailProvider;
}

export function setEmailProvider(provider: EmailProvider): void {
  defaultEmailProvider = provider;
}

/** Test-only: drop the memoised provider so the environment is re-read. */
export function resetEmailProvider(): void {
  defaultEmailProvider = null;
}
