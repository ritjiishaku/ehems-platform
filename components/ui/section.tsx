import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The page section primitive: one rhythm, one measure, one place to change it.
 *
 * Every marketing section was repeating `mx-auto max-w-5xl px-6 py-16 sm:py-20`
 * inline. That is the variant-inlining `.agents/rules/design-system.md` warns
 * against, and it is why vertical spacing drifted between sections.
 *
 * `tone` is an elevation, not a colour. Mapping it through a closed union is what
 * keeps a section from reaching for a raw surface role: adding a tone is a type
 * error until someone has decided which audited role it resolves to.
 */
export type SectionTone = 'background' | 'lowest' | 'low' | 'inverse';

const TONES: Record<SectionTone, string> = {
  background: 'bg-background text-on-surface',
  lowest: 'bg-surface-container-lowest text-on-surface',
  low: 'bg-surface-container-low text-on-surface',
  inverse: 'bg-inverse-surface text-inverse-on-surface',
};

const WIDTHS = {
  default: 'max-w-6xl xl:max-w-7xl',
  wide: 'max-w-6xl xl:max-w-7xl',
} as const;

/** `py-16` on a 375px phone, opening up to `lg:py-24` on a desktop. */
const RHYTHM = 'py-16 sm:py-20 lg:py-24';

export type SectionProps = {
  /** The id of the heading that names this section, wired to `aria-labelledby`. */
  labelledBy: string;
  id?: string;
  tone?: SectionTone;
  width?: keyof typeof WIDTHS;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function Section({
  labelledBy,
  id,
  tone = 'background',
  width = 'default',
  className,
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(TONES[tone], RHYTHM, 'px-6', className)}
      {...rest}
    >
      <div className={cn('mx-auto', WIDTHS[width])}>{children}</div>
    </section>
  );
}

/**
 * A band whose colour runs edge to edge while its content stays on the same
 * measure as the sections around it.
 *
 * For the hero and the inverted assurance band, where a full-bleed background is
 * the point but the text must still line up. A band doing its own padding drifts
 * off the grid by a few pixels, which reads as careless.
 */
export type BandProps = {
  labelledBy: string;
  id?: string;
  tone?: SectionTone;
  width?: keyof typeof WIDTHS;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function Band({
  labelledBy,
  id,
  tone = 'background',
  width = 'default',
  className,
  children,
  ...rest
}: BandProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(TONES[tone], className)} {...rest}>
      <div className={cn('mx-auto w-full px-6', WIDTHS[width])}>{children}</div>
    </section>
  );
}
