import { z } from 'zod';
import { PAYMENT_MODES } from '@/lib/payments/mode';

/** Shape of the Super Admin payment-destination form. */
export const paymentSettingsSchema = z
  .object({
    mode: z.enum(PAYMENT_MODES),
    bankName: z.string().trim().min(1).max(120),
    accountName: z.string().trim().min(1).max(120),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{10}$/, 'Enter a 10-digit Nigerian account number.'),
    referenceFormat: z.string().trim().min(1).max(120),
    acceptAnyBank: z.boolean(),
    mobileMoneyEnabled: z.boolean(),
    mobileMoneyProvider: z.string().trim().max(120),
    mobileMoneyNumber: z.string().trim().max(40),
    mobileMoneyAccountName: z.string().trim().max(120),
    supportName: z.string().trim().max(120),
    supportPhone: z.string().trim().max(40),
    supportEmail: z.union([z.literal(''), z.string().trim().email().max(254)]),
    proofRetentionMonths: z.coerce.number().int().min(1).max(120),
    currentPassword: z.string().min(1).max(200),
  })
  .superRefine((input, context) => {
    if (!input.mobileMoneyEnabled) return;
    if (!input.mobileMoneyProvider) {
      context.addIssue({
        code: 'custom',
        path: ['mobileMoneyProvider'],
        message: 'Enter the provider.',
      });
    }
    if (!input.mobileMoneyNumber) {
      context.addIssue({
        code: 'custom',
        path: ['mobileMoneyNumber'],
        message: 'Enter the mobile-money number.',
      });
    }
    if (!input.mobileMoneyAccountName) {
      context.addIssue({
        code: 'custom',
        path: ['mobileMoneyAccountName'],
        message: 'Enter the account name.',
      });
    }
  });

export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;
