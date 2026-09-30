/**
 * Payment instruction mode and its safety interlocks.
 *
 * The raw value comes from `SystemSetting`, but no caller is allowed to branch
 * directly on that string. An unknown value, a missing value, or test mode in
 * production fails closed. This is deliberately per-feature: payment screens
 * go dark while the rest of EHEMS remains available.
 */

import { getSetting, getSettings } from '../settings';

export type PaymentMode = 'test' | 'live' | 'disabled';

export const PAYMENT_MODES = ['test', 'live', 'disabled'] as const;

export const PAYMENT_SETTING_KEYS = [
  'payment.instructions.mode',
  'payment.bank.name',
  'payment.bank.account_name',
  'payment.bank.account_number',
  'payment.bank.reference_format',
  'payment.bank.accept_any_bank',
  'payment.mobile_money.enabled',
  'payment.mobile_money.provider',
  'payment.mobile_money.number',
  'payment.mobile_money.account_name',
  'payment.support.name',
  'payment.support.phone',
  'payment.support.email',
  'payment.proof.retention_months',
] as const;

export type PaymentModeState =
  | { mode: 'test'; acceptsUploads: true; showsTestBanner: true; memberVisible: true }
  | { mode: 'live'; acceptsUploads: true; showsTestBanner: false; memberVisible: true }
  | { mode: 'disabled'; acceptsUploads: false; showsTestBanner: false; memberVisible: false };

export type PaymentInstructions = {
  state: PaymentModeState;
  configured: boolean;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  referenceFormat: string | null;
  mobileMoneyEnabled: boolean;
  mobileMoneyProvider: string | null;
  mobileMoneyNumber: string | null;
  mobileMoneyAccountName: string | null;
  supportName: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
};

const MODE_STATES: Record<PaymentMode, PaymentModeState> = {
  // Test mode is visible so staging can exercise the complete member flow.
  // The UI must make the non-functional destination impossible to mistake for
  // a live account; `showsTestBanner` is not optional decoration.
  test: { mode: 'test', acceptsUploads: true, showsTestBanner: true, memberVisible: true },
  live: { mode: 'live', acceptsUploads: true, showsTestBanner: false, memberVisible: true },
  disabled: {
    mode: 'disabled',
    acceptsUploads: false,
    showsTestBanner: false,
    memberVisible: false,
  },
};

export function resolvePaymentMode(
  raw: string | null | undefined,
  isProduction: boolean,
): PaymentModeState {
  if (raw !== 'test' && raw !== 'live' && raw !== 'disabled') {
    return MODE_STATES.disabled;
  }

  if (raw === 'test' && isProduction) {
    return MODE_STATES.disabled;
  }

  return MODE_STATES[raw];
}

export async function getPaymentMode(): Promise<PaymentModeState> {
  const raw = await getSetting('payment.instructions.mode');
  if (raw !== 'test' && raw !== 'live' && raw !== 'disabled') {
    console.error('[payments] unrecognised mode, failing closed', { raw });
  } else if (raw === 'test' && process.env.NODE_ENV === 'production') {
    console.error('[payments] SECURITY: test mode active in production. Failing closed.');
  } else if (raw === 'live' && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[payments] mode=live outside production. Confirm the destination is intentional.',
    );
  }
  return resolvePaymentMode(raw, process.env.NODE_ENV === 'production');
}

/**
 * Load the destination details and apply the second fail-closed gate.
 *
 * `live` without a bank name, account name, or account number is not a usable
 * payment mode. Returning `configured: false` lets both the page and the server
 * actions refuse the flow instead of displaying a partial destination.
 */
export async function getPaymentInstructions(): Promise<PaymentInstructions> {
  const state = await getPaymentMode();
  const values = await getSettings([
    'payment.bank.name',
    'payment.bank.account_name',
    'payment.bank.account_number',
    'payment.bank.reference_format',
    'payment.mobile_money.enabled',
    'payment.mobile_money.provider',
    'payment.mobile_money.number',
    'payment.mobile_money.account_name',
    'payment.support.name',
    'payment.support.phone',
    'payment.support.email',
  ]);

  const value = (key: string): string | null => values[key] ?? null;
  const bankName = value('payment.bank.name');
  const accountName = value('payment.bank.account_name');
  const accountNumber = value('payment.bank.account_number');

  return {
    state,
    configured: Boolean(bankName && accountName && accountNumber),
    bankName,
    accountName,
    accountNumber,
    referenceFormat: value('payment.bank.reference_format'),
    mobileMoneyEnabled: value('payment.mobile_money.enabled') === 'true',
    mobileMoneyProvider: value('payment.mobile_money.provider'),
    mobileMoneyNumber: value('payment.mobile_money.number'),
    mobileMoneyAccountName: value('payment.mobile_money.account_name'),
    supportName: value('payment.support.name'),
    supportPhone: value('payment.support.phone'),
    supportEmail: value('payment.support.email'),
  };
}
