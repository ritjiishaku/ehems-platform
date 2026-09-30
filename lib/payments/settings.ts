import { prisma } from '@/lib/db/client';
import type { PaymentSettingsInput } from '@/lib/validation/payment-settings';

export type PaymentSettingsValues = Omit<PaymentSettingsInput, 'currentPassword'>;

const SETTING_DEFINITIONS = [
  ['payment.instructions.mode', 'mode'],
  ['payment.bank.name', 'bankName'],
  ['payment.bank.account_name', 'accountName'],
  ['payment.bank.account_number', 'accountNumber'],
  ['payment.bank.reference_format', 'referenceFormat'],
  ['payment.bank.accept_any_bank', 'acceptAnyBank'],
  ['payment.mobile_money.enabled', 'mobileMoneyEnabled'],
  ['payment.mobile_money.provider', 'mobileMoneyProvider'],
  ['payment.mobile_money.number', 'mobileMoneyNumber'],
  ['payment.mobile_money.account_name', 'mobileMoneyAccountName'],
  ['payment.support.name', 'supportName'],
  ['payment.support.phone', 'supportPhone'],
  ['payment.support.email', 'supportEmail'],
  ['payment.proof.retention_months', 'proofRetentionMonths'],
] as const;

const DESCRIPTIONS: Record<string, string> = {
  'payment.instructions.mode': 'test | live | disabled. Governs payment visibility and uploads.',
  'payment.bank.name': 'Destination bank for manual member payments.',
  'payment.bank.account_name': 'Destination account name for manual member payments.',
  'payment.bank.account_number': 'Destination account number for manual member payments.',
  'payment.bank.reference_format': 'Reference format shown to members.',
  'payment.bank.accept_any_bank': 'Whether transfers from any bank are accepted.',
  'payment.mobile_money.enabled': 'Whether mobile-money payment instructions are shown.',
  'payment.mobile_money.provider': 'Accepted mobile-money provider.',
  'payment.mobile_money.number': 'Accepted mobile-money number.',
  'payment.mobile_money.account_name': 'Mobile-money account name.',
  'payment.support.name': 'Payment support contact name.',
  'payment.support.phone': 'Payment support phone number.',
  'payment.support.email': 'Payment support email address.',
  'payment.proof.retention_months': 'Retention period for payment proof files.',
};

function settingValue(value: string | boolean | number): string {
  return String(value);
}

/** Update all payment settings and record one redacted audit event atomically. */
export async function updatePaymentSettings(
  actorId: string,
  input: PaymentSettingsValues,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const keys = SETTING_DEFINITIONS.map(([key]) => key);
    const previous = await tx.systemSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    const previousValues = Object.fromEntries(
      previous.map((setting) => [setting.key, setting.value]),
    );

    for (const [key, field] of SETTING_DEFINITIONS) {
      await tx.systemSetting.upsert({
        where: { key },
        create: {
          key,
          value: settingValue(input[field]),
          description: DESCRIPTIONS[key],
          updatedBy: actorId,
        },
        update: {
          value: settingValue(input[field]),
          description: DESCRIPTIONS[key],
          updatedBy: actorId,
        },
      });
    }

    // Never put account numbers or support contact details into the audit log.
    // The setting row is the current source; the audit entry records the actor,
    // mode transition, and which keys changed without duplicating sensitive data.
    const changedKeys = keys.filter(
      (key) =>
        previousValues[key] !==
        settingValue(input[SETTING_DEFINITIONS.find(([candidate]) => candidate === key)![1]]),
    );
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'payment.settings.change',
        entityType: 'SystemSetting',
        entityId: 'payment',
        metadata: {
          changedKeys,
          oldMode: previousValues['payment.instructions.mode'] ?? '(unset)',
          newMode: input.mode,
          via: 'admin_ui',
        },
      },
    });
  });
}
