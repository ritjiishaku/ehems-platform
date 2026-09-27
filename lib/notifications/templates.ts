import type { NotificationEventType, EventPayloadMap } from './types';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
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
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0b1d33;">Welcome to EHEMS, ${p.name}!</h2>
          <p>Thank you for joining Emerging Healthcare Entrepreneurs Meeting Space.</p>
          <p>You can now explore platform materials, review tier options, and connect with fellow healthcare entrepreneurs.</p>
          ${p.probationRoomUrl ? `<p><a href="${p.probationRoomUrl}" style="background-color: #0b1d33; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; display: inline-block;">Join Orientation Probation Room</a></p>` : ''}
          <p style="color: #666; font-size: 14px; margin-top: 30px;">EHEMS Platform · One-time payments · Practical healthcare business growth</p>
        </div>
      `;
      return { subject, html, text };
    }

    case 'PAYMENT_SUBMITTED': {
      const p = payload as EventPayloadMap['PAYMENT_SUBMITTED'];
      const subject = `Payment Submitted — ${p.tierName} (${formatNaira(p.amountKobo)})`;
      const text = `Hello ${p.name},\n\nWe have received your payment proof for ${p.tierName} (${formatNaira(p.amountKobo)}). An admin will review and verify your transaction shortly.`;
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0b1d33;">Payment Proof Received</h2>
          <p>Hello ${p.name},</p>
          <p>Your payment submission for <strong>${p.tierName}</strong> (${formatNaira(p.amountKobo)}) has been recorded (Reference: ${p.paymentId}).</p>
          <p>Our admin team will verify your transaction within 24–48 hours and activate your enrolment.</p>
        </div>
      `;
      return { subject, html, text };
    }

    case 'PAYMENT_VERIFIED': {
      const p = payload as EventPayloadMap['PAYMENT_VERIFIED'];
      const subject = `Payment Verified! Your ${p.tierName} Access is Active`;
      const text = `Hello ${p.name},\n\nGreat news! Your payment for ${p.tierName} has been verified by an admin. Your enrolment is now active.`;
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0b1d33;">Payment Verified — Access Activated</h2>
          <p>Hello ${p.name},</p>
          <p>Your payment for <strong>${p.tierName}</strong> has been successfully verified by an administrator.</p>
          <p>Your enrolment is active. Log in to your member dashboard to access your programme materials and community groups.</p>
        </div>
      `;
      return { subject, html, text };
    }

    case 'PAYMENT_REJECTED': {
      const p = payload as EventPayloadMap['PAYMENT_REJECTED'];
      const subject = `Payment Verification Update — ${p.tierName}`;
      const text = `Hello ${p.name},\n\nYour payment submission for ${p.tierName} could not be verified. Reason: ${p.rejectionReason}.\n\nYou may log in and resubmit your payment proof.`;
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #b3261e;">Payment Verification Issue</h2>
          <p>Hello ${p.name},</p>
          <p>Your payment submission for <strong>${p.tierName}</strong> could not be verified by our admin team.</p>
          <p><strong>Reason for rejection:</strong> ${p.rejectionReason}</p>
          <p>Please log in to your dashboard to resubmit your payment proof or contact support.</p>
        </div>
      `;
      return { subject, html, text };
    }

    case 'CERTIFICATE_ISSUED': {
      const p = payload as EventPayloadMap['CERTIFICATE_ISSUED'];
      const subject = `Congratulations! Certificate Issued for ${p.tierName}`;
      const text = `Hello ${p.name},\n\nCongratulations! An administrator has marked your ${p.tierName} enrolment as Completed and issued your official certificate.\n\nVerify certificate: ${p.verificationUrl}`;
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0b1d33;">Official Certificate Issued 🎉</h2>
          <p>Hello ${p.name},</p>
          <p>Congratulations! You have completed all requirements for <strong>${p.tierName}</strong>.</p>
          <p>Your official EHEMS completion certificate has been issued (Certificate ID: ${p.certificateId}).</p>
          <p><a href="${p.verificationUrl}" style="background-color: #0b1d33; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; display: inline-block;">View Verified Certificate</a></p>
        </div>
      `;
      return { subject, html, text };
    }

    case 'NDPA_CONSENT_WITHDRAWN': {
      const p = payload as EventPayloadMap['NDPA_CONSENT_WITHDRAWN'];
      const subject = 'Confirmation of NDPA Consent Withdrawal';
      const text = `Hello ${p.name},\n\nThis email confirms that your consent withdrawal request was processed on ${p.withdrawnAt}.`;
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0b1d33;">Consent Withdrawal Confirmation</h2>
          <p>Hello ${p.name},</p>
          <p>Pursuant to NDPA (SEC-012), this email confirms that your optional data processing consent was recorded as withdrawn on <strong>${p.withdrawnAt}</strong>.</p>
        </div>
      `;
      return { subject, html, text };
    }

    default:
      throw new Error(`Unsupported notification event type: ${event}`);
  }
}
