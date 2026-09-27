# Workflow: New Component

Use when adding a new React component or screen.

## Steps

1. **Search first.** Check `components/ui/` and `components/` for an
   existing component you can reuse or extend. Check
   [design-system.md](../rules/design-system.md) for the core list.

2. **Decide server or client.** Server unless you need state, effects,
   event handlers, or browser APIs. If client, keep it leaf-most.

3. **Identify the data.** Server component → query via `lib/db/`. Client
   component → props or server action. No ad-hoc fetches in components.

4. **Check for business rules.** If the component displays tier pricing,
   eligibility, completion status, or attendance, the value comes from
   `lib/` — never computed inline. Load the `component-builder` skill.

5. **Build mobile-first.** 375px first. Then `sm:`, `md:`, `lg:`.

6. **Use tokens.** Colours, spacing, and radius come from the generated
   token classes in `styles/tokens.css`. No hex codes, no arbitrary values,
   no edits to `tailwind.config.ts`. If a value you need does not exist, add
   a role to `tokens.json` and run `npm run build:tokens` — the build
   verifies its contrast. Note the scale is 2px-based and the radius values
   override Tailwind's defaults.

7. **Handle all states.**
   - Loading → skeleton, not a bare spinner
   - Empty → `EmptyState` with a CTA
   - Error → what happened + what to do next
   - Populated → the happy path

8. **Accessibility pass.** Semantic elements, labels, keyboard, focus,
   contrast, status not conveyed by colour alone. Check dark theme too — the
   known `--color-error`-as-text gap is documented in
   [design-system.md](../rules/design-system.md).

9. **Test.** Render with representative props. Test empty and error
   states. Behaviour assertions, not snapshots.

10. **Verify.**
    ```bash
    npm run verify
    ```
    Then check it at 375px on a throttled connection.

## Tier components — extra checks

- Filter out Tiers II, VI, VII at the query level. Add a test.
- Order by `display_order`.
- Discounted price shows list price struck through — and only where the
  member actually qualifies (BR-005, BR-007). That is a `lib/pricing/`
  decision passed in as a prop, not something the card decides.
- Mark Advanced IV as the start of EHEMS OPEN (BR-011).
- Upgrade price comes from `calculateUpgradeDifference()`. Never inline, and
  never a hardcoded naira figure in the component.
- Attendance progress bars take the threshold as a prop from the
  programme's `attendance_threshold`, defaulting to 60. Never hardcode 60%.

## Done when

- [ ] Reused or added to `components/ui/` if reusable
- [ ] No business logic, no hardcoded money, and no hex codes in the component
- [ ] All four states handled
- [ ] Accessible per the checklist, in both themes
- [ ] Works at 375px
- [ ] `npm run verify` passes
