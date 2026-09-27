import Link from 'next/link';
import { registerAction } from '@/app/(auth)/actions';

export default function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }> | { error?: string };
}) {
  const error = searchParams && 'then' in searchParams ? undefined : searchParams?.error;

  return (
    <main className="bg-background min-h-screen px-6 py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-outline-variant bg-surface-container p-8 shadow-sm">
        <p className="title-small text-on-surface-variant">Join EHEMS</p>
        <h1 className="headline-small mt-3 text-on-surface">Create your account</h1>
        <p className="body-medium mt-3 text-on-surface-variant">
          Start free and explore the programme before you commit to a tier.
        </p>

        {error ? (
          <p className="mt-4 rounded-xl border border-error bg-error-container px-3 py-2 text-label-medium text-on-error-container">
            {error}
          </p>
        ) : null}

        <form action={registerAction} className="mt-8 space-y-5">
          <div>
            <label htmlFor="fullName" className="label-medium text-on-surface">
              Full name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              className="mt-2 w-full rounded-xl border border-outline bg-surface-container-lowest px-4 py-3 text-on-surface outline-none focus:border-primary"
              placeholder="Your full name"
              required
            />
          </div>

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
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-outline bg-surface-container-lowest px-4 py-3 text-on-surface outline-none focus:border-primary"
              placeholder="Create a password"
              minLength={8}
              required
            />
          </div>

          <button
            type="submit"
            className="bg-primary text-on-primary w-full rounded-xl px-4 py-3 text-label-large"
          >
            Create account
          </button>
        </form>

        <p className="body-medium mt-6 text-center text-on-surface-variant">
          Already have an account?{' '}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
