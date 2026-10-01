'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { authenticateUser, registerUser, signIn } from '@/lib/auth';
import { completePasswordReset, requestPasswordReset } from '@/lib/auth/password-reset';
import { assertSameOrigin, CsrfError } from '@/lib/auth/csrf';
import { memberFacingAuthError } from '@/lib/auth/member-safe-error';
import {
  clearRateLimit,
  consumeRateLimit,
  LOGIN_RATE_LIMIT,
  PASSWORD_RESET_RATE_LIMIT,
} from '@/lib/auth/rate-limit';
import {
  firstIssueMessage,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registerSchema,
} from '@/lib/validation/auth';

/**
 * Auth server actions.
 *
 * Order of operations, and it is not negotiable (AGENTS.md §7): authorisation
 * and request integrity are checked first, then the body is parsed through a
 * Zod schema, and only then does business logic run in `lib/`.
 *
 * `redirect()` throws. It is therefore always called *outside* the try/catch —
 * inside one, a successful registration gets caught on the way to /dashboard
 * and the user is bounced back to the form with a spurious error.
 */

function clientIp(requestHeaders: Headers): string | undefined {
  const forwarded = requestHeaders.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || requestHeaders.get('x-real-ip')?.trim() || undefined;
}

function loginError(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

function registerError(message: string): never {
  redirect(`/register?error=${encodeURIComponent(message)}`);
}

function publicBaseUrl(): string {
  const configured = process.env.APP_BASE_URL;
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('APP_BASE_URL must be configured for password reset links');
    }
    return 'http://localhost:3000';
  }
  return new URL(configured).origin;
}

export async function registerAction(formData: FormData) {
  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof CsrfError) registerError('Your session expired. Please try again.');
    throw error;
  }

  const parsed = registerSchema.safeParse({
    // The checkbox posts the string "true" when ticked and nothing when not, so
    // presence alone is not consent — SEC-011 needs the value to be exactly true.
    consentAccepted: formData.get('consentAccepted') === 'true',
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    profession: formData.get('profession'),
    healthcareSpecialty: formData.get('healthcareSpecialty') || undefined,
    password: formData.get('password'),
  });

  if (!parsed.success) registerError(firstIssueMessage(parsed.error));

  const { fullName, email, password, phone, profession, healthcareSpecialty } = parsed.data;
  const requestHeaders = await headers();
  const ipAddress = clientIp(requestHeaders);
  const userAgent = requestHeaders.get('user-agent') ?? undefined;

  let user;
  try {
    user = await registerUser({
      name: fullName,
      email,
      password,
      phone,
      profession,
      healthcareSpecialty,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    registerError(
      memberFacingAuthError(
        error,
        'registration',
        'Unable to create your account right now. Please try again in a moment.',
      ),
    );
  }

  await signIn(user);
  redirect('/dashboard');
}

export async function loginAction(formData: FormData) {
  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof CsrfError) loginError('Your session expired. Please try again.');
    throw error;
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) loginError(firstIssueMessage(parsed.error));

  const { email, password } = parsed.data;
  const requestHeaders = await headers();
  const ipAddress = clientIp(requestHeaders);
  const userAgent = requestHeaders.get('user-agent') ?? undefined;

  // Keyed on IP *and* address, so rotating IPs does not escape the limit and a
  // shared mobile IP does not lock out everyone behind it.
  const throttleKey = `login:${ipAddress ?? 'unknown'}:${email}`;
  const verdict = await consumeRateLimit(throttleKey, LOGIN_RATE_LIMIT);
  if (!verdict.allowed) {
    const minutes = Math.ceil(verdict.retryAfterSeconds / 60);
    loginError(
      `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }

  let user;
  try {
    user = await authenticateUser({ email, password, ipAddress, userAgent });
  } catch (error) {
    loginError(
      memberFacingAuthError(error, 'login', 'Unable to log you in right now. Please try again.'),
    );
  }

  await clearRateLimit(throttleKey);
  await signIn(user);
  redirect('/dashboard');
}

export async function requestPasswordResetAction(formData: FormData) {
  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof CsrfError) redirect('/forgot-password?error=request-failed');
    throw error;
  }

  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) redirect('/forgot-password?error=invalid-email');

  const requestHeaders = await headers();
  const throttleKey = `password-reset:${clientIp(requestHeaders) ?? 'unknown'}:${parsed.data.email}`;
  const verdict = await consumeRateLimit(throttleKey, PASSWORD_RESET_RATE_LIMIT);
  if (verdict.allowed) {
    try {
      await requestPasswordReset(parsed.data.email, publicBaseUrl());
    } catch {
      // Keep the same response for existing and unknown accounts. Provider or
      // configuration failures do not reveal account existence to the caller.
    }
  }

  redirect('/forgot-password?status=sent');
}

export async function resetPasswordAction(formData: FormData) {
  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof CsrfError) redirect('/reset-password?error=invalid-link');
    throw error;
  }

  const parsed = passwordResetSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    const tokenValue = formData.get('token');
    const token = typeof tokenValue === 'string' ? tokenValue : '';
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=invalid-input`);
  }

  const completed = await completePasswordReset(parsed.data.token, parsed.data.password);
  if (!completed) redirect('/reset-password?error=invalid-link');
  redirect('/login?status=password-reset');
}
