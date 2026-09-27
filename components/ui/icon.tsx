import { cn } from '@/lib/cn';

/**
 * A four-icon set, hand-authored, inheriting colour from the surrounding text.
 *
 * An icon library is the obvious answer and the wrong one here: the four glyphs
 * below are ~400 bytes of path data between them, against 15-40 KB gzipped for a
 * tree-shaken subset, which is 10-20% of the entire 3G page budget
 * (`test/e2e/landing-page.spec.ts` caps the whole first load at 260 KB). Every
 * icon is decorative in this design - each one sits beside a text label that
 * carries the meaning - so the accessibility contract is the `label` prop rather
 * than a title element on every path.
 *
 * `currentColor` is a CSS keyword, not a colour literal, so these stay on the
 * right side of the ESLint rule in `eslint.config.mjs` that bans hex and
 * `rgb()`/`hsl()` in components. Colour arrives from a `text-*` role class on the
 * caller, which is the same contract as the rest of the page.
 */
export type IconName = 'spark' | 'badge' | 'users' | 'growth' | 'check' | 'shield' | 'lock';

const PATHS: Record<IconName, string[]> = {
  spark: ['M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z'],
  badge: [
    'M12 3.5a4.75 4.75 0 1 1 0 9.5 4.75 4.75 0 0 1 0-9.5z',
    'M8.9 12.4 7.5 20.5 12 18l4.5 2.5-1.4-8.1',
  ],
  users: [
    'M10 11.25a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M4.5 19.5v-1.5A3.5 3.5 0 0 1 8 14.5h4a3.5 3.5 0 0 1 3.5 3.5v1.5',
    'M16 4.4a3.5 3.5 0 0 1 0 6.7',
    'M18 14.9a3.5 3.5 0 0 1 1.5 2.9v1.7',
  ],
  growth: ['M4 17.5 9 12.5l3.5 3.5L20 8.5', 'M15 8.5h5v5'],
  check: ['M5 12.5 9.5 17 19 7'],
  shield: [
    'M12 3l7.5 3v5.4c0 4.4-3.1 8.3-7.5 9.9-4.4-1.6-7.5-5.5-7.5-9.9V6z',
    'M9 12.2l2.1 2.1 4-4',
  ],
  lock: ['M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5', 'M6 10.5h12V20H6z'],
};

export function Icon({
  name,
  label,
  className,
}: {
  name: IconName;
  /** Supply only when the icon is the sole carrier of meaning. */
  label?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      /* Sized by the caller through a token-scale class; 1em keeps it locked to
         whatever type role it sits beside rather than a second size system. */
      width="1em"
      height="1em"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={cn('shrink-0', className)}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
