/**
 * Notification System Types (EHEMS Phase 4)
 *
 * Channel-agnostic notification abstraction allowing features to trigger
 * notifications without binding directly to specific vendor SDKs.
 * Primary channel in Phase 1 is `email`, with seams for `sms`, `whatsapp`, `telegram` (Phase 2).
 */

export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'telegram';

export type NotificationEventType =
  | 'WELCOME_REGISTRATION'
  | 'PAYMENT_SUBMITTED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_REJECTED'
  | 'CERTIFICATE_ISSUED'
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
