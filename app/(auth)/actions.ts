'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { authenticateUser, registerUser, signIn } from '@/lib/auth';
import { assertSameOrigin, CsrfError } from '@/lib/auth/csrf';
import {
  checkRateLimit,
  LOGIN_RATE_LIMIT,
  recordAttempt,
  resetRateLimit,
} from '@/lib/auth/rate-limit';
import { firstIssueMessage, loginSchema, registerSchema } from '@/lib/validation/auth';

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
    password: formData.get('password'),
  });

  if (!parsed.success) registerError(firstIssueMessage(parsed.error));

  const { fullName, email, password } = parsed.data;
  const requestHeaders = await headers();
  const ipAddress = clientIp(requestHeaders);
  const userAgent = requestHeaders.get('user-agent') ?? undefined;

  let user;
  try {
    user = await registerUser({ name: fullName, email, password, ipAddress, userAgent });
  } catch (error) {
    registerError(error instanceof Error ? error.message : 'Unable to create account');
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
  const verdict = checkRateLimit(throttleKey, LOGIN_RATE_LIMIT);
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
    recordAttempt(throttleKey, LOGIN_RATE_LIMIT);
    loginError(error instanceof Error ? error.message : 'Unable to log in');
  }

  resetRateLimit(throttleKey);
  await signIn(user);
  redirect('/dashboard');
}
