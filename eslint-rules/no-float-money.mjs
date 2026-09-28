/**
 * No float money literals.
 *
 * `.agents/rules/code-style.md` §Money requires "a lint rule against float
 * money literals", because the `Kobo` brand is a compile-time nudge that cannot
 * prove a value is integral — `kobo(375000.5)` typechecks today and is wrong.
 *
 * This cannot be written as `no-restricted-syntax`. ESLint's selector engine
 * only tests a regex attribute against string values, so
 * `Literal[value=/^\d+\.\d/]` silently never matches a numeric literal. That
 * version was written, probed, and found to be vacuous; a `create()` rule is the
 * only way to inspect `typeof node.value === 'number'`.
 *
 * Scoped to `lib/pricing/` (see `eslint.config.mjs`). Every price, difference,
 * and discount in the catalogue is integer kobo, so a fraction there is always a
 * mistake. This is deliberately not a repo-wide rule: a ratio, a duration, or a
 * layout fraction elsewhere is legitimate.
 */

const MESSAGE =
  'No float money literals in lib/pricing/. Money is integer kobo — write 37500050, not 375000.50.';

export const noFloatMoney = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow non-integer numeric literals in money modules, where money is integer kobo.',
    },
    schema: [],
    messages: { floatMoney: MESSAGE },
  },
  create(context) {
    return {
      Literal(node) {
        // Non-numeric literals (strings, booleans, null, regex) are irrelevant.
        if (typeof node.value !== 'number') return;
        // Number.isInteger rather than a fractional check: it also rejects
        // Infinity and NaN, which are numbers with no place in a price.
        if (Number.isInteger(node.value)) return;
        context.report({ node, messageId: 'floatMoney' });
      },
    };
  },
};
