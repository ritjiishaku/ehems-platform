import Link from 'next/link';
import { resetPasswordAction } from '@/app/(auth)/actions';

export default function ResetPasswordForm({ token, error }: { token?: string; error?: string }) {
  const hasToken = Boolean(token);

  return (
    <main className="bg-background flex min-h-dvh w-full items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-md sm:p-8">
        <h1 className="headline-small text-on-surface">Choose a new password</h1>
        {error ? (
          <p
            role="alert"
            className="bg-error-container text-on-error-container mt-4 rounded-xl p-4"
          >
            This reset link is invalid or expired. Request a new link to continue.
          </p>
        ) : null}

        {hasToken ? (
          <form action={resetPasswordAction} className="mt-6 space-y-4">
            <input type="hidden" name="token" value={token} />
            <div>
              <label
                htmlFor="new-password"
                className="label-medium text-on-surface block font-medium"
              >
                New password
              </label>
              <input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
              />
            </div>
            <div>
              <label
                htmlFor="confirm-password"
                className="label-medium text-on-surface block font-medium"
              >
                Confirm new password
              </label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
              />
            </div>
            <button
              type="submit"
              className="bg-primary text-on-primary text-label-large hover:bg-primary/90 w-full rounded-xl px-4 py-3 font-semibold shadow-sm transition-colors"
            >
              Reset password
            </button>
          </form>
        ) : null}

        {!hasToken || error ? (
          <p className="body-medium mt-5 text-on-surface-variant">
            <Link
              href="/forgot-password"
              className="text-primary underline-offset-4 hover:underline"
            >
              Request another reset link
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
