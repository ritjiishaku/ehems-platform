import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getMemberEntitlement, listMemberEnrolments } from '@/lib/member';
import { roleLabel } from '@/lib/permissions';
import { countUnreadInApp } from '@/lib/notifications';
import { ENROLMENT_STATUS_LABELS, type EnrolmentStatus } from '@/lib/payments';

const NAV_LINKS = [
  { href: '/dashboard/payments', label: 'Payments' },
  { href: '/dashboard/pricing', label: 'Pricing' },
  { href: '/dashboard/certificates', label: 'Certificates' },
  { href: '/dashboard/materials', label: 'Materials' },
  { href: '/dashboard/community', label: 'Community' },
  { href: '/dashboard/feedback', label: 'Feedback' },
  { href: '/dashboard/orders', label: 'Products & orders' },
  { href: '/settings/profile', label: 'Edit profile' },
  { href: '/settings/consent', label: 'Privacy and consent' },
  { href: '/settings/data-requests', label: 'Data rights' },
];

/**
 * The member overview.
 *
 * Three states, and telling them apart is most of the value of this page:
 *
 *  1. **No entitlement yet.** A `pending_payment` enrolment exists, or none at
 *     all. The member is told plainly that nothing is active, because a page that
 *     greets a non-paying visitor as "Active member" is a lie the old version of
 *     this page told.
 *  2. **Active.** Tier, attendance, and the links they can actually use.
 *  3. **Completed.** Attendance and certificates; the upgrade path opens.
 *
 * Entitlement comes from `getMemberEntitlement`, which resolves Verified + active
 * (or the D-1 free-tier exception). This page never infers it from the enrolment
 * count.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [entitlement, enrolments, unread] = await Promise.all([
    getMemberEntitlement(user.id),
    listMemberEnrolments(user.id),
    countUnreadInApp(user.id),
  ]);
  const pending = enrolments.find((enrolment) => enrolment.enrolmentStatus === 'pending_payment');

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

      <nav aria-label="Member area" className="flex flex-wrap gap-x-6 gap-y-2">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-label-large text-primary underline-offset-4 hover:underline"
          >
            {link.label}
          </Link>
        ))}
        <Link
          href="/dashboard/notifications"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Notifications
          {unread > 0 ? (
            // The count is the notification a member is most likely to want, so
            // it is announced rather than merely coloured. `aria-label` gives the
            // full sentence; the visible text stays short for a 375px nav row.
            <span
              aria-label={`${unread} unread notifications`}
              className="bg-secondary text-on-secondary ml-2 rounded-full px-2 py-0.5 label-small"
            >
              {unread}
            </span>
          ) : null}
        </Link>
      </nav>

      {entitlement.tier === null ? (
        <section
          className="mt-8 rounded-3xl border border-outline-variant bg-surface-container p-6"
          aria-labelledby="no-entitlement-heading"
        >
          <h2 id="no-entitlement-heading" className="headline-small text-on-surface">
            {pending ? 'Payment not yet verified' : 'No active membership'}
          </h2>
          <p className="body-large text-on-surface-variant mt-3">
            {pending ? (
              <>
                Your enrolment on {pending.tierName} is waiting for an EHEMS administrator to verify
                your payment. Your membership activates as soon as it is verified — nothing else is
                needed from you.
              </>
            ) : (
              <>You do not have an active membership yet. Choose a tier to get started.</>
            )}
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex items-center rounded-full bg-primary px-5 py-2 text-label-large text-on-primary"
          >
            See tiers
          </Link>
        </section>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <section
            className="rounded-3xl border border-outline-variant bg-surface-container p-6 shadow-sm"
            aria-labelledby="tier-heading"
          >
            <p className="title-small text-on-surface-variant">Your tier</p>
            <h2 id="tier-heading" className="headline-small mt-3 text-on-surface">
              {entitlement.tier.tierName}
            </h2>
            <p className="body-medium text-on-surface-variant mt-3">
              {entitlement.tier.isFree
                ? 'Free membership — community access included.'
                : entitlement.communityAccess === 'ehems_open_sales'
                  ? 'Includes EHEMS OPEN sales and marketing benefits.'
                  : 'Includes general community access.'}
            </p>
            <p className="body-medium text-on-surface-variant mt-1">
              Role: {user.role ? roleLabel(user.role) : 'Unassigned'}
            </p>
          </section>

          <section
            className="rounded-3xl border border-outline-variant bg-surface-container p-6 shadow-sm"
            aria-labelledby="progress-heading"
          >
            <p className="title-small text-on-surface-variant">Progress</p>
            <h2 id="progress-heading" className="headline-small mt-3 text-on-surface">
              {entitlement.tier.enrolmentStatus === 'completed' ? 'Completed' : 'In progress'}
            </h2>
            <p className="body-medium text-on-surface-variant mt-3">
              Attendance {entitlement.tier.attendancePercentage}% recorded.
            </p>
            <p className="body-medium text-on-surface-variant mt-1">
              {entitlement.tier.certificateEligible
                ? 'Eligible for certificates once an administrator issues them.'
                : 'Certificates are issued after an administrator marks completion.'}
            </p>
          </section>

          <section
            className="rounded-3xl border border-outline-variant bg-surface-container p-6 shadow-sm"
            aria-labelledby="profile-heading"
          >
            <p className="title-small text-on-surface-variant">Profile</p>
            <h2 id="profile-heading" className="headline-small mt-3 text-on-surface">
              {user.email}
            </h2>
            <p className="body-medium text-on-surface-variant mt-3">
              <Link
                href="/settings/profile"
                className="text-primary underline-offset-4 hover:underline"
              >
                Update your details
              </Link>
            </p>
          </section>
        </div>
      )}

      {enrolments.length > 1 ? (
        <section className="mt-10" aria-labelledby="history-heading">
          <h2 id="history-heading" className="headline-small text-on-surface">
            Membership history
          </h2>
          <ul className="mt-4 grid gap-2">
            {enrolments.map((enrolment) => (
              <li
                key={enrolment.enrolmentId}
                className="body-medium rounded-xl bg-surface-container-low px-4 py-3 text-on-surface"
              >
                {enrolment.tierName} —{' '}
                {ENROLMENT_STATUS_LABELS[enrolment.enrolmentStatus as EnrolmentStatus] ??
                  enrolment.enrolmentStatus}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
