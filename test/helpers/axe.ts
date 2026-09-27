import { axe } from 'vitest-axe';
import type { AxeResults } from 'axe-core';

/**
 * Asserts that a rendered container has no axe violations.
 *
 * `axe` is called directly rather than through the `toHaveNoViolations` matcher:
 * vitest-axe 0.1.0 ships an empty `dist/extend-expect.js` and declares the
 * matcher as `export type`, so neither the auto-registration nor the typed import
 * works. Calling `axe()` and throwing on a non-empty violation list is also better
 * on failure - the message names the rule, the impact, and the offending
 * selectors, instead of dumping the whole result object.
 *
 * ## What this does NOT cover
 *
 * jsdom has no canvas, and axe-core computes the `color-contrast` rule by
 * rasterising text onto one. Under jsdom that rule always comes back as
 * *incomplete* ("Axe encountered an error"), never as a violation - so a green
 * result here says nothing about contrast.
 *
 * Colour contrast is verified in two other places, and this function is not one
 * of them:
 *   1. `scripts/build-tokens.js` audits all 102 role pairs against WCAG 2.1 AA
 *      at build time (`npm run check:tokens`). This is the authoritative check
 *      and is deterministic.
 *   2. The Playwright suite runs axe in real Chromium, where canvas exists and
 *      contrast is genuinely evaluated against rendered pixels.
 *
 * So this function guards ARIA, roles, names, heading order, and semantics. It
 * must not be cited as evidence of colour compliance.
 */
export async function expectNoAxeViolations(container: HTMLElement): Promise<AxeResults> {
  const results = await axe(container);

  if (results.violations.length > 0) {
    const detail = results.violations
      .map((violation) => {
        const targets = violation.nodes.map((node) => node.target.join(' ')).join('\n      ');
        return `  [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n      ${targets}`;
      })
      .join('\n');

    throw new Error(
      `Expected no accessibility violations, found ${results.violations.length}:\n${detail}`,
    );
  }

  return results;
}

/** Rule ids that could not be decided in this environment, for transparency. */
export function undecidedRules(results: AxeResults): string[] {
  return results.incomplete.map((result) => result.id);
}
