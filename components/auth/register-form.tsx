import Link from 'next/link';
import { registerAction } from '@/app/(auth)/actions';
import { CONSENT_TEXT } from '@/lib/ndpa/consent';
import PasswordInput from './password-input';
import { authInputClass } from './input-class';

/**
 * Shared input treatment for every auth form.
 *
 * The forms hand-rolled this string independently four times, which meant a
 * density change had to be applied in four places and one was usually missed.
 * Centralised here rather than in `components/ui/` because these inputs also
 * need right-hand padding for the password toggle, which is an auth concern.
 *
 * `py-2` rather than the original `py-2.5`: seven fields plus a confirm field
 * overflowed a 375px viewport, and 40px clears the WCAG 2.2 AA 24px minimum with
 * room to spare. Submit buttons keep `py-3`.
 */

/**
 * Registration form.
 *
 * Presentational on purpose: it takes the error as a prop and posts to the
 * server action, with no data access of its own. The page stays a thin wrapper
 * that awaits `searchParams`, which keeps this component synchronous and
 * therefore unit-testable — an `async` page cannot be rendered under jsdom.
 */
export default function RegisterForm({ error }: { error?: string }) {
  return (
    <main className="bg-background flex min-h-dvh w-full items-center justify-center overflow-y-auto px-4 py-8 sm:px-6">
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
          <p
            role="alert"
            className="bg-error-container border-error text-on-error-container text-label-medium mt-3 rounded-xl border px-3 py-2"
          >
            {error}
          </p>
        ) : null}

        <form action={registerAction} className="mt-5 space-y-3">
          <div>
            <label htmlFor="fullName" className="label-medium text-on-surface block font-medium">
              Full name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              className={authInputClass}
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
              className={authInputClass}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="phone" className="label-medium text-on-surface block font-medium">
              Nigerian phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              className={authInputClass}
              placeholder="08031234567 or +2348031234567"
              required
            />
          </div>

          <div>
            <label htmlFor="profession" className="label-medium text-on-surface block font-medium">
              Profession
            </label>
            <input
              id="profession"
              name="profession"
              type="text"
              autoComplete="organization-title"
              className={authInputClass}
              placeholder="Your healthcare profession"
              required
            />
          </div>

          <PasswordInput
            id="password"
            name="password"
            label="Password"
            autoComplete="new-password"
            placeholder="Create a password"
            minLength={8}
          />

          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            label="Confirm password"
            autoComplete="new-password"
            minLength={8}
          />

          <div className="flex items-start gap-2.5 pt-1">
            <input
              id="consentAccepted"
              name="consentAccepted"
              type="checkbox"
              value="true"
              className="border-outline accent-primary focus:ring-primary/20 mt-1 h-4 w-4 rounded"
              required
            />
            <label htmlFor="consentAccepted" className="body-small text-on-surface-variant">
              {CONSENT_TEXT}
            </label>
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
