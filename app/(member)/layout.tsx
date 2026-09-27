import Link from 'next/link';

export default function MemberLayout({ children }: { children: React.ReactNode }) {
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
