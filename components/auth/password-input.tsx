'use client';

import { useState } from 'react';
import { authInputClass } from './input-class';

/**
 * Password field with a show/hide toggle.
 *
 * The first client component in the codebase. It is also the only place client
 * state earns its keep on the auth pages: a reveal toggle cannot be done in
 * CSS, because changing an input's `type` is a DOM property rather than a
 * style.
 *
 * A word ("Show" / "Hide") rather than an eye glyph. On a mid-range Android at
 * 375px in daylight, an icon is the weaker signal, and adding eye path data to
 * `components/ui/icon.tsx` for a decorative affordance would be more work than
 * the affordance itself. It also keeps the control a plain `<button>`, so it
 * stays in the tab order and announces itself without extra ARIA.
 *
 * Props are all strings/numbers because the component crosses the
 * server/client boundary inside a form posted by a server action.
 */
export default function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  placeholder,
  minLength,
  maxLength = 200,
  required = true,
}: {
  id: string;
  name: string;
  label: string;
  /** `new-password` when choosing one, `current-password` when signing in.
   *  Overriding this silently breaks browser autofill and offer-to-save. */
  autoComplete: 'new-password' | 'current-password';
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="label-medium text-on-surface block font-medium">
        {label}
      </label>
      {/* The toggle overlays the field rather than sitting beside it, so the
          control stays inside the 375px column instead of forcing it wider. */}
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          className={`${authInputClass} pr-20`}
          placeholder={placeholder}
          minLength={minLength}
          maxLength={maxLength}
          required={required}
        />
        <button
          // Explicitly not a submit button: this sits inside a form whose action
          // posts to a server action, and a default-type button here would submit
          // the form whenever a member only wanted to check their password.
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-controls={id}
          // The name changes with the state, so assistive tech announces the
          // result of pressing it rather than just a button labelled "Show" that
          // is still labelled "Show" once pressed.
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="text-primary label-medium hover:bg-surface-container absolute top-1/2 right-1.5 min-h-11 -translate-y-1/2 rounded-lg px-2.5 font-semibold focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:outline-none"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}
