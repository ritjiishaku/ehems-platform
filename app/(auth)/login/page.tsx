import Link from 'next/link';
import { loginAction } from '@/app/(auth)/actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }> | { error?: string };
}) {
  const error = searchParams && 'then' in searchParams ? undefined : searchParams?.error;

  return (
    <main className="bg-background min-h-screen px-6 py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-outline-variant bg-surface-container p-8 shadow-sm">
        <p className="title-small text-on-surface-variant">Welcome back</p>
        <h1 className="headline-small mt-3 text-on-surface">Welcome back</h1>
        <p className="body-medium mt-3 text-on-surface-variant">
          Continue your healthcare entrepreneurship journey.
        </p>

        {error ? (
          <p className="mt-4 rounded-xl border border-error bg-error-container px-3 py-2 text-label-medium text-on-error-container">
            {error}
          </p>
        ) : null}

        <form action={loginAction} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="label-medium text-on-surface">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-outline bg-surface-container-lowest px-4 py-3 text-on-surface outline-none focus:border-primary"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="label-medium text-on-surface">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl border border-outline bg-surface-container-lowest px-4 py-3 text-on-surface outline-none focus:border-primary"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            className="bg-primary text-on-primary w-full rounded-xl px-4 py-3 text-label-large"
          >
            Log in
          </button>
        </form>

        <p className="body-medium mt-6 text-center text-on-surface-variant">
          New here?{' '}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
