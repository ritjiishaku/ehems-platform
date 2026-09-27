---
name: design-system
description: Visual and component conventions for EHEMS — token usage, dark mode, type scale, spacing, status colour mapping, core component inventory, and WCAG 2.1 AA requirements. Use when building or reviewing any UI, styling a component, choosing a colour, or checking accessibility.
---

# Design System

> **The token pipeline is the single source of truth for colour, type,
> spacing, radius, and shadow.** `tokens.json` is the only file you hand-edit;
> `styles/tokens.css` is generated from it and must never be edited directly.

```bash
npm run build:tokens   # regenerate styles/tokens.css from tokens.json
npm run check:tokens   # fail if styles/tokens.css is stale (part of `npm run verify`)
```

The build resolves colour primitives at build time and **withholds them from
the CSS**. Only semantic role variables reach the browser, which is what makes
the light/dark switch possible. A component that references a raw hex, a
palette step, or a name like `brand.green` is a bug.

## Brand status

Brand colours and fonts are **pending client delivery** (PRD §22.1, ASM-001).
The current values in `tokens.json` are placeholders and are marked
`Provisional` in their `$description`. When the brand pack arrives, edit
`tokens.json` only, then run `npm run build:tokens` — the contrast audit runs
as part of the build and will fail the change if a new brand colour breaks
WCAG AA. Never hand-edit `styles/tokens.css` to apply brand values, and never
copy a hex into a component.

Montserrat is the declared brand face (ASM-001) and is loaded with `next/font`,
not from the generated CSS. `tokens.json` ships weights 300–800; request only
the weights a screen actually uses.

## Principles

1. **Mobile-first.** Design at 375px, then scale up. Most members are on
   mid-range Android over 3G.
2. **Low-bandwidth.** No hero video, no unoptimised images, no font files over
   ~100KB total. Use `next/image` with explicit dimensions always. Self-hosting
   Montserrat at six weights blows this budget — `next/font` subsets and caches,
   so use it rather than serving the family from `public/`.
3. **Non-technical users.** Plain language. Obvious CTAs. No jargon in UI copy.
   If a label needs a tooltip to be understood, rewrite the label.
4. **Trust.** This handles money and personal data. Show state clearly:
   pending, submitted, under review, verified, rejected. Never leave a member
   guessing.

## Colour

Use semantic roles, never primitives. The 36 role variables are:

| Group             | Roles                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Brand             | `--color-primary` · `--color-primary-container` · `--color-secondary` · `--color-secondary-container` · `--color-tertiary` · `--color-tertiary-container` |
| On-brand          | `--color-on-primary` · `--color-on-primary-container` · `--color-on-secondary` · `--color-on-secondary-container` · `--color-on-tertiary` · `--color-on-tertiary-container` |
| Surfaces          | `--color-background` · `--color-surface` · `--color-surface-dim` · `--color-surface-bright` · `--color-surface-variant` · `--color-surface-container` · `--color-surface-container-low` · `--color-surface-container-lowest` · `--color-surface-container-high` · `--color-surface-container-highest` |
| On-surface        | `--color-on-surface` · `--color-on-surface-variant` · `--color-on-background` |
| Borders           | `--color-outline` · `--color-outline-variant` |
| Inverse           | `--color-inverse-surface` · `--color-inverse-on-surface` · `--color-inverse-primary` |
| Error             | `--color-error` · `--color-on-error` · `--color-error-container` · `--color-on-error-container` |

### Dark mode

`styles/tokens.css` emits the dark palette two ways: a
`@media (prefers-color-scheme: dark)` block, and a `:root[data-theme='dark']`
block that lets a user override the system setting. A theme toggle sets
`data-theme` on `<html>`; it must set `light`, `dark`, or remove the attribute to
fall back to the system preference. Never branch on theme in JavaScript to pick
colours — the cascade handles it, and branching desynchronises the two blocks.

**Phase 1 launches light-only.** `app/layout.tsx` pins `data-theme="light"` on
`<html>`, which is the one value that beats `prefers-color-scheme: dark` in the
generated cascade. The dark blocks are still emitted and still audited, so the
dark palette cannot silently rot before the toggle ships. Remove the attribute
when the toggle lands; do not delete the dark palette to "clean up" the launch.

**Known caveat — read before using `--color-error` as text on a raised
container.** In the dark theme, `--color-error` reaches WCAG AA (≥3:1) for
non-text UI and for text on the darkest surfaces, but it does **not** reach
4.5:1 for body text on `--color-surface-container-high` or higher. The build's
contrast audit does not cover this pair, so nothing will fail. Where you need an
error message in dark theme, use the `--color-error-container` /
`--color-on-error-container` pair instead, which is designed for exactly that.

There are no `--color-success`, `--color-warning`, or `--color-info` roles. Do
not invent them by reaching for a primitive, and do not map "success" onto
`--color-primary` without checking contrast. See the status mapping below and
the open decision in `docs/decisions.md`.

## Type, spacing, radius

Type scale is the token set `font-size-xs` through `font-size-7xl` (all eleven
steps are available). Body is `font-size-base` (16px) minimum — never smaller,
for readability on cheap screens. Use the token names; the Tailwind scale is
overridden by `tokens.json`, so `text-base` and friends resolve to the token
values, not Tailwind's defaults.

### MD3 role classes — the preferred way to set type

Prefer a **role class** over stacking `text-*` with a `leading-*` and a
`tracking-*`. Each of the fifteen Material Design 3 roles is bound to a single
utility in `styles/type.css`, so one class sets size, line height, weight, and
tracking together:

`headline-large` `headline-medium` `headline-small` · `title-large`
`title-medium` `title-small` · `body-large` `body-medium` `body-small` ·
`label-large` `label-medium` `label-small`

```tsx
<h1 className="headline-medium text-on-surface">…</h1>   // correct
<h1 className="text-4xl leading-tight font-semibold">…</h1>  // avoid
```

Every role resolves to four emitted custom properties — `type-size-*`,
`type-line-height-*`, `type-weight-*`, `type-tracking-*` — and `test/build-tokens.test.js`
pins the role set, the sizes, and the unitless line heights. Adding a role means
adding it to `tokens.json` **and** `styles/type.css`, in that order, or the token
test fails.

**The flat scale is retained** for incremental text adjustment. The MD3 role
classes carry MD3's own values, which run smaller than this repo's flat scale at
the top end — `headline-medium` is 28px, not `font-size-4xl`. Roles are for
new work; the flat scale stays for the pages that already use it. Do not mix the
two on one run of text: a `text-4xl` and a `headline-medium` on adjacent
headings will not match.

**Body copy is `body-large` (16px) or larger.** The 11/12/14px roles
(`body-small`, `label-small`, and the small titles) exist for dense metadata
only — chips, table headers, helper text. Never set body copy with them.

Line heights are emitted **unitless**, so they inherit the reader's font size
rather than freezing it at 16px if a user scales text up.

### Motion

`--motion-duration-{fast,medium,slow}` and `--motion-easing-{standard,emphasized}`
come from `tokens.json` and are exposed as `duration-(--motion-duration-fast)` and
`ease-(--motion-easing-standard)`. `styles/type.css` collapses all three durations
to `0.01ms` under `prefers-reduced-motion: reduce`, so a reduced-motion user is
never served an animation that they did not ask to suppress. No new motion token
is needed for an ordinary transition.

Spacing is the token `spacing-*` scale, a **2px** base unit (steps include
0.125rem / 6px, so it is not a 4px grid). No arbitrary values except for
one-off layout fixes, which should be rare — and `no-restricted-syntax` in
`eslint.config.mjs` rejects `[...]` arbitrary values in `className` outright.

Radius: `--radius-lg` (0.75rem) for cards, `--radius-md` (0.5rem) for inputs and
buttons. These override Tailwind's defaults — `rounded-lg` here is 0.75rem, not
Tailwind's 0.5rem.

## Status colour mapping

Use consistently everywhere a payment or enrolment state appears:

| State        | Treatment                                                                |
| ------------ | ------------------------------------------------------------------------ |
| Pending      | Neutral chip on `--color-surface-container`, `--color-on-surface-variant`, no icon |
| Submitted    | Chip on `--color-primary-container` / `--color-on-primary-container`, upload icon |
| Under review | Chip on `--color-secondary-container` / `--color-on-secondary-container`, clock icon |
| Verified     | Chip on `--color-primary-container` / `--color-on-primary-container`, check icon |
| Rejected     | Chip on `--color-error-container` / `--color-on-error-container`, alert icon |

Every one of those pairings is audited by `npm run build:tokens` at ≥4.5:1, so
it is safe to copy. Introducing a new state colour means adding a role to
`tokens.json` and letting the build verify it — not picking a hex here.

**Never rely on colour alone.** Always pair with an icon and a text label
(WCAG 2.1 AA, UX-002). A member must be able to read "Under review" without
distinguishing amber from grey.

## Core components

Build these once in `components/ui/` and reuse. Do not inline variants.

- `Button` — variants `primary` | `secondary` | `ghost` | `danger`.
  Sizes `sm` | `md` | `lg`. Full-width on mobile by default.
- `Card` — surface + border + padding. The workhorse container.
- `Chip` / `StatusChip` — for payment and enrolment states. Takes a state
  enum; it owns the mapping above so no screen re-implements it.
- `Input`, `Select`, `Textarea` — with label, hint, and error slot.
- `FileUpload` — drag or tap, preview, size/type validation messaging.
- `Table` — responsive: horizontal scroll on mobile, never truncate critical
  columns like amount or status.
- `EmptyState` — icon, message, single CTA. Every list needs one.
- `TierCard` — the tier comparison unit. Takes a tier + viewer context.
- `ProgressBar` — for attendance percentage. **The threshold is a prop**, taken
  from the programme's `attendance_threshold`; it defaults to 60 (BR-008) but a
  programme may set a stricter one. Never hardcode the marker at 60% — a member
  at 65% on an 80% programme must not read the bar as eligible.

## Tier display rules

- Order by `display_order`. Never alphabetical, never by price.
- **Never render Tiers II, VI, VII.** (BR-016)
- Discounted price shows list price struck through alongside.
- O'Free is visually distinct — it's the acquisition funnel and should feel
  like the easy first step, not a degraded option.
- Advanced IV is where EHEMS OPEN benefits begin (BR-011). Make that visible on
  the card so the upgrade is desirable.

## Accessibility

- Every input has a `<label>`. Placeholder is not a label.
- Focus rings visible. Never `outline: none` without a replacement.
- Keyboard navigable end to end. Test tab order on every new screen.
- Contrast ≥ 4.5:1 for body text, 3:1 for large text and UI boundaries. The
  token build enforces the token pairs; the error-text caveat above is the one
  known gap.
- Semantic HTML. `<button>` for actions, `<a>` for navigation. Never a `div`
  with an `onClick`.
- Announce async state changes with `aria-live` where relevant.

## Copy

- Second person, active voice, sentence case.
- Button labels are verbs: "Submit payment proof", not "OK".
- Errors say what happened _and_ what to do next.
- Nigerian English spelling. Naira amounts formatted `₦375,000`, and formatted
  by `formatNaira(kobo)` from `lib/format/` — never string-built in a
  component.
