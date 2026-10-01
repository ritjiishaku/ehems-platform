import Link from 'next/link';
import { requireSession } from '@/lib/auth/rbac';

/**
 * Member area shell.
 *
 * `requireSession()` runs server-side on every request under this layout, before
 * any child renders. Hiding the dashboard link in the public nav is not access
 * control — the check has to happen here, or the route is simply reachable.
 */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireSession();

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="border-b border-outline-variant bg-surface-container">
        {/* Same reflow constraint as the admin shell, and the same cause: an
            unwrapped nav row pushes the document wider than the viewport, so the
            layout viewport grows and reflow is broken. See the note in
            `app/(admin)/admin/layout.tsx`. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
          <Link href="/" className="flex items-center gap-3 text-on-surface">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-label-large text-on-primary">
              E
            </span>
            <span className="headline-small">EHEMS</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-label-large text-on-surface-variant">
            <Link href="/dashboard" className="hover:text-on-surface">
              Dashboard
            </Link>
            <Link href="/dashboard/payments" className="hover:text-on-surface">
              Payments
            </Link>
            <Link href="/" className="hover:text-on-surface">
              Public site
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
