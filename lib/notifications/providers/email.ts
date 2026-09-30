export interface SendEmailOptions {
  to: string;
  recipientName: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProviderResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  name: string;
  sendEmail(options: SendEmailOptions): Promise<EmailProviderResult>;
}

/**
 * ConsoleEmailProvider (Default Phase 1 Provider)
 *
 * Logs emails cleanly to stdout during development and testing, ensuring no
 * accidental external emails are dispatched while keeping delivery tracking testable.
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
let defaultEmailProvider: EmailProvider = new ConsoleEmailProvider();

export function getEmailProvider(): EmailProvider {
  return defaultEmailProvider;
}

export function setEmailProvider(provider: EmailProvider): void {
  defaultEmailProvider = provider;
}
