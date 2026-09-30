import { PaymentStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { formatNaira, formatNairaShort, parseWatDateInput } from '@/lib/format';
import { allowedActions, PAYMENT_TERMINAL_STATUSES, resolveTransition } from '@/lib/payments/state';
import { detectProofType } from '@/lib/payments/proofs';
import { issueProofGrant, PROOF_GRANT_TTL_MS, verifyProofGrant } from '@/lib/payments/proof-grants';
import { resolvePaymentMode } from '@/lib/payments/mode';
import {
  PAYMENT_METHODS,
  PAYMENT_QUEUE_STATUSES,
  PAYMENT_STATUSES,
  type PaymentStatus as LocalPaymentStatus,
} from '@/lib/payments/types';
import { getTier, kobo } from '@/lib/pricing/tiers';
import { calculateTierPrice, calculateUpgradeDifference } from '@/lib/pricing/upgrade';
import { FIRST_TIME_MEMBER, type PricingMember } from '@/lib/pricing/types';

/**
 * Pure payment rules. No database — everything here is decidable from the state
 * machine and the pricing functions, which is the point of keeping them apart.
 *
 * The rules pinned in this file are the ones that cost the client money or
 * access: BR-003, BR-004, BR-005, BR-007, D-1, D-8, and the §14.3 vocabulary.
 */

describe('the payment vocabulary is the PRD one', () => {
  it('has exactly the five §14.3 statuses', () => {
    expect([...PAYMENT_STATUSES]).toEqual([
      'pending',
      'submitted',
      'under_review',
      'verified',
      'rejected',
    ]);
  });

  it('matches the generated Prisma enum member for member', () => {
    // The state machine is Prisma-free so it can be unit tested, which means the
    // vocabulary is written down twice. This is what stops the copy rotting.
    const fromPrisma = Object.values(PaymentStatus).sort();
    expect([...PAYMENT_STATUSES].sort()).toEqual(fromPrisma);
  });

  it('queues submitted only, so a row somebody opened is not in the queue', () => {
    expect([...PAYMENT_QUEUE_STATUSES]).toEqual(['submitted']);
  });

  it('has the three §14.4 payment methods', () => {
    expect([...PAYMENT_METHODS]).toEqual(['bank_transfer', 'mobile_money', 'cash']);
  });
});

describe('the state machine permits exactly the documented edges', () => {
  it('walks the happy path pending -> submitted -> under_review -> verified', () => {
    expect(resolveTransition('pending', 'submit')).toEqual({ ok: true, to: 'submitted' });
    expect(resolveTransition('submitted', 'open')).toEqual({ ok: true, to: 'under_review' });
    expect(resolveTransition('under_review', 'verify')).toEqual({ ok: true, to: 'verified' });
  });

  it('permits under_review -> rejected', () => {
    expect(resolveTransition('under_review', 'reject')).toEqual({ ok: true, to: 'rejected' });
  });

  it('permits the single D-8 back edge, rejected -> submitted', () => {
    expect(resolveTransition('rejected', 'resubmit')).toEqual({ ok: true, to: 'submitted' });
  });

  it('refuses a verify straight out of the member submission', () => {
    // Otherwise the verification queue is decorative: the payment would be
    // approved without anybody opening it.
    const result = resolveTransition('submitted', 'verify');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.kind).toBe('not_allowed');
  });

  it('refuses a reject from the queue without an open step', () => {
    const result = resolveTransition('submitted', 'reject');
    expect(result.ok).toBe(false);
  });

  it('refuses a reject from pending', () => {
    expect(resolveTransition('pending', 'reject').ok).toBe(false);
  });

  it('treats verified as final', () => {
    expect(PAYMENT_TERMINAL_STATUSES).toEqual(['verified']);
    for (const action of ['submit', 'open', 'verify', 'reject', 'resubmit']) {
      const result = resolveTransition('verified', action);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.problem.kind).toBe('terminal');
    }
  });

  it('does not let a rejected payment skip back through verification', () => {
    expect(resolveTransition('rejected', 'verify').ok).toBe(false);
    expect(resolveTransition('rejected', 'open').ok).toBe(false);
  });

  it('refuses a second submission while a payment is already in the queue', () => {
    expect(resolveTransition('submitted', 'submit').ok).toBe(false);
    expect(resolveTransition('under_review', 'submit').ok).toBe(false);
    expect(resolveTransition('under_review', 'resubmit').ok).toBe(false);
  });

  it('refuses a status it does not recognise rather than guessing', () => {
    const result = resolveTransition('refunded', 'submit');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.kind).toBe('unknown_status');
  });

  it('refuses an action it does not recognise', () => {
    const result = resolveTransition('pending', 'delete');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.kind).toBe('unknown_action');
  });

  it('reports what the admin UI is allowed to offer, per status', () => {
    const offered: Record<LocalPaymentStatus, string[]> = {
      pending: ['submit'],
      submitted: ['open'],
      under_review: ['verify', 'reject'],
      rejected: ['resubmit'],
      verified: [],
    };
    for (const status of PAYMENT_STATUSES) {
      expect(allowedActions(status).sort()).toEqual([...offered[status]].sort());
    }
  });

  it('offers nothing for an unrecognised status', () => {
    expect(allowedActions('mystery')).toEqual([]);
  });
});

describe('BR-003 and BR-004: the upgrade difference is list price, not amount paid', () => {
  const basic = getTier('basic');
  const advanced = getTier('advanced-iv');
  const advancedV = getTier('advanced-v');

  const upgrader: PricingMember = {
    id: 'member-1',
    isFirstTimeSubscriber: false,
    previousTierPaidInFull: true,
    previousTierCompleted: true,
    hasPurchasedAdvanced: false,
  };

  it('charges the list difference when the prior tier is paid and completed', () => {
    // ₦750,000 − ₦300,000 = ₦450,000. Not ₦375,000: BR-005 says the 50%
    // discount is not combinable with an upgrade difference.
    expect(calculateUpgradeDifference(basic, advanced, upgrader)).toBe(45_000_000);
  });

  it('charges full price when the prior tier is not completed', () => {
    const notCompleted: PricingMember = { ...upgrader, previousTierCompleted: false };
    expect(calculateUpgradeDifference(basic, advanced, notCompleted)).toBe(75_000_000);
  });

  it('charges full price when the prior tier is not paid in full', () => {
    const unpaid: PricingMember = { ...upgrader, previousTierPaidInFull: false };
    expect(calculateUpgradeDifference(basic, advanced, unpaid)).toBe(75_000_000);
  });

  it('computes a second upgrade as a list difference too, with no discount repeat', () => {
    const afterAdvanced: PricingMember = { ...upgrader, hasPurchasedAdvanced: true };
    // ₦900,000 − ₦750,000 = ₦150,000 (BR-007: the discount never repeats).
    expect(calculateUpgradeDifference(advanced, advancedV, afterAdvanced)).toBe(15_000_000);
  });

  it('never returns zero or negative, which would be a refund path', () => {
    const sideways = calculateUpgradeDifference(advanced, basic, upgrader);
    expect(sideways).toBe(30_000_000);
  });
});

describe('BR-005, BR-006, BR-007: the first-purchase Advanced discount', () => {
  it('gives a first-time buyer exactly ₦375,000 on Advanced Level IV', () => {
    expect(calculateTierPrice(getTier('advanced-iv'), FIRST_TIME_MEMBER)).toBe(37_500_000);
  });

  it('gives the exact confirmed Advanced V and Higher Advanced VIII prices', () => {
    expect(calculateTierPrice(getTier('advanced-v'), FIRST_TIME_MEMBER)).toBe(45_000_000);
    expect(calculateTierPrice(getTier('higher-advanced-viii'), FIRST_TIME_MEMBER)).toBe(62_500_000);
  });

  it('withholds it from a member who has bought an Advanced tier before', () => {
    const returning: PricingMember = { ...FIRST_TIME_MEMBER, isFirstTimeSubscriber: false };
    expect(calculateTierPrice(getTier('advanced-iv'), returning)).toBe(75_000_000);
  });

  it('never applies it to a non-Advanced tier', () => {
    expect(calculateTierPrice(getTier('basic'), FIRST_TIME_MEMBER)).toBe(30_000_000);
    expect(calculateTierPrice(getTier('basic-iii'), FIRST_TIME_MEMBER)).toBe(55_000_000);
  });

  it("charges a first-time buyer nothing for O'Free, and creates no payment", () => {
    // D-1: the zero-cost enrolment activates on creation. The absence of a
    // payment is asserted in the database test; here the amount must be zero.
    expect(calculateTierPrice(getTier('o-free'), FIRST_TIME_MEMBER)).toBe(0);
  });
});

describe('money is rendered from integer kobo in NGN', () => {
  it('renders the BR-006 discounted price as a member sees it', () => {
    expect(formatNaira(kobo(37_500_000))).toBe('₦375,000.00');
  });

  it('renders the top tier without losing a digit', () => {
    expect(formatNaira(kobo(125_000_000))).toBe('₦1,250,000.00');
  });

  it("renders zero for O'Free rather than blank", () => {
    expect(formatNaira(kobo(0))).toBe('₦0.00');
  });

  it('shortens to whole naira for dense rows', () => {
    expect(formatNairaShort(kobo(75_000_000))).toBe('₦750,000');
  });
});

describe('a typed transfer date keeps its calendar day in WAT', () => {
  it('parses YYYY-MM-DD as that day', () => {
    const parsed = parseWatDateInput('2026-09-29');
    expect(parsed?.toISOString().slice(0, 10)).toBe('2026-09-29');
  });

  it('rejects an impossible date instead of rolling it over', () => {
    expect(parseWatDateInput('2026-02-31')).toBeNull();
  });

  it('rejects a non-date', () => {
    expect(parseWatDateInput('29/09/2026')).toBeNull();
  });
});

/**
 * The proof grant is the only thing standing between a session cookie and a
 * member's bank statement fragment, so it is tested adversarially: every case
 * here is a way somebody might try to reuse or widen one.
 */
describe('a payment proof grant is bound to one payment, one admin, and 60 seconds', () => {
  const PAYMENT = 'pay_abc';
  const ADMIN = 'usr_admin';
  const NOW = 1_800_000_000_000;

  it('accepts a grant it just issued', () => {
    const grant = issueProofGrant(PAYMENT, ADMIN, NOW);
    expect(verifyProofGrant(grant, PAYMENT, ADMIN, NOW).ok).toBe(true);
  });

  it('refuses a grant replayed against a different payment', () => {
    const grant = issueProofGrant(PAYMENT, ADMIN, NOW);
    expect(verifyProofGrant(grant, 'pay_other', ADMIN, NOW).ok).toBe(false);
  });

  it('refuses a grant handed to a different admin', () => {
    const grant = issueProofGrant(PAYMENT, ADMIN, NOW);
    expect(verifyProofGrant(grant, PAYMENT, 'usr_other_admin', NOW).ok).toBe(false);
  });

  it('expires rather than lingering', () => {
    const grant = issueProofGrant(PAYMENT, ADMIN, NOW);
    // Valid *through* the expiry instant, dead one millisecond later. This is the
    // JWT convention — the expiry is an instant the token is still good at, not
    // the first instant it is not — and it is worth pinning because the
    // off-by-one is invisible in use and would otherwise get "fixed" the wrong way.
    expect(verifyProofGrant(grant, PAYMENT, ADMIN, NOW + PROOF_GRANT_TTL_MS).ok).toBe(true);
    expect(verifyProofGrant(grant, PAYMENT, ADMIN, NOW + PROOF_GRANT_TTL_MS + 1).ok).toBe(false);
  });

  it('refuses a tampered expiry, which is the field a caller would edit', () => {
    const grant = issueProofGrant(PAYMENT, ADMIN, NOW);
    const [paymentId, actorId, , signature] = grant.split('.');
    const forged = [paymentId, actorId, String(NOW + PROOF_GRANT_TTL_MS * 1000), signature].join(
      '.',
    );
    expect(verifyProofGrant(forged, PAYMENT, ADMIN, NOW).ok).toBe(false);
  });

  it('refuses a grant signed with a different secret', () => {
    const real = process.env.AUTH_SESSION_SECRET;
    process.env.AUTH_SESSION_SECRET = 'a'.repeat(64);
    const grant = issueProofGrant(PAYMENT, ADMIN, NOW);
    process.env.AUTH_SESSION_SECRET = 'b'.repeat(64);
    expect(verifyProofGrant(grant, PAYMENT, ADMIN, NOW).ok).toBe(false);
    process.env.AUTH_SESSION_SECRET = real;
  });

  it('refuses garbage without throwing', () => {
    for (const token of ['', 'nonsense', 'a.b.c', 'a.b.c.d.e', '...']) {
      expect(verifyProofGrant(token, PAYMENT, ADMIN, NOW).ok).toBe(false);
    }
  });

  it('refuses when the signing secret is too short, rather than signing weakly', () => {
    const real = process.env.AUTH_SESSION_SECRET;
    process.env.AUTH_SESSION_SECRET = 'short';
    expect(() => issueProofGrant(PAYMENT, ADMIN, NOW)).toThrow(/at least 32 characters/);
    process.env.AUTH_SESSION_SECRET = real;
  });
});

/**
 * The served `Content-Type` is derived from the decrypted bytes, never from a
 * stored column, so these are the cases where a member-supplied file could be
 * handed to a browser under the wrong type.
 */
describe('a proof is classified from its bytes, not from a stored label', () => {
  it('identifies a JPEG and gives it a matching extension', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectProofType(jpeg)).toEqual({ mime: 'image/jpeg', extension: '.jpg' });
  });

  it('identifies a PNG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectProofType(png)).toEqual({ mime: 'image/png', extension: '.png' });
  });

  it('gives WebP a .webp extension rather than falling back to .jpg', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x1a, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'ascii'),
    ]);
    expect(detectProofType(webp)).toEqual({ mime: 'image/webp', extension: '.webp' });
  });

  it('identifies a PDF', () => {
    const pdf = Buffer.from('%PDF-1.7\n');
    expect(detectProofType(pdf)).toEqual({ mime: 'application/pdf', extension: '.pdf' });
  });

  it('refuses a file whose bytes are not a proof type at all', () => {
    // A Windows PE header behind a .jpg name, or a shell script. The route serves
    // `null` as a refusal rather than falling back to octet-stream.
    expect(detectProofType(Buffer.from('MZ\u0090\u0000\u0003'))).toBeNull();
    expect(detectProofType(Buffer.from('#!/bin/sh\nrm -rf /'))).toBeNull();
    expect(detectProofType(Buffer.alloc(0))).toBeNull();
  });
});

describe('payment instruction mode fails closed', () => {
  it('disables payments when the setting is missing or unknown', () => {
    expect(resolvePaymentMode(null, false).mode).toBe('disabled');
    expect(resolvePaymentMode('LIVE ', false).mode).toBe('disabled');
    expect(resolvePaymentMode('production', false).mode).toBe('disabled');
  });

  it('disables test mode in production', () => {
    expect(resolvePaymentMode('test', true)).toEqual({
      mode: 'disabled',
      acceptsUploads: false,
      showsTestBanner: false,
      memberVisible: false,
    });
  });

  it('keeps test mode usable outside production, with a visible warning', () => {
    expect(resolvePaymentMode('test', false)).toEqual({
      mode: 'test',
      acceptsUploads: true,
      showsTestBanner: true,
      memberVisible: true,
    });
  });

  it('keeps disabled mode disabled even for non-production', () => {
    expect(resolvePaymentMode('disabled', false).acceptsUploads).toBe(false);
  });
});
