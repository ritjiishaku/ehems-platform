export const DATA_SUBJECT_REQUEST_TYPES = [
  'access',
  'rectification',
  'erasure',
  'restriction',
  'portability',
  'objection',
] as const;

export type DataSubjectRequestType = (typeof DATA_SUBJECT_REQUEST_TYPES)[number];

/**
 * PRD §16.1 status vocabulary.
 *
 * Stored as `String` on `DataSubjectRequest` — the same shape the existing
 * `requestType` column uses — so these constants are the single source of the
 * allowed values and the state machine refuses anything not listed here.
 */
export const DATA_SUBJECT_REQUEST_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'rejected',
] as const;

export type DataSubjectRequestStatus = (typeof DATA_SUBJECT_REQUEST_STATUSES)[number];

export function isDataSubjectRequestStatus(value: string): value is DataSubjectRequestStatus {
  return (DATA_SUBJECT_REQUEST_STATUSES as readonly string[]).includes(value);
}

export function isDataSubjectRequestType(value: string): value is DataSubjectRequestType {
  return (DATA_SUBJECT_REQUEST_TYPES as readonly string[]).includes(value);
}

export const DATA_SUBJECT_REQUEST_TYPE_LABELS: Record<DataSubjectRequestType, string> = {
  access: 'Access my data',
  rectification: 'Correct my data',
  erasure: 'Request erasure',
  restriction: 'Restrict processing',
  portability: 'Export my data',
  objection: 'Object to processing',
};

export const DATA_SUBJECT_REQUEST_STATUS_LABELS: Record<DataSubjectRequestStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
};
