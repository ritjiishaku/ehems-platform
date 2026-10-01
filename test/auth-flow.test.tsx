import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import RegisterForm from '@/components/auth/register-form';
import LoginForm from '@/components/auth/login-form';
import ResetPasswordForm from '@/components/auth/reset-password-form';
import { getCurrentUser, isAuthenticated } from '@/lib/auth';
import {
  firstIssueMessage,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registerSchema,
} from '@/lib/validation/auth';
import { MemberSafeError, memberFacingAuthError } from '@/lib/auth/member-safe-error';
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/ndpa/consent';
import { consentWithdrawalSchema } from '@/lib/validation/consent';
import { profileUpdateSchema } from '@/lib/validation/profile';
import { dataSubjectRequestSchema } from '@/lib/validation/data-subject-request';

/**
 * These tests render the presentational forms, not the route pages. The pages
 * are `async` server components because they await `searchParams`, and React's
 * client runtime refuses to render an async component — so the page wiring is
 * covered by the Playwright suite and the markup is covered here.
 */
describe('auth flow', () => {
  it('renders the registration form', () => {
    render(<RegisterForm />);

    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nigerian phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^profession$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it('asks for the password twice on registration', () => {
    render(<RegisterForm />);

    // Anchored on the element type: the reveal control is named
    // "Show confirm password", so a bare /confirm password/i matches it too.
    const confirm = screen.getByLabelText(/^confirm password$/i);
    expect(confirm).toBeInTheDocument();
    expect(confirm).toHaveAttribute('name', 'confirmPassword');
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('name', 'password');
  });

  it('does not ask for the specialty at signup', () => {
    render(<RegisterForm />);

    expect(screen.queryByLabelText(/healthcare specialty/i)).not.toBeInTheDocument();
  });

  it('renders the login form', () => {
    render(<LoginForm />);

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it('shows the error message as an alert when one is passed', () => {
    render(<LoginForm error="Invalid email or password" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('renders no alert when there is no error', () => {
    render(<LoginForm />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('labels the consent checkbox with the exact text that gets recorded', () => {
    render(<RegisterForm />);

    // If the label and the stored CONSENT_TEXT ever diverge, the platform would
    // be holding consent to wording nobody was shown (SEC-011).
    expect(screen.getByLabelText(CONSENT_TEXT)).toBeInTheDocument();
  });

  it('exposes a session helper for authenticated member state', () => {
    expect(typeof isAuthenticated).toBe('function');
    expect(typeof getCurrentUser).toBe('function');
  });
});

describe('registration boundary schema', () => {
  const valid = {
    fullName: 'Dr. Aisha Bello',
    email: 'aisha@example.com',
    phone: '08031234567',
    profession: 'Nurse',
    password: 'correct-horse',
    confirmPassword: 'correct-horse',
    consentAccepted: true,
  };

  it('accepts a well-formed submission', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a mismatched confirmation and blames the confirm field', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'correct-horsey' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstIssueMessage(result.error)).toBe('Passwords do not match');
      // Pinning the path is what keeps the message attached to the field the
      // member can actually edit.
      expect(result.error.issues[0]?.path).toEqual(['confirmPassword']);
    }
  });

  it('requires a confirmation to be present at all', () => {
    // `null`, not `undefined`: this is what `formData.get()` actually returns for
    // an absent key, and the message has to survive that.
    const result = registerSchema.safeParse({ ...valid, confirmPassword: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstIssueMessage(result.error)).toBe('Please confirm your password');
    }
  });

  it('rejects a present-but-empty confirmation with the same guidance', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstIssueMessage(result.error)).toBe('Please confirm your password');
    }
  });

  it('validates the confirmation length independently of the password', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['confirmPassword']);
    }
  });

  it('no longer collects the specialty, which FR-014 places on the profile page', () => {
    // Asserted as absent rather than merely unused: the field must not creep back
    // into signup, and the schema is the boundary that would let it.
    expect(registerSchema.safeParse(valid).data).not.toHaveProperty('healthcareSpecialty');
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a submission without NDPA consent (SEC-011)', () => {
    const result = registerSchema.safeParse({ ...valid, consentAccepted: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/must accept/i);
    }
  });

  it('rejects a password under eight characters', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'short' });
    expect(result.success).toBe(false);
  });

  it('normalises the email to lower case', () => {
    const result = registerSchema.safeParse({ ...valid, email: '  Aisha@Example.COM ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('aisha@example.com');
  });

  it('normalises accepted Nigerian phone formats to +234 E.164 form', () => {
    const result = registerSchema.safeParse({ ...valid, phone: '+234 803 123 4567' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('+2348031234567');
  });

  it('rejects a phone number outside the Nigerian format', () => {
    expect(registerSchema.safeParse({ ...valid, phone: '+1 202 555 0100' }).success).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });
});

describe('member-facing error disclosure', () => {
  it('shows a deliberately member-safe message', () => {
    expect(
      memberFacingAuthError(new MemberSafeError('Invalid email or password'), 'login', 'x'),
    ).toBe('Invalid email or password');
  });

  it('replaces an internal error with the fallback instead of rendering it', () => {
    // The shape that leaked: a Prisma failure naming our table, on a public page.
    const leaked = new Error(
      'Invalid `prisma.user.findUnique()` invocation: The table `public.user` does not exist in the current database.',
    );
    const shown = memberFacingAuthError(leaked, 'registration', 'Please try again in a moment.');
    expect(shown).toBe('Please try again in a moment.');
    expect(shown).not.toContain('prisma');
    expect(shown).not.toContain('public.user');
  });

  it('does not treat an unlabelled error as safe, including from our own layer', () => {
    expect(
      memberFacingAuthError(new Error("The O'Free tier is not configured"), 'registration', 'x'),
    ).toBe('x');
  });

  it('handles a non-Error throw', () => {
    expect(memberFacingAuthError('connection terminated', 'registration', 'x')).toBe('x');
  });

  it('keeps a labelled subclass of the marker recognisable', () => {
    class DuplicateEmailError extends MemberSafeError {}
    expect(memberFacingAuthError(new DuplicateEmailError('taken'), 'registration', 'x')).toBe(
      'taken',
    );
  });
});

describe('password reveal', () => {
  it('starts masked and reveals on click', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const password = screen.getByLabelText(/^password$/i);
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));

    expect(password).toHaveAttribute('type', 'text');
    // Masking is the default, so a failed hydration leaves the field secret
    // rather than exposed.
  });

  it('masks again on a second click', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    const password = screen.getByLabelText(/^password$/i);

    await user.click(screen.getByRole('button', { name: /show password/i }));
    await user.click(screen.getByRole('button', { name: /hide password/i }));

    expect(password).toHaveAttribute('type', 'password');
  });

  it('reveals each password field independently', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.click(screen.getByRole('button', { name: /^show confirm password$/i }));

    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/^confirm password$/i)).toHaveAttribute('type', 'text');
  });

  it('relabels the control so its new state is announced', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show password/i }));

    // A button still named "Show" after pressing it tells a screen-reader user
    // nothing about what happened.
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show password/i })).not.toBeInTheDocument();
  });

  it('does not submit the form when revealing', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    // type="button" is load-bearing: this control sits inside a form that posts
    // to a server action, and a default-type button would submit on every check.
    const toggle = screen.getByRole('button', { name: /show password/i });
    expect(toggle).toHaveAttribute('type', 'button');
    await user.click(toggle);

    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('keeps the value the member typed when toggling', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    const password = screen.getByLabelText(/^password$/i);

    await user.type(password, 'correct-horse');
    await user.click(screen.getByRole('button', { name: /show password/i }));

    // React re-renders the input on type change; a naive implementation that
    // remounts the field would silently discard the password mid-entry.
    expect(password).toHaveValue('correct-horse');
  });

  it('reveals on the login and reset forms too', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const password = screen.getByLabelText(/^password$/i);
    expect(password).toHaveAttribute('autocomplete', 'current-password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');
  });

  it('offers a reveal on both reset-password fields', () => {
    render(<ResetPasswordForm token={'t'.repeat(43)} />);

    expect(screen.getByLabelText(/^new password$/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/^confirm new password$/i)).toHaveAttribute('type', 'password');
    // Anchored, because "Show confirm new password" also contains "new password".
    expect(screen.getByRole('button', { name: /^show new password$/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^show confirm new password$/i }),
    ).toBeInTheDocument();
  });

  it('associates each toggle with the field it controls', () => {
    render(<RegisterForm />);

    const password = screen.getByLabelText(/^password$/i);
    expect(
      screen.getByRole('button', { name: /show password/i }).getAttribute('aria-controls'),
    ).toBe(password.id);
  });
});

describe('login boundary schema', () => {
  it('requires both fields', () => {
    expect(loginSchema.safeParse({ email: 'a@example.com', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@example.com' }).success).toBe(false);
  });
});

describe('password reset boundary schemas', () => {
  it('normalizes the reset-request email', () => {
    const result = passwordResetRequestSchema.safeParse({ email: ' Aisha@Example.COM ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('aisha@example.com');
  });

  it('requires matching, sufficiently long passwords', () => {
    expect(
      passwordResetSchema.safeParse({
        token: 'a'.repeat(43),
        password: 'new-password',
        confirmPassword: 'new-password',
      }).success,
    ).toBe(true);
    expect(
      passwordResetSchema.safeParse({
        token: 'a'.repeat(43),
        password: 'new-password',
        confirmPassword: 'different-password',
      }).success,
    ).toBe(false);
  });
});

describe('profile and consent boundary schemas', () => {
  it('normalizes Nigerian phone data and requires re-authentication for profile changes', () => {
    const result = profileUpdateSchema.safeParse({
      name: 'Dr. Aisha Bello',
      phone: '08031234567',
      profession: 'Nurse',
      healthcareSpecialty: 'Paediatrics',
      currentPassword: 'correct-horse',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('+2348031234567');
  });

  it('requires a consent record identifier for withdrawal requests', () => {
    expect(consentWithdrawalSchema.safeParse({ consentId: 'consent-1' }).success).toBe(true);
    expect(consentWithdrawalSchema.safeParse({ consentId: '' }).success).toBe(false);
  });

  it('accepts only PRD-defined data subject request types', () => {
    expect(dataSubjectRequestSchema.safeParse({ requestType: 'access' }).success).toBe(true);
    expect(dataSubjectRequestSchema.safeParse({ requestType: 'delete_everything' }).success).toBe(
      false,
    );
  });
});

describe('consent text', () => {
  it('is versioned, so a ConsentRecord can be tied to the wording shown', () => {
    expect(CONSENT_VERSION).toMatch(/^\d+\.\d+$/);
    expect(CONSENT_TEXT.length).toBeGreaterThan(0);
  });
});
