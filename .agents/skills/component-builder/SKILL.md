---
name: component-builder
description: Build or change a React component for EHEMS — UI primitives, TierCard, StatusChip, and any new presentational or interactive piece. Use when adding a component, choosing Tailwind token classes, or reviewing a component for accessibility and token discipline.
---

# Component Builder

## Before writing code

1. **Does this already exist?** Check `components/ui/` first. Reusing a
   `Button` is better than a second `Button`.
2. **Server or client?** Default to server. Add `"use client"` only if you
   need state, effects, event handlers, or browser APIs.
3. **Where does data come from?** Server component → fetch in `lib/db/`.
   Client component → receive props, or call a server action.
4. **Mobile first.** Build at 375px, then add breakpoints.

## Colour comes from tokens, not from names you invent

Tailwind's scale is overridden by `tokens.json` and
`styles/tokens.css`. Only semantic role classes exist. There is **no**
`ink`, `state-success`, `state-warning`, `state-info`, or `state-danger` —
those were never generated, and a class that produces no CSS silently
renders unstyled. The available groups are `primary`, `secondary`,
`tertiary`, `surface*`, `on-surface*`, `outline*`, `inverse*`, and `error`,
each with their `-container` and `on-*` partners.

If a state colour you want does not exist, add a role to `tokens.json` and
let `npm run build:tokens` verify its contrast. Do not reach for a primitive —
primitives are withheld from the CSS on purpose.

## Structure

```tsx
// components/ui/status-chip.tsx
import type { PaymentStatus } from "@/lib/payments/types";
import { cn } from "@/lib/cn";

// Every pair below is audited >= 4.5:1 by npm run build:tokens.
const VARIANTS = {
  pending: {
    cls: "bg-surface-container text-on-surface-variant",
    label: "Pending",
  },
  submitted: {
    cls: "bg-primary-container text-on-primary-container",
    label: "Submitted",
  },
  under_review: {
    cls: "bg-secondary-container text-on-secondary-container",
    label: "Under review",
  },
  verified: {
    cls: "bg-primary-container text-on-primary-container",
    label: "Verified",
  },
  rejected: {
    cls: "bg-error-container text-on-error-container",
    label: "Rejected",
  },
} as const satisfies Record<PaymentStatus, { cls: string; label: string }>;

export function StatusChip({ status }: { status: PaymentStatus }) {
  const v = VARIANTS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
        v.cls,
      )}
      aria-label={`Status: ${v.label}`}
    >
      {v.label}
    </span>
  );
}
```

Note: the variant map is exhaustive over the union. Adding a new status
causes a type error until you handle it — that's the point.

The component owns this mapping, so no screen re-implements it. The
`error-container` pair is used for `rejected` rather than `--color-error`
because `--color-error` as text on a raised container misses 4.5:1 in dark
theme — see the caveat in
[design-system.md](../../rules/design-system.md).

## Rules

- **Props over globals.** A component takes what it needs. No reading
  from a global store unless it's genuinely app-wide (session).
- **No data fetching in presentational components.** Pass data down.
- **No business logic.** Tier pricing, eligibility, and completion rules
  live in `lib/`. A component calls them at most.
- **No hardcoded money.** Amounts arrive as props computed by
  `lib/pricing/`, formatted with `formatNaira()`.
- **Every list has an `EmptyState`.** No bare "No results found" text.
- **Loading states are explicit.** Use Suspense boundaries; skeletons for
  lists and cards, not spinners alone.
- **Errors are handled.** Show what happened and what to do next.
- **No hex codes, no `tailwind.config.ts` edits.** Use the generated token
  classes. If a needed value is missing, fix `tokens.json` and rebuild.

## Tier-specific components

`TierCard` is the highest-traffic component on the site. It must:

- Order correctly by `display_order`.
- **Never render Tiers II, VI, VII.** Filter at the query level so they
  cannot leak through, and add a test.
- Show discounted price with list price struck through where applicable —
  and only where the member actually qualifies (BR-005, BR-007). Whether a
  price is shown discounted is a `lib/pricing/` decision, not a card decision.
- Show the certificate count and mentorship duration.
- Mark Advanced IV as where EHEMS OPEN begins (BR-011).
- Take a `viewerContext` prop so it can show "Current tier", an upgrade
  amount, or "Subscribe" appropriately. Do not compute that inside the card;
  pass it in from `lib/pricing/`. Do not hardcode a specific naira figure in
  the component — a hardcoded ₦450,000 goes stale the moment a price changes
  and the seed test will not catch it.

## Accessibility checklist

- [ ] Semantic element (`button`, `a`, `nav`, `main`)
- [ ] Label on every input
- [ ] Keyboard reachable, visible focus
- [ ] Contrast ≥ 4.5:1 — verified by the token build, not by eye
- [ ] Status conveyed by more than colour (icon + text label, per UX-002)
- [ ] Images have `alt` (or `alt=""` if decorative)
- [ ] Works at 375px

## Testing

- Render test with representative props.
- Test the empty state.
- Test each status variant where relevant.
- Do not snapshot-test. Assert on behaviour and visible text.

