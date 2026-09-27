import Link from 'next/link';
import { registerAction } from '@/app/(auth)/actions';

export default function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }> | { error?: string };
}) {
  const error = searchParams && 'then' in searchParams ? undefined : searchParams?.error;

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
          <span className="label-small text-on-surface-variant font-medium">Join EHEMS</span>
        </div>

        <h1 className="headline-small mt-4 font-bold text-on-surface">Create your account</h1>
        <p className="body-medium text-on-surface-variant mt-1">
          Start free and explore the programme before you commit to a tier.
        </p>

        {error ? (
          <p className="bg-error-container border-error text-on-error-container text-label-medium mt-3 rounded-xl border px-3 py-2">
            {error}
          </p>
        ) : null}

        <form action={registerAction} className="mt-5 space-y-3.5">
          <div>
            <label htmlFor="fullName" className="label-medium text-on-surface block font-medium">
              Full name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
              placeholder="Your full name"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="label-medium text-on-surface block font-medium">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="label-medium text-on-surface block font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
              placeholder="Create a password"
              minLength={8}
              required
            />
          </div>

          <button
            type="submit"
            className="bg-primary text-on-primary text-label-large hover:bg-primary/90 mt-1 w-full rounded-xl px-4 py-3 font-semibold shadow-sm transition-colors"
          >
            Create account
          </button>
        </form>

        <p className="body-medium text-on-surface-variant mt-5 text-center">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-primary font-semibold underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
