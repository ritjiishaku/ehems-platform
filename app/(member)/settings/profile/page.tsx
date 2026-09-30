import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db/client';
import { updateProfileAction } from './actions';

export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const sessionUser = await requireSession();
  const [{ status, error }, user] = await Promise.all([
    searchParams,
    prisma.user.findUnique({ where: { id: sessionUser.id } }),
  ]);
  if (!user || user.deletedAt) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/dashboard"
        className="text-label-large text-primary underline-offset-4 hover:underline"
      >
        Back to dashboard
      </Link>
      <h1 className="headline-medium mt-5 text-on-surface">Profile settings</h1>
      <p className="body-large mt-3 text-on-surface-variant">
        Confirm your current password to save profile changes. Your email address is not changed
        here.
      </p>

      {status === 'updated' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          Your profile has been updated.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {error === 'reauthentication-failed'
            ? 'Your current password could not be verified.'
            : 'We could not update your profile. Check the fields and try again.'}
        </p>
      ) : null}

      <p className="body-medium mt-5 text-on-surface-variant">
        Email address: <span className="text-on-surface">{user.email}</span>
      </p>

      <form action={updateProfileAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="profile-name" className="label-medium text-on-surface block font-medium">
            Full name
          </label>
          <input
            id="profile-name"
            name="name"
            autoComplete="name"
            defaultValue={user.name}
            required
            minLength={2}
            maxLength={100}
            className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
          />
        </div>
        <div>
          <label htmlFor="profile-phone" className="label-medium text-on-surface block font-medium">
            Nigerian phone number
          </label>
          <input
            id="profile-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={user.phone ?? ''}
            required
            className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
          />
        </div>
        <div>
          <label
            htmlFor="profile-profession"
            className="label-medium text-on-surface block font-medium"
          >
            Profession
          </label>
          <input
            id="profile-profession"
            name="profession"
            autoComplete="organization-title"
            defaultValue={user.profession ?? ''}
            required
            minLength={2}
            maxLength={100}
            className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
          />
        </div>
        <div>
          <label
            htmlFor="profile-specialty"
            className="label-medium text-on-surface block font-medium"
          >
            Healthcare specialty (optional)
          </label>
          <input
            id="profile-specialty"
            name="healthcareSpecialty"
            defaultValue={user.healthcareSpecialty ?? ''}
            maxLength={100}
            className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
          />
        </div>
        <div>
          <label
            htmlFor="current-password"
            className="label-medium text-on-surface block font-medium"
          >
            Current password (required to save)
          </label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={200}
            className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
          />
        </div>
        <button
          type="submit"
          className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-3 font-semibold shadow-sm transition-colors"
        >
          Save profile
        </button>
      </form>
    </div>
  );
}
