import Link from 'next/link';
import { loginAction } from '@/app/(auth)/actions';

/**
 * Login form. Presentational, for the same reason as RegisterForm — see the
 * note there.
 */
export default function LoginForm({ error, status }: { error?: string; status?: string }) {
  return (
    <main className="bg-background flex h-screen max-h-screen w-full items-center justify-center overflow-hidden px-4 py-4 sm:px-6">
      <div className="w-full max-w-md rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-md sm:p-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xl font-extrabold tracking-wide text-on-surface transition-opacity hover:opacity-80"
          >
            EHEMS
          </Link>
          <span className="label-small text-on-surface-variant">Meeting Space</span>
        </div>

        <h1 className="headline-small mt-4 font-bold text-on-surface">Welcome back</h1>
        <p className="body-medium text-on-surface-variant mt-1">
          Continue your healthcare entrepreneurship journey.
        </p>

        {error ? (
          <p
            role="alert"
            className="bg-error-container border-error text-on-error-container text-label-medium mt-3 rounded-xl border px-3 py-2"
          >
            {error}
          </p>
        ) : null}

        {status === 'password-reset' ? (
          <p
            role="status"
            className="bg-primary-container text-on-primary-container mt-3 rounded-xl px-3 py-2"
          >
            Your password has been reset. Sign in with your new password.
          </p>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="label-medium text-on-surface block font-medium">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1.5 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-label-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <div>
            <label htmlFor="password" className="label-medium text-on-surface block font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1.5 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            className="bg-primary text-on-primary text-label-large hover:bg-primary/90 mt-2 w-full rounded-xl px-4 py-3 font-semibold shadow-sm transition-colors"
          >
            Log in
          </button>
        </form>

        <p className="body-medium text-on-surface-variant mt-5 text-center">
          New here?{' '}
          <Link
            href="/register"
            className="text-primary font-semibold underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
