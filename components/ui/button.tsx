import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Every pair below is a role pairing the token build audits at >= 4.5:1
 * (.agents/rules/design-system.md §Colour). Adding a colour here without
 * adding an audited role to tokens.json is the failure this map exists to
 * prevent - so the variant type is a union and the map is exhaustive over it,
 * which means a new variant is a type error until it is styled and audited.
 *
 * `inverse` exists because a button on the inverted closing panel cannot be
 * restyled from the call site. `ghost` carries `text-on-surface` and
 * `border-outline`, so passing `text-on-primary` as a className would put two
 * `color` and two `border-color` utilities in one attribute, and the winner
 * would be stylesheet order rather than the order written - the failure mode
 * `lib/cn.ts` exists to avoid.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary',
  secondary: 'bg-secondary-container text-on-secondary-container',
  ghost: 'border border-outline bg-transparent text-on-surface',
  danger: 'bg-error text-on-error',
  inverse: 'border border-on-primary bg-transparent text-on-primary hover:bg-on-primary/10',
};

/**
 * The MD3 role utilities, not `text-*`.
 *
 * The previous values were `text-label-large` and `text-title-medium`. Those
 * names are `@utility` classes from `styles/type.css`, not `--font-size-*`
 * tokens, so Tailwind resolved them against the *colour* namespace, found
 * nothing, and silently emitted no rule - all three sizes rendered at the
 * inherited 16px and `size="lg"` was not larger than `size="sm"`.
 *
 * Using the role class directly is also what `.agents/rules/design-system.md`
 * asks for: one class sets size, line height, weight, and tracking together,
 * rather than stacking a size with a separate weight.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'label-medium px-3 py-2',
  md: 'label-large px-4 py-2.5',
  lg: 'title-medium px-6 py-3.5',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md ' +
  'transition-colors duration-(--motion-duration-fast) ease-(--motion-easing-standard) ' +
  'disabled:pointer-events-none disabled:opacity-50';

/** Full-width below `sm`, intrinsic above. The primary target is 375px. */
const BLOCK = 'w-full sm:w-auto';

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && BLOCK, className);
}

/**
 * A navigation action, rendered as a real `<a>`.
 *
 * Not cosmetic: a link gives keyboard and screen-reader users the destination
 * and the ability to open it in a new tab, which is why this is not a `div` with
 * an onClick (.agents/rules/design-system.md §Accessibility).
 */
type Appearance = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean };

export function LinkButton({
  variant,
  size,
  block,
  className,
  ...rest
}: Appearance & ComponentProps<typeof Link>) {
  return <Link {...rest} className={buttonClasses({ variant, size, block, className })} />;
}

export function Button({
  variant,
  size,
  block,
  className,
  type = 'button',
  children,
  ...rest
}: Appearance & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} {...rest} className={buttonClasses({ variant, size, block, className })}>
      {children}
    </button>
  );
}

export type { ReactNode };
