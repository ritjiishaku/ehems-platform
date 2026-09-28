import type { NotificationEventType, EventPayloadMap } from './types';
import { roleHex } from '../theme';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Colours for transactional email.
 *
 * Email clients get no stylesheet, so `var(--color-primary)` is not an option —
 * the values have to be literals. They are still resolved from `tokens.json`
 * rather than typed in: hardcoding a hex here duplicates the palette outside the
 * one file the contrast audit reads, so a brand change would leave every
 * transactional email on the old colours with nothing failing (AGENTS.md §6,
 * D-15). `roleHex` walks the same reference chain `scripts/build-tokens.js`
 * does, so these track the audit.
 *
 * The roles are the audited light-theme pairs: text on background, and
 * on-primary on primary for the call-to-action button.
 */
const EMAIL_COLOR = {
  heading: roleHex('color.role.light.on-surface-color'),
  muted: roleHex('color.role.light.on-surface-variant-color'),
  error: roleHex('color.role.light.error-color'),
  buttonBg: roleHex('color.role.light.primary-color'),
  buttonText: roleHex('color.role.light.on-primary-color'),
} as const;

/** Escapes text interpolated into HTML. A rejection reason or a member name is
 * user-supplied, and an unescaped `<` in either would break the markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function button(href: string, label: string): string {
  return `<p><a href="${escapeHtml(href)}" style="background-color: ${EMAIL_COLOR.buttonBg}; color: ${EMAIL_COLOR.buttonText}; padding: 10px 20px; text-decoration: none; border-radius: 8px; display: inline-block;">${escapeHtml(label)}</a></p>`;
}

/** Wraps a body in the shared shell so every template has one layout. */
function shell(heading: string, headingColor: string, body: string): string {
  return `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: ${headingColor};">${escapeHtml(heading)}</h2>
          ${body}
          <p style="color: ${EMAIL_COLOR.muted}; font-size: 14px; margin-top: 30px;">EHEMS Platform · One-time payments · Practical healthcare business growth</p>
        </div>
      `;
}

function formatNaira(amountKobo: number): string {
  const naira = (amountKobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `₦${naira}`;
}

export function renderEmailTemplate<T extends NotificationEventType>(
  event: T,
  payload: EventPayloadMap[T],
): RenderedEmail {
  switch (event) {
    case 'WELCOME_REGISTRATION': {
      const p = payload as EventPayloadMap['WELCOME_REGISTRATION'];
      const subject = 'Welcome to EHEMS — Emerging Healthcare Entrepreneurs Meeting Space';
      const text = `Hello ${p.name},\n\nWelcome to EHEMS! Your account has been registered. Explore your dashboard to review the brochure, FAQ, and tier options.`;
      const cta = p.probationRoomUrl
        ? button(p.probationRoomUrl, 'Join Orientation Probation Room')
        : '';
      const html = shell(
        `Welcome to EHEMS, ${p.name}!`,
        EMAIL_COLOR.heading,
        `<p>Thank you for joining Emerging Healthcare Entrepreneurs Meeting Space.</p>
          <p>You can now explore platform materials, review tier options, and connect with fellow healthcare entrepreneurs.</p>
          ${cta}`,
      );
      return { subject, html, text };
    }

    case 'PAYMENT_SUBMITTED': {
      const p = payload as EventPayloadMap['PAYMENT_SUBMITTED'];
      const subject = `Payment Submitted — ${p.tierName} (${formatNaira(p.amountKobo)})`;
      const text = `Hello ${p.name},\n\nWe have received your payment proof for ${p.tierName} (${formatNaira(p.amountKobo)}). An admin will review and verify your transaction shortly.`;
      const html = shell(
        'Payment Proof Received',
        EMAIL_COLOR.heading,
        `<p>Hello ${escapeHtml(p.name)},</p>
          <p>Your payment submission for <strong>${escapeHtml(p.tierName)}</strong> (${formatNaira(p.amountKobo)}) has been recorded (Reference: ${escapeHtml(p.paymentId)}).</p>
          <p>Our admin team will verify your transaction within 24–48 hours and activate your enrolment.</p>`,
      );
      return { subject, html, text };
    }

    case 'PAYMENT_VERIFIED': {
      const p = payload as EventPayloadMap['PAYMENT_VERIFIED'];
      const subject = `Payment Verified! Your ${p.tierName} Access is Active`;
      const text = `Hello ${p.name},\n\nGreat news! Your payment for ${p.tierName} has been verified by an admin. Your enrolment is now active.`;
      const html = shell(
        'Payment Verified — Access Activated',
        EMAIL_COLOR.heading,
        `<p>Hello ${escapeHtml(p.name)},</p>
          <p>Your payment for <strong>${escapeHtml(p.tierName)}</strong> has been successfully verified by an administrator.</p>
          <p>Your enrolment is active. Log in to your member dashboard to access your programme materials and community groups.</p>`,
      );
      return { subject, html, text };
    }

    case 'PAYMENT_REJECTED': {
      const p = payload as EventPayloadMap['PAYMENT_REJECTED'];
      const subject = `Payment Verification Update — ${p.tierName}`;
      const text = `Hello ${p.name},\n\nYour payment submission for ${p.tierName} could not be verified. Reason: ${p.rejectionReason}.\n\nYou may log in and resubmit your payment proof.`;
      const html = shell(
        'Payment Verification Issue',
        EMAIL_COLOR.error,
        `<p>Hello ${escapeHtml(p.name)},</p>
          <p>Your payment submission for <strong>${escapeHtml(p.tierName)}</strong> could not be verified by our admin team.</p>
          <p><strong>Reason for rejection:</strong> ${escapeHtml(p.rejectionReason)}</p>
          <p>Please log in to your dashboard to resubmit your payment proof or contact support.</p>`,
      );
      return { subject, html, text };
    }

    case 'CERTIFICATE_ISSUED': {
      const p = payload as EventPayloadMap['CERTIFICATE_ISSUED'];
      const subject = `Congratulations! Certificate Issued for ${p.tierName}`;
      const text = `Hello ${p.name},\n\nCongratulations! An administrator has marked your ${p.tierName} enrolment as Completed and issued your official certificate.\n\nVerify certificate: ${p.verificationUrl}`;
      const html = shell(
        'Official Certificate Issued',
        EMAIL_COLOR.heading,
        `<p>Hello ${escapeHtml(p.name)},</p>
          <p>Congratulations! You have completed all requirements for <strong>${escapeHtml(p.tierName)}</strong>.</p>
          <p>Your official EHEMS completion certificate has been issued (Certificate ID: ${escapeHtml(p.certificateId)}).</p>
          ${button(p.verificationUrl, 'View Verified Certificate')}`,
      );
      return { subject, html, text };
    }

    case 'NDPA_CONSENT_WITHDRAWN': {
      const p = payload as EventPayloadMap['NDPA_CONSENT_WITHDRAWN'];
      const subject = 'Confirmation of NDPA Consent Withdrawal';
      const text = `Hello ${p.name},\n\nThis email confirms that your consent withdrawal request was processed on ${p.withdrawnAt}.`;
      const html = shell(
        'Consent Withdrawal Confirmation',
        EMAIL_COLOR.heading,
        `<p>Hello ${escapeHtml(p.name)},</p>
          <p>Pursuant to NDPA (SEC-012), this email confirms that your optional data processing consent was recorded as withdrawn on <strong>${escapeHtml(p.withdrawnAt)}</strong>.</p>`,
      );
      return { subject, html, text };
    }

    default:
      throw new Error(`Unsupported notification event type: ${event}`);
  }
}
