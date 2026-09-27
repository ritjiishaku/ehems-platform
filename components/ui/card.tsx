import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Surface + border + padding. The workhorse container
 * (.agents/rules/design-system.md §Core components).
 *
 * ## Why `surface` is a variant rather than a className override
 *
 * `lib/cn.ts` concatenates strings; it is deliberately not `tailwind-merge`.
 * So a caller passing `bg-surface-container` to the old hardcoded `Card` would
 * have produced a class string containing *two* `background-color` utilities, and
 * the winner would be decided by stylesheet order inside the generated CSS, not
 * by the order they appear in the attribute. That is the opposite of the
 * predictability `cn` exists to provide, and it fails silently.
 *
 * Resolving the surface through a closed union means exactly one background,
 * border, and text role can ever be emitted - the same argument as
 * `ButtonVariant` in `button.tsx`. Adding a surface is a type error until it is
 * mapped to an audited role pair here.
 *
 * `rounded-2xl` is 1.5rem here, not Tailwind's 1rem - the radius tokens
 * override the defaults.
 */
export type CardSurface = 'lowest' | 'low' | 'container' | 'primary';

const SURFACES: Record<CardSurface, string> = {
  lowest: 'bg-surface-container-lowest border-outline-variant text-on-surface',
  low: 'bg-surface-container-low border-outline-variant text-on-surface',
  container: 'bg-surface-container border-outline-variant text-on-surface',
  primary: 'bg-primary border-primary text-on-primary',
};

const BASE =
  'flex flex-col rounded-2xl border p-6 transition duration-(--motion-duration-fast) ' +
  'ease-(--motion-easing-standard)';

export function Card({
  surface = 'low',
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { surface?: CardSurface }) {
  return <div className={cn(BASE, SURFACES[surface], className)} {...rest} />;
}

export function CardHeading({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('title-medium text-on-surface', className)} {...rest}>
      {children}
    </h3>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('body-medium text-on-surface-variant mt-1.5', className)} {...rest}>
      {children}
    </p>
  );
}

export function CardList({ children }: { children: ReactNode }) {
  return <ul className="mt-3 flex flex-col gap-1.5">{children}</ul>;
}
