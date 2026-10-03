import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';
import { countUnreadInApp, listInAppNotifications } from '@/lib/notifications';
import { formatDate } from '@/lib/format';
import { markAllNotificationsReadAction, markNotificationReadAction } from './actions';

export default async function MemberNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireRole('member', 'mentor', 'admin', 'super_admin');
  const query = await searchParams;
  const [notifications, unread] = await Promise.all([
    listInAppNotifications(user.id),
    countUnreadInApp(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Notifications</h1>
          <p className="body-large text-on-surface-variant mt-3">
            Updates about your payments, certificates, and account.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>

      {query.status === 'all-read' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          All notifications marked as read.
        </p>
      ) : null}

      <p className="label-large text-on-surface-variant mt-5" role="status">
        {unread === 0 ? 'No unread notifications.' : `${unread} unread.`}
      </p>

      {unread > 0 ? (
        <form action={markAllNotificationsReadAction} className="mt-3">
          <button
            type="submit"
            className="text-primary label-large underline-offset-4 hover:underline"
          >
            Mark all as read
          </button>
        </form>
      ) : null}

      <section aria-labelledby="notification-list" className="mt-6">
        <h2 id="notification-list" className="sr-only">
          Your notifications
        </h2>
        {notifications.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-3">Nothing here yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={
                  notification.read
                    ? 'bg-surface-container rounded-2xl p-4'
                    : 'bg-secondary-container rounded-2xl p-4'
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title-medium text-on-surface">
                    {notification.title}
                    {notification.read ? null : <span className="sr-only"> (unread)</span>}
                  </h3>
                  <span className="label-small text-on-surface-variant">
                    {formatDate(notification.createdAt)}
                  </span>
                </div>
                <p className="body-large text-on-surface-variant mt-1">{notification.body}</p>
                {notification.read ? null : (
                  <form action={markNotificationReadAction} className="mt-2">
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button
                      type="submit"
                      className="text-primary label-large underline-offset-4 hover:underline"
                    >
                      Mark as read
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
