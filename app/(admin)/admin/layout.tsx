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
        {/* `flex-wrap` on the row and the nav is load-bearing, not tidiness.
            Without it the six links cannot fit a 375px viewport, the document
            overflows to ~766px, and the layout viewport expands to match - which
            is a WCAG 1.4.10 reflow failure and, because Chromium reports rects in
            the layout viewport while input events are dispatched in the visual
            one, it also silently breaks every Playwright click on this page. The
            marketing header drops its links below `md` instead; a shell cannot,
            because these links are the admin's only navigation and hiding them
            would need a client component, i.e. JS shipped to members on 3G. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
          <Link href="/" className="flex items-center gap-3 text-on-surface">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-label-large text-on-primary">
              E
            </span>
            <span className="headline-small">EHEMS admin</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-label-large text-on-surface-variant">
            <Link href="/admin/payments" className="hover:text-on-surface">
              Payments
            </Link>
            <Link href="/admin/attendance" className="hover:text-on-surface">
              Attendance
            </Link>
            <Link href="/admin/programmes" className="hover:text-on-surface">
              Programmes
            </Link>
            <Link href="/admin/community-links" className="hover:text-on-surface">
              Community links
            </Link>
            <Link href="/admin/feedback" className="hover:text-on-surface">
              Feedback
            </Link>
            <Link href="/admin/orders" className="hover:text-on-surface">
              Orders
            </Link>
            <Link href="/admin/completion" className="hover:text-on-surface">
              Completion
            </Link>
            <Link href="/admin/certificates" className="hover:text-on-surface">
              Certificates
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
