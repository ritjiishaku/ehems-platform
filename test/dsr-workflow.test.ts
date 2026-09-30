import { describe, expect, it } from 'vitest';
import {
  DATA_SUBJECT_REQUEST_STATUSES,
  DATA_SUBJECT_REQUEST_TYPES,
  isDataSubjectRequestStatus,
  isDataSubjectRequestType,
} from '@/lib/ndpa/types';
import {
  DSR_RESPONSE_WINDOW_DAYS,
  DSR_TERMINAL_STATUSES,
  DSR_TRANSITIONS,
  daysSinceRequested,
  isOverdue,
  validateTransition,
} from '@/lib/ndpa/dsr-state';
import { dataSubjectRequestHandlingSchema } from '@/lib/validation/data-subject-request';

describe('the PRD data subject vocabularies', () => {
  it('uses the six §16.1 request types and four statuses', () => {
    expect([...DATA_SUBJECT_REQUEST_TYPES]).toEqual([
      'access',
      'rectification',
      'erasure',
      'restriction',
      'portability',
      'objection',
    ]);
    expect([...DATA_SUBJECT_REQUEST_STATUSES]).toEqual([
      'pending',
      'in_progress',
      'completed',
      'rejected',
    ]);
  });

  it('rejects values outside those vocabularies', () => {
    expect(isDataSubjectRequestType('portability')).toBe(true);
    expect(isDataSubjectRequestType('delete_everything')).toBe(false);
    expect(isDataSubjectRequestStatus('in_progress')).toBe(true);
    expect(isDataSubjectRequestStatus('approved')).toBe(false);
  });
});

describe('the data subject request state machine', () => {
  it('allows only the transitions the workflow needs', () => {
    expect(DSR_TRANSITIONS.pending).toEqual(['in_progress', 'rejected']);
    expect(DSR_TRANSITIONS.in_progress).toEqual(['completed', 'rejected']);
  });

  it('treats completed and rejected as final', () => {
    expect(DSR_TRANSITIONS.completed).toEqual([]);
    expect(DSR_TRANSITIONS.rejected).toEqual([]);
    expect([...DSR_TERMINAL_STATUSES]).toEqual(['completed', 'rejected']);
  });

  it('permits a pending request to be picked up and closed', () => {
    expect(validateTransition('pending', 'in_progress', null).ok).toBe(true);
    expect(validateTransition('in_progress', 'completed', 'Sent the member their data.').ok).toBe(
      true,
    );
  });

  it('will not complete straight from pending, skipping the in-progress step', () => {
    const result = validateTransition('pending', 'completed', 'Done.');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.kind).toBe('not_allowed');
  });

  it('refuses to reopen a closed request', () => {
    for (const from of DSR_TERMINAL_STATUSES) {
      const result = validateTransition(from, 'in_progress', null);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.problem.kind).toBe('terminal');
    }
  });

  it('requires a recorded reason for a rejection', () => {
    for (const notes of [null, '', '   ']) {
      const result = validateTransition('pending', 'rejected', notes);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.problem.kind).toBe('notes_required');
    }
    expect(
      validateTransition('pending', 'rejected', 'Payment records are retained by law.').ok,
    ).toBe(true);
  });

  it('requires a record of what was done before completing', () => {
    const result = validateTransition('in_progress', 'completed', '  ');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.kind).toBe('notes_required');
  });

  it('treats a status outside the vocabulary as unrecognised rather than defaulting', () => {
    const result = validateTransition('cancelled', 'in_progress', null);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.kind).toBe('unknown_status');
  });
});

describe('the one month response window', () => {
  const now = Date.UTC(2026, 8, 29);

  it('is 30 days, the NDPA allowance', () => {
    expect(DSR_RESPONSE_WINDOW_DAYS).toBe(30);
  });

  it('counts whole days elapsed', () => {
    expect(daysSinceRequested(new Date(now - 3 * 24 * 60 * 60 * 1000), now)).toBe(3);
    expect(daysSinceRequested(new Date(now), now)).toBe(0);
  });

  it('flags a request only once it passes 30 days', () => {
    expect(isOverdue(new Date(now - 29 * 24 * 60 * 60 * 1000), now)).toBe(false);
    expect(isOverdue(new Date(now - 31 * 24 * 60 * 60 * 1000), now)).toBe(true);
  });
});

describe('the admin handling input schema', () => {
  it('accepts a known status and bounds the notes length', () => {
    expect(
      dataSubjectRequestHandlingSchema.safeParse({
        requestId: 'dsr-1',
        to: 'in_progress',
        notes: 'Asked the member for ID verification.',
      }).success,
    ).toBe(true);

    expect(
      dataSubjectRequestHandlingSchema.safeParse({ requestId: 'dsr-1', to: 'deleted' }).success,
    ).toBe(false);

    expect(
      dataSubjectRequestHandlingSchema.safeParse({
        requestId: 'dsr-1',
        to: 'completed',
        notes: 'x'.repeat(2001),
      }).success,
    ).toBe(false);
  });

  it('does not itself require notes on a terminal status', () => {
    // The business rule lives in lib/ndpa/dsr-state.ts, not in the schema, so
    // it cannot be bypassed by calling the server action directly.
    expect(
      dataSubjectRequestHandlingSchema.safeParse({ requestId: 'dsr-1', to: 'completed' }).success,
    ).toBe(true);
  });
});
