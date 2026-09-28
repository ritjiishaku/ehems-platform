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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3 text-on-surface">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-label-large text-on-primary">
              E
            </span>
            <span className="headline-small">EHEMS</span>
          </Link>

          <nav className="flex items-center gap-6 text-label-large text-on-surface-variant">
            <Link href="/dashboard" className="hover:text-on-surface">
              Dashboard
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
