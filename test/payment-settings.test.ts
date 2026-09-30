import { describe, expect, it } from 'vitest';
import { resolvePaymentMode } from '@/lib/payments/mode';
import { paymentSettingsSchema } from '@/lib/validation/payment-settings';

const validSettings = {
  mode: 'disabled',
  bankName: 'EHEMS Test Bank',
  accountName: 'EHEMS Test Account',
  accountNumber: '0000000000',
  referenceFormat: 'TEST-{memberId}',
  acceptAnyBank: true,
  mobileMoneyEnabled: false,
  mobileMoneyProvider: '',
  mobileMoneyNumber: '',
  mobileMoneyAccountName: '',
  supportName: '',
  supportPhone: '',
  supportEmail: '',
  proofRetentionMonths: '24',
  currentPassword: 'correct-password',
};

describe('Super Admin payment settings boundary', () => {
  it('accepts the complete bank settings shape', () => {
    expect(paymentSettingsSchema.safeParse(validSettings).success).toBe(true);
  });

  it('requires a valid Nigerian account number shape', () => {
    const result = paymentSettingsSchema.safeParse({ ...validSettings, accountNumber: '1234' });
    expect(result.success).toBe(false);
  });

  it('requires mobile-money details when mobile money is enabled', () => {
    const result = paymentSettingsSchema.safeParse({
      ...validSettings,
      mobileMoneyEnabled: true,
      mobileMoneyProvider: '',
      mobileMoneyNumber: '',
      mobileMoneyAccountName: '',
    });
    expect(result.success).toBe(false);
  });

  it('keeps the runtime fail-closed production interlock', () => {
    expect(resolvePaymentMode('test', true).mode).toBe('disabled');
    expect(resolvePaymentMode('live', false).mode).toBe('live');
  });
});
