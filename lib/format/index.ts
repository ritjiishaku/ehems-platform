/**
 * Money and date formatting (AGENTS.md §6, §7).
 *
 * No framework imports here. Formatting is presentation, but it is also a place
 * where a wrong default quietly costs the client trust, so the rules are pinned
 * in one file:
 *
 *   - amounts are integer kobo and are only ever divided by 100 for display,
 *   - the currency is NGN and is rendered with the naira sign, never "NGN",
 *   - dates are stored UTC and rendered in WAT (UTC+1) for Nigerian members
 *     (AGENTS.md §7).
 *
 * A member sees ₦375,000.00, not "NGN 375000" and not ₦375,000.0000.
 */

import type { Kobo } from '@/lib/pricing/types';

const NAIRA = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `formatNaira(kobo(37_500_000))` → `₦375,000.00` */
export function formatNaira(amountKobo: Kobo | number): string {
  return NAIRA.format(amountKobo / 100);
}

/**
 * `formatNairaShort` for dense tables and queue rows, where the cents are noise.
 * Whole-naira amounts only: a partial naira is not a thing anyone pays.
 */
export function formatNairaShort(amountKobo: Kobo | number): string {
  const naira = amountKobo / 100;
  return Number.isInteger(naira)
    ? `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(naira)}`
    : formatNaira(amountKobo);
}

const WAT_DATE = new Intl.DateTimeFormat('en-NG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
});

const WAT_DATE_TIME = new Intl.DateTimeFormat('en-NG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Africa/Lagos',
});

/** Stored UTC, rendered in WAT. Never `toLocaleDateString()` with no timeZone. */
export function formatDate(value: Date): string {
  return WAT_DATE.format(value);
}

export function formatDateTime(value: Date): string {
  return `${WAT_DATE_TIME.format(value)} WAT`;
}

/**
 * A date the member types — a transfer date, mostly — as `YYYY-MM-DD`.
 *
 * `new Date('2026-09-29')` is UTC midnight, which in WAT is 1am the same day but
 * in any negative-offset timezone is the *previous* day. Parsing the parts
 * explicitly and reading them back in UTC keeps the calendar date stable
 * wherever the request is served from.
 */
export function parseWatDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // Rejects 2026-02-31 and friends, which Date.UTC silently rolls over.
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
    return null;
  }
  return date;
}
