'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { verifyCurrentPassword } from '@/lib/auth/profile';
import { requireRole } from '@/lib/auth/rbac';
import { updatePaymentSettings } from '@/lib/payments/settings';
import { paymentSettingsSchema } from '@/lib/validation/payment-settings';

export async function updatePaymentSettingsAction(formData: FormData): Promise<void> {
  const admin = await requireRole('super_admin');
  await assertSameOrigin();

  const parsed = paymentSettingsSchema.safeParse({
    mode: formData.get('mode'),
    bankName: formData.get('bankName'),
    accountName: formData.get('accountName'),
    accountNumber: formData.get('accountNumber'),
    referenceFormat: formData.get('referenceFormat'),
    acceptAnyBank: formData.get('acceptAnyBank') === 'true',
    mobileMoneyEnabled: formData.get('mobileMoneyEnabled') === 'true',
    mobileMoneyProvider: formData.get('mobileMoneyProvider'),
    mobileMoneyNumber: formData.get('mobileMoneyNumber'),
    mobileMoneyAccountName: formData.get('mobileMoneyAccountName'),
    supportName: formData.get('supportName'),
    supportPhone: formData.get('supportPhone'),
    supportEmail: formData.get('supportEmail'),
    proofRetentionMonths: formData.get('proofRetentionMonths'),
    currentPassword: formData.get('currentPassword'),
  });

  if (!parsed.success) {
    redirect('/admin/payment-settings?error=invalid-input');
  }

  if (!(await verifyCurrentPassword(admin.id, parsed.data.currentPassword))) {
    redirect('/admin/payment-settings?error=reauthentication-failed');
  }

  await updatePaymentSettings(admin.id, parsed.data);
  redirect('/admin/payment-settings?status=updated');
}
