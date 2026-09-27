import { z } from 'zod';

export const recipientSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email('Invalid recipient email address'),
  name: z.string().min(1, 'Recipient name is required'),
  phoneNumber: z.string().optional(),
});

export const welcomeRegistrationPayloadSchema = z.object({
  name: z.string().min(1),
  probationRoomUrl: z.string().url().optional(),
});

export const paymentSubmittedPayloadSchema = z.object({
  name: z.string().min(1),
  tierName: z.string().min(1),
  amountKobo: z.number().int().nonnegative(),
  paymentId: z.string().min(1),
});

export const paymentVerifiedPayloadSchema = z.object({
  name: z.string().min(1),
  tierName: z.string().min(1),
  enrolmentId: z.string().min(1),
  communityUrl: z.string().url().optional(),
});

export const paymentRejectedPayloadSchema = z.object({
  name: z.string().min(1),
  tierName: z.string().min(1),
  rejectionReason: z.string().min(1),
});

export const certificateIssuedPayloadSchema = z.object({
  name: z.string().min(1),
  tierName: z.string().min(1),
  certificateId: z.string().min(1),
  verificationUrl: z.string().url(),
});

export const ndpaConsentWithdrawnPayloadSchema = z.object({
  name: z.string().min(1),
  withdrawnAt: z.string().min(1),
});
