import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { roleHex } from '@/lib/theme';
import './globals.css';

/**
 * Material Design 3 uses exactly two weights, so two are shipped. The file is a
 * variable woff2 covering the full range, so the whole family costs 38KB against
 * the ~100KB budget in .agents/rules/design-system.md §Principles - which a
 * six-weight Montserrat would have blown.
 *
 * Self-hosted rather than `next/font/google`: the Google variant fetches at build
 * time, which breaks offline builds and makes CI depend on the network
 * (docs/implementation-plan.md Phase 1, step 4).
 *
 * Provisional pending ASM-001 - see docs/decisions.md D-15.
 */
const montserrat = localFont({
  src: [{ path: './fonts/montserrat-latin.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-montserrat',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
  // Latin subset only. The latin-ext file is 70KB of accented European glyphs
  // this audience has no use for, and next/font/local emits no unicode-range, so
  // including it would download it on every page load. Add it with an explicit
  // unicode-range if it is ever needed.
});

export const metadata: Metadata = {
  title: 'EHEMS — Emerging Healthcare Entrepreneurs Meeting Space',
  description:
    'Mentorship, training and certification for healthcare entrepreneurs in Nigeria. Start with O’Free, upgrade when you are ready.',
};

export const viewport: Viewport = {
  // Phase 1 ships light only. Setting color-scheme keeps form controls, scrollbars
  // and the canvas background from rendering dark-on-light.
  colorScheme: 'light',
  // A meta tag cannot reference a CSS variable, so this is derived from the token
  // source rather than typed in — see lib/theme.ts.
  themeColor: roleHex('color.role.light.primary-color'),
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme="light" is the single light-mode pin for the whole app.
    //
    // styles/tokens.css guards its dark scopes with
    // `:root:not([data-theme='light'])`, so this attribute neutralises the OS
    // `prefers-color-scheme: dark` block without touching the token build. Dark
    // mode ships by deleting this one attribute - the tokens, their contrast
    // audit, and the @custom-variant in globals.css are all already in place.
    // Nothing in JavaScript branches on the theme; the cascade owns it.
    <html lang="en-NG" data-theme="light" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
