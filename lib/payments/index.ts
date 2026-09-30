/**
 * `lib/payments/` — the only place a payment's status changes.
 *
 * Import surface, in dependency order:
 *
 *   types.ts               the §14.3 vocabulary, no Prisma
 *   state.ts               the pure machine, no Prisma
 *   proofs.ts              SEC-004 encryption at rest, SEC-005 type limits
 *   proof-grants.ts        the 60-second signed grant NFR-008 needs
 *   catalogue.ts           the tier join, and the per-member amount
 *   activate-enrolment.ts  the single activation point
 *   transitions.ts         the five transitions + the purchase intent
 *   proof-submission.ts    validate → encrypt → transition → clean up
 *   queries.ts             member list, admin queue
 *
 * `lib/payments/` is re-exported the way `lib/auth/` and `lib/ndpa/` are, so a
 * route handler imports one path and cannot accidentally reach past the machine
 * to a raw Prisma write.
 *
 * Two things are deliberately *not* exported:
 *
 *   `writeProofObject`, `proofStorageKey` — a caller must not be able to write
 *   ciphertext without a transition to attach it to, or fabricate a storage key.
 *   `readProofObject` *is* exported, because serving a proof to an authorised
 *   admin is a real requirement; the authoriser is the caller's job.
 */

export {
  ENROLMENT_STATUSES,
  ENROLMENT_STATUS_LABELS,
  MINIMUM_ATTENDANCE_PERCENT,
  PAYMENT_MEMBER_ACTIONABLE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_QUEUE_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  isPaymentMethod,
  isPaymentStatus,
  type EnrolmentStatus,
  type PaymentMethod,
  type PaymentStatus,
} from './types';

export {
  PAYMENT_TERMINAL_STATUSES,
  PAYMENT_TRANSITIONS,
  allowedActions,
  resolveTransition,
  type PaymentAction,
  type PaymentTransitionProblem,
  type PaymentTransitionResult,
} from './state';

export { activateEnrolment, type ActivationOutcome } from './activate-enrolment';

export {
  createPurchaseIntent,
  openForReview,
  rejectPayment,
  resubmitProof,
  submitProof,
  verifyPayment,
  type PaymentOutcome,
  type ProofDetails,
  type PurchaseIntentInput,
} from './transitions';

export {
  listPaymentsForMember,
  listPaymentsForVerificationQueue,
  listPaymentsInReview,
  type AdminQueuePayment,
  type MemberPayment,
} from './queries';

export { MAX_PROOF_BYTES, detectProofType, readProofObject, validateProofUpload } from './proofs';

export {
  PROOF_GRANT_TTL_MS,
  issueProofGrant,
  verifyProofGrant,
  type ProofGrantCheck,
} from './proof-grants';

export {
  getPaymentInstructions,
  getPaymentMode,
  resolvePaymentMode,
  type PaymentInstructions,
  type PaymentMode,
  type PaymentModeState,
} from './mode';

export {
  findDatabaseTier,
  loadPricingMember,
  priceTierForMember,
  type PricedTier,
} from './catalogue';

export {
  resubmitProofUpload,
  submitProofUpload,
  type ProofUploadInput,
  type ProofUploadOutcome,
} from './proof-submission';
