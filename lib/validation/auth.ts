import { z } from 'zod';
import { nigerianPhoneSchema } from './phone';

/**
 * Auth boundary schemas (Zod 4).
 *
 * These check *shape* only — that the fields are present, correctly typed, and
 * within their length limits. Business rules stay in `lib/`, because a schema
 * that ships to the client discloses the rule and can be bypassed (AGENTS.md §7).
 *
 * Zod 4 renamed the message parameter to `error`; `errorMap` was removed. See
 * the `registerSchema` literal below for the one place that shows it.
 */

/**
 * The email field trims and lower-cases *before* the format check, so a stray
 * space does not fail the pattern. In Zod 4 `z.email()` is a schema of its own
 * rather than a check on ZodString, so `z.email().trim()` would run the format
 * check first and reject `' a@b.com '`. `.pipe()` keeps the order explicit.
 */
const email = () =>
  z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email address'));

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name cannot exceed 100 characters'),
  email: email(),
  phone: nigerianPhoneSchema,
  profession: z
    .string()
    .trim()
    .min(2, 'Profession must be at least 2 characters')
    .max(100, 'Profession cannot exceed 100 characters'),
  healthcareSpecialty: z.string().trim().max(100).optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(200, 'Password cannot exceed 200 characters'),
  consentAccepted: z.literal(true, {
    error: 'You must accept the privacy policy and terms to register (NDPA SEC-011)',
  }),
});

export const loginSchema = z.object({
  email: email(),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(200, 'Password cannot exceed 200 characters'),
});

export const passwordResetRequestSchema = z.object({ email: email() });

export const passwordResetSchema = z
  .object({
    token: z.string().trim().min(32).max(200),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(200, 'Password cannot exceed 200 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** The first issue message, which is the most specific one a person can act on. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Please check the form and try again.';
}
