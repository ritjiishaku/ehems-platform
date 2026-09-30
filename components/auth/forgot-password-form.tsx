import Link from 'next/link';
import { requestPasswordResetAction } from '@/app/(auth)/actions';

export default function ForgotPasswordForm({ error, sent }: { error?: string; sent?: boolean }) {
  return (
    <main className="bg-background flex min-h-dvh w-full items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-md sm:p-8">
        <Link
          href="/login"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to login
        </Link>
        <h1 className="headline-small mt-5 text-on-surface">Reset your password</h1>
        <p className="body-large mt-2 text-on-surface-variant">
          Enter the email address on your account. If an account matches, we’ll send a reset link.
        </p>

        {sent ? (
          <p
            role="status"
            className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
          >
            If an account matches that address, a reset link has been sent.
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="bg-error-container text-on-error-container mt-5 rounded-xl p-4"
          >
            Please enter a valid email address and try again.
          </p>
        ) : null}

        {!sent ? (
          <form action={requestPasswordResetAction} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="reset-email"
                className="label-medium text-on-surface block font-medium"
              >
                Email address
              </label>
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
              />
            </div>
            <button
              type="submit"
              className="bg-primary text-on-primary text-label-large hover:bg-primary/90 w-full rounded-xl px-4 py-3 font-semibold shadow-sm transition-colors"
            >
              Send reset link
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
