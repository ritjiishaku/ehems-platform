/**
 * Shared input treatment for the auth forms.
 *
 * The forms hand-rolled this string independently four times, which meant a
 * density change had to be applied in four places and one was usually missed.
 *
 * Its own module rather than `components/ui/` because it is an auth concern, not
 * a general primitive: `PasswordInput` also needs extra right-hand padding for
 * its toggle, so the two are versioned together.
 *
 * `py-2` rather than the original `py-2.5`: seven fields plus a confirm field
 * overflowed a 375px viewport, and 40px clears the WCAG 2.2 AA 24px target-size
 * minimum with room to spare. Submit buttons keep `py-3`.
 */
export const authInputClass =
  'border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2 outline-none transition-all focus:ring-2';
