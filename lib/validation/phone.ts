import { z } from 'zod';

/** Normalize common Nigerian input forms to +234 followed by ten digits. */
export function normalizeNigerianPhone(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (compact.startsWith('+234')) return `+234${compact.slice(4)}`;
  if (compact.startsWith('234')) return `+${compact}`;
  if (compact.startsWith('0')) return `+234${compact.slice(1)}`;
  return compact;
}

export const nigerianPhoneSchema = z
  .string()
  .trim()
  .transform(normalizeNigerianPhone)
  .pipe(z.string().regex(/^\+234[789]\d{9}$/, 'Enter a valid Nigerian phone number'));
