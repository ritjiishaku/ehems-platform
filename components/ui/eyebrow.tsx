import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * The small wide-tracked label that sits above a heading.
 *
 * Carries most of the "this page was designed" signal at 0 bytes: type contrast
 * against a `headline-*` is what separates a designed page from a wall of
 * same-sized text, and `tracking-widest` on an 11px label is the cheapest way to
 * get it.
 *
 * `label-medium` is correct here and only here. `.agents/rules/design-system.md`
 * reserves the small roles for dense metadata; an eyebrow *is* metadata, so this
 * is the sanctioned use rather than a violation.
 */
export function Eyebrow({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('label-medium tracking-widest text-secondary uppercase', className)}
      {...rest}
    />
  );
}

/**
 * The eyebrow for a band on the inverted surface, where `secondary` is a dark
 * tone and would not read.
 *
 * `inverse-primary` is the light-on-dark role from the same group, so the pairing
 * stays audited rather than being an opacity hack on a colour that works
 * elsewhere.
 */
export function EyebrowInverse({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('label-medium tracking-widest text-inverse-primary uppercase', className)}
      {...rest}
    />
  );
}
