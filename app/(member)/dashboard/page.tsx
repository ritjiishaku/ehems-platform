import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="title-small text-on-surface-variant">Member area</p>
          <h1 className="headline-medium mt-2 text-on-surface">Welcome back, {user.name}</h1>
        </div>

        <Link
          href="/"
          className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-label-large text-on-primary"
        >
          View public site
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="rounded-3xl border border-outline-variant bg-surface-container p-6 shadow-sm">
          <p className="title-small text-on-surface-variant">Status</p>
          <h2 className="headline-small mt-3 text-on-surface">Active member</h2>
          <p className="body-medium mt-3 text-on-surface-variant">
            Your membership is ready for the next stage of onboarding.
          </p>
        </section>

        <section className="rounded-3xl border border-outline-variant bg-surface-container p-6 shadow-sm">
          <p className="title-small text-on-surface-variant">Progress</p>
          <h2 className="headline-small mt-3 text-on-surface">Onboarding</h2>
          <p className="body-medium mt-3 text-on-surface-variant">
            Complete your profile, payment review, and programme steps.
          </p>
        </section>

        <section className="rounded-3xl border border-outline-variant bg-surface-container p-6 shadow-sm">
          <p className="title-small text-on-surface-variant">Profile</p>
          <h2 className="headline-small mt-3 text-on-surface">{user.email}</h2>
          <p className="body-medium mt-3 text-on-surface-variant">Role: {user.role}</p>
        </section>
      </div>
    </div>
  );
}
