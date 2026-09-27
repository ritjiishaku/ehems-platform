import type { ReactNode } from 'react';
import Link from 'next/link';
import { LinkButton } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';

/**
 * The marketing shell at `/`.
 *
 * This layout is why a skip link is possible at all: `#main` is owned by
 * `app/(public)/page.tsx`, and every page in this group will need the same
 * header, the same measure, and the same footer.
 *
 * ## Why the header logo is text and not an image
 *
 * Three of the four files in `public/` are built for presentation, not for a
 * 64px bar. `ehems-logo.svg` and `ehems-mark.svg` draw `stroke="white"` paths
 * with no background shape behind them, so they disappear against the light
 * header. Both also set the wordmark with `<text font-family="Montserrat">`,
 * and an SVG referenced by `<img>` runs with external resources blocked, so the
 * browser silently substitutes a fallback face and the lockup no longer matches
 * the page. `ehems-logo-creative.svg` has neither problem but is a 1080x550
 * full lockup with a 18px subtitle: at header height that subtitle renders at
 * about 1px.
 *
 * So the header sets the wordmark as real text in the brand face. It is sharp at
 * any DPR, selectable, translatable, and costs nothing. The delivered creative
 * lockup still gets a full brand plate in the hero, at a size where it can
 * actually be seen. Revisit when the real brand pack lands (ASM-001 / D-15).
 */

const NAV = [
  { href: '#programmes', label: 'What you get' },
  { href: '#why', label: 'Why EHEMS' },
  { href: '#join', label: 'How to join' },
];

const FOOTER_GROUPS = [
  {
    label: 'Explore',
    links: [
      { href: '#programmes', label: 'What you get' },
      { href: '#why', label: 'Why EHEMS' },
      { href: '#join', label: 'How to join' },
    ],
  },
  {
    label: 'Membership',
    links: [
      { href: '#join', label: 'Start free' },
      { href: '#why', label: 'How payments work' },
      { href: '#programmes', label: 'Certification' },
    ],
  },
];

/**
 * A nav link. `label-large` because these are navigation, not body copy, and a
 * focus ring comes from the global `:focus-visible` rule in `app/globals.css`
 * rather than a per-link outline.
 */
function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="label-large text-on-surface-variant hover:text-on-surface rounded-md px-3 py-2 transition-colors duration-(--motion-duration-fast) ease-(--motion-easing-standard)"
    >
      {children}
    </Link>
  );
}

function SiteHeader() {
  return (
    <header className="bg-surface-container-lowest border-outline-variant sticky top-0 z-50 border-b">
      {/*
        Opaque, and deliberately so. A `backdrop-blur` header is the obvious
        "frosted glass" treatment, but axe cannot composite a backdrop-filter, so
        every colour-contrast check against it is reported as *incomplete* rather
        than passed - and `test/e2e/landing-page.spec.ts` fails the build on
        exactly that, because an undecidable contrast result is not evidence.
      */}
      <div className="mx-auto flex h-16 max-w-6xl xl:max-w-7xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="rounded-md py-2 text-on-surface transition-opacity duration-(--motion-duration-fast) hover:opacity-80"
        >
          {/* Flat font-size scale rather than a role class. The role utilities in
              `styles/type.css` set size, line-height, tracking AND weight - the
              weight via `--type-weight-*-role` - so `title-large` here would have
              put a 400 and an 800 `font-weight` in one attribute and left the
              winner to stylesheet order. A logotype is not body copy: its size
              and weight are dictated by the brand asset, so the scale is chosen
              here rather than inherited, and the class carries one property each. */}
          <span className="text-2xl font-extrabold tracking-wide">EHEMS</span>
          <span className="label-small text-on-surface-variant ml-2 hidden sm:inline">
            Meeting Space
          </span>
        </Link>

        {/* Below `md` the section links are dropped rather than hidden behind a
            hamburger: a client component menu for three anchors would ship JS
            to every visitor on 3G to save one tap. The footer carries the same
            links, and the page is four screens long. */}
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Not "Get started": `test/landing-page.test.tsx` resolves that name
            with getByRole, which throws on a second match. The hero owns it. */}
        <LinkButton href="#join" variant="primary" size="sm" className="shadow-sm">
          Join free
        </LinkButton>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-surface-container-low border-outline-variant border-t">
      <div className="mx-auto max-w-6xl xl:max-w-7xl px-6 py-12 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="text-2xl text-on-surface font-extrabold tracking-wide">EHEMS</p>
            <p className="body-medium text-on-surface-variant mt-3 max-w-prose">
              Emerging Healthcare Entrepreneurs Meeting Space. Practical learning, credible
              progress, and a community of healthcare workers building real businesses in Nigeria.
            </p>
            <p className="label-medium text-on-surface-variant mt-4">
              Membership is a one-time payment. There are no subscriptions.
            </p>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <nav key={group.label} aria-label={group.label}>
              <Eyebrow>{group.label}</Eyebrow>
              <ul className="mt-4 flex flex-col gap-1">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <NavLink href={link.href}>{link.label}</NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-outline-variant mt-10 flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="body-small text-on-surface-variant">
            Emerging Healthcare Entrepreneurs Meeting Space
          </p>
          <p className="body-small text-on-surface-variant">
            One-time payments · Admin-confirmed completion
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* First tab stop on the page. `sr-only` keeps it out of the layout until
          focused, at which point `focus:not-sr-only` reveals it. Without this,
          a keyboard user tabs through the header on every page before reaching
          the content. */}
      <a
        href="#main"
        className="bg-primary text-on-primary sr-only rounded-md px-4 py-2 focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-100"
      >
        Skip to content
      </a>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
