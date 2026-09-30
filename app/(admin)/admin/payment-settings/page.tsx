import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';
import { getSettings } from '@/lib/settings';
import { PAYMENT_SETTING_KEYS } from '@/lib/payments/mode';
import { updatePaymentSettingsAction } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  'invalid-input': 'Check the settings and try again.',
  'reauthentication-failed': 'That was not your password. No settings were changed.',
};

export default async function PaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  await requireRole('super_admin');
  const [query, values] = await Promise.all([searchParams, getSettings(PAYMENT_SETTING_KEYS)]);
  const value = (key: string): string => values[key] ?? '';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Payment settings</h1>
          <p className="body-large text-on-surface-variant mt-3">
            Configure the destination members see and the mode that controls whether payment
            submissions are accepted.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to admin
        </Link>
      </div>

      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {ERROR_MESSAGES[query.error] ?? query.error}
        </p>
      ) : null}
      {query.status === 'updated' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Payment settings updated. The new mode and destination are active for the next request.
        </p>
      ) : null}

      <form action={updatePaymentSettingsAction} className="mt-8 space-y-8">
        <fieldset className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <legend className="title-large text-on-surface px-1">Mode</legend>
          <p className="body-medium text-on-surface-variant mt-1">
            Test mode is only allowed outside production. Disabled mode fails closed and prevents
            paid purchases and proof uploads.
          </p>
          <label htmlFor="mode" className="label-medium text-on-surface mt-4 block font-medium">
            Payment instruction mode
          </label>
          <select
            id="mode"
            name="mode"
            defaultValue={value('payment.instructions.mode') || 'disabled'}
            className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2 sm:max-w-sm"
          >
            <option value="disabled">Disabled</option>
            <option value="test">Test (non-functional details)</option>
            <option value="live">Live</option>
          </select>
        </fieldset>

        <fieldset className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <legend className="title-large text-on-surface px-1">Bank transfer</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <SettingInput
              id="bankName"
              name="bankName"
              label="Bank name"
              value={value('payment.bank.name')}
              required
            />
            <SettingInput
              id="accountName"
              name="accountName"
              label="Account name"
              value={value('payment.bank.account_name')}
              required
            />
            <SettingInput
              id="accountNumber"
              name="accountNumber"
              label="Account number"
              value={value('payment.bank.account_number')}
              inputMode="numeric"
              required
            />
            <SettingInput
              id="referenceFormat"
              name="referenceFormat"
              label="Reference format"
              value={value('payment.bank.reference_format')}
              required
            />
          </div>
          <label className="label-large text-on-surface mt-5 flex items-center gap-3">
            <input
              type="checkbox"
              name="acceptAnyBank"
              value="true"
              defaultChecked={value('payment.bank.accept_any_bank') === 'true'}
              className="h-5 w-5 rounded border-outline accent-primary"
            />
            Accept transfers from any bank
          </label>
        </fieldset>

        <fieldset className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <legend className="title-large text-on-surface px-1">Mobile money</legend>
          <label className="label-large text-on-surface mt-4 flex items-center gap-3">
            <input
              type="checkbox"
              name="mobileMoneyEnabled"
              value="true"
              defaultChecked={value('payment.mobile_money.enabled') === 'true'}
              className="h-5 w-5 rounded border-outline accent-primary"
            />
            Show mobile-money instructions
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <SettingInput
              id="mobileMoneyProvider"
              name="mobileMoneyProvider"
              label="Provider"
              value={value('payment.mobile_money.provider')}
            />
            <SettingInput
              id="mobileMoneyNumber"
              name="mobileMoneyNumber"
              label="Number"
              value={value('payment.mobile_money.number')}
              inputMode="tel"
            />
            <SettingInput
              id="mobileMoneyAccountName"
              name="mobileMoneyAccountName"
              label="Account name"
              value={value('payment.mobile_money.account_name')}
            />
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <legend className="title-large text-on-surface px-1">Support and retention</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <SettingInput
              id="supportName"
              name="supportName"
              label="Support name"
              value={value('payment.support.name')}
            />
            <SettingInput
              id="supportPhone"
              name="supportPhone"
              label="Support phone"
              value={value('payment.support.phone')}
              inputMode="tel"
            />
            <SettingInput
              id="supportEmail"
              name="supportEmail"
              label="Support email"
              value={value('payment.support.email')}
              type="email"
            />
            <SettingInput
              id="proofRetentionMonths"
              name="proofRetentionMonths"
              label="Proof retention (months)"
              value={value('payment.proof.retention_months') || '24'}
              inputMode="numeric"
              type="number"
              min="1"
              max="120"
              required
            />
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <legend className="title-large text-on-surface px-1">Confirm change</legend>
          <p className="body-medium text-on-surface-variant mt-1">
            Changing payment destinations is money-adjacent. Re-enter your password to save; the
            audit log records your user ID and the keys changed, but never account numbers.
          </p>
          <SettingInput
            id="currentPassword"
            name="currentPassword"
            label="Your password"
            type="password"
            autoComplete="current-password"
            value=""
            required
          />
        </fieldset>

        <button
          type="submit"
          className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-6 py-3 font-semibold shadow-sm transition-colors"
        >
          Save payment settings
        </button>
      </form>
    </div>
  );
}

function SettingInput({
  id,
  name,
  label,
  value,
  type = 'text',
  inputMode,
  autoComplete,
  min,
  max,
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  type?: string;
  inputMode?: 'numeric' | 'tel';
  autoComplete?: string;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="label-medium text-on-surface block font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        min={min}
        max={max}
        required={required}
        className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
      />
    </div>
  );
}
