import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';

/**
 * Admin area shell.
 *
 * `requireRole('admin', 'super_admin')` runs server-side on every request under
 * this layout, before any child renders. This is the coarse gate; each page
 * below applies the specific §4.2 permission it needs (`payment.verify` for the
 * queue, a direct role check for data requests because §4.2 defines no
 * data-subject row — see D-18).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('admin', 'super_admin');

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="border-b border-outline-variant bg-surface-container">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3 text-on-surface">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-label-large text-on-primary">
              E
            </span>
            <span className="headline-small">EHEMS admin</span>
          </Link>

          <nav className="flex items-center gap-6 text-label-large text-on-surface-variant">
            <Link href="/admin/payments" className="hover:text-on-surface">
              Payments
            </Link>
            <Link href="/admin/attendance" className="hover:text-on-surface">
              Attendance
            </Link>
            <Link href="/admin/completion" className="hover:text-on-surface">
              Completion
            </Link>
            {user.role === 'super_admin' ? (
              <Link href="/admin/payment-settings" className="hover:text-on-surface">
                Payment settings
              </Link>
            ) : null}
            <Link href="/admin/data-requests" className="hover:text-on-surface">
              Data requests
            </Link>
            <Link href="/dashboard" className="hover:text-on-surface">
              Member area
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <p className="mx-auto max-w-6xl px-6 pt-4 text-label-small text-on-surface-variant">
          Signed in as {user.name}
        </p>
        {children}
      </main>
    </div>
  );
}
