/**
 * Class name merge helper.
 *
 * Deliberately tiny and dependency-free. `clsx` + `tailwind-merge` would be the
 * usual answer, but tailwind-merge resolves conflicting utilities by guessing
 * which one the author meant to win, and on a token-driven system that guess is
 * the bug: `p-4` and `p-8` both existing in the theme means a wrong merge
 * silently changes spacing rather than failing. Here the last class wins, which
 * is predictable and reviewable.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
