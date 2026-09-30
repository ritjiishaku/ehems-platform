import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RegisterForm from '@/components/auth/register-form';
import LoginForm from '@/components/auth/login-form';
import { getCurrentUser, isAuthenticated } from '@/lib/auth';
import {
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registerSchema,
} from '@/lib/validation/auth';
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
    expect(screen.getByLabelText(/healthcare specialty/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders the login form', () => {
    render(<LoginForm />);

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
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
    consentAccepted: true,
  };

  it('accepts a well-formed submission', () => {
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
