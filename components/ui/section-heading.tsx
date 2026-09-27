import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A section title and its supporting line.
 *
 * `aria-labelledby` is wired by the caller, not here: this component does not
 * know its own id, and guessing one would make the heading unlabelled in the
 * accessibility tree the moment two sections appear on a page.
 *
 * `eyebrow` takes a node rather than a string so the caller chooses the colour
 * pair - a `text-secondary` label is right on a light section and unreadable on
 * the inverted one.
 *
 * `headingClass` and `ledeClass` exist for the same reason. Type hierarchy is the
 * main lever this page has for looking designed, and the hero is already at
 * `display-small`; a section heading needs to sit clearly below it without
 * every section shouting at the same volume.
 *
 * `ledeClass` is not optional styling, it is a trap avoided. The default lede
 * role is `on-surface-variant`, which is a warm cream - correct on every light
 * section, and 1.29:1 on the inverted band. The token build does not catch that,
 * because `on-surface-variant` on `inverse-surface` is a cross-group pairing and
 * the audit only checks each `on-*` role against its own base. The Chromium e2e
 * run does catch it, which is why both exist.
 */
export function SectionHeading({
  title,
  lede,
  eyebrow,
  headingClass,
  ledeClass,
  align = 'start',
  className,
  titleId,
  children,
  ...rest
}: {
  title: string;
  lede?: string;
  eyebrow?: ReactNode;
  headingClass?: string;
  ledeClass?: string;
  align?: 'start' | 'center';
  titleId: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('max-w-prose', align === 'center' && 'mx-auto text-center', className)}
      {...rest}
    >
      {eyebrow}
      <h2 id={titleId} className={cn('headline-medium', headingClass ?? 'text-on-surface')}>
        {title}
      </h2>
      {lede ? (
        <p className={cn('body-large mt-4 text-pretty', ledeClass ?? 'text-on-surface-variant')}>
          {lede}
        </p>
      ) : null}
      {children}
    </div>
  );
}
