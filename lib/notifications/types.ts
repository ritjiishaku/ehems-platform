/**
 * Notification System Types (EHEMS Phase 4)
 *
 * Channel-agnostic notification abstraction allowing features to trigger
 * notifications without binding directly to specific vendor SDKs.
 *
 * Phase 1 channels are `email` and `in_app` (PRD §18.2, CR-07). `in_app` is not a
 * transport: it writes a `Notification` row the member reads in their dashboard,
 * so it cannot fail on a third party's outage and is always attempted.
 * `sms`/`whatsapp`/`telegram` remain Phase 2 seams.
 */

export type NotificationChannel = 'email' | 'in_app' | 'sms' | 'whatsapp' | 'telegram';

export type NotificationEventType =
  | 'WELCOME_REGISTRATION'
  | 'PAYMENT_SUBMITTED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_REJECTED'
  | 'CERTIFICATE_ISSUED'
  | 'PASSWORD_RESET'
  | 'NDPA_CONSENT_WITHDRAWN';

export interface BaseRecipient {
  userId?: string;
  email: string;
  name: string;
  phoneNumber?: string;
}

export interface WelcomeRegistrationPayload {
  name: string;
  probationRoomUrl?: string;
}

export interface PaymentSubmittedPayload {
  name: string;
  tierName: string;
  amountKobo: number;
  paymentId: string;
}

export interface PaymentVerifiedPayload {
  name: string;
  tierName: string;
  enrolmentId: string;
  communityUrl?: string;
}

export interface PaymentRejectedPayload {
  name: string;
  tierName: string;
  rejectionReason: string;
}

export interface CertificateIssuedPayload {
  name: string;
  tierName: string;
  certificateId: string;
  verificationUrl: string;
}

export interface PasswordResetPayload {
  name: string;
  resetUrl: string;
}

export interface NdpaConsentWithdrawnPayload {
  name: string;
  withdrawnAt: string;
}

export type EventPayloadMap = {
  WELCOME_REGISTRATION: WelcomeRegistrationPayload;
  PAYMENT_SUBMITTED: PaymentSubmittedPayload;
  PAYMENT_VERIFIED: PaymentVerifiedPayload;
  PAYMENT_REJECTED: PaymentRejectedPayload;
  CERTIFICATE_ISSUED: CertificateIssuedPayload;
  PASSWORD_RESET: PasswordResetPayload;
  NDPA_CONSENT_WITHDRAWN: NdpaConsentWithdrawnPayload;
};

export interface SendNotificationOptions<T extends NotificationEventType> {
  event: T;
  recipient: BaseRecipient;
  payload: EventPayloadMap[T];
  channels?: NotificationChannel[];
}

export interface ChannelDeliveryResult {
  channel: NotificationChannel;
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface NotificationResult {
  eventId: string;
  success: boolean;
  deliveries: ChannelDeliveryResult[];
}
