/**
 * The email provider seam.
 *
 * Split out of `email.ts` so that a provider implementation can depend on the
 * contract without importing the selector. Keeping the interfaces in the same
 * file as `getEmailProvider` would make `email.ts` import `resend.ts` for the
 * factory and `resend.ts` import `email.ts` for the types — a cycle between the
 * seam and its implementation.
 */

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
