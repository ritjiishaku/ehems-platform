import { z } from 'zod';

/**
 * Product order input (FR-049, BR-013).
 *
 * Shape only. Whether a fulfilment type is *legal for this product* depends on
 * `Product.productType`, which is not in the body, so that rule lives in
 * `lib/orders/` — a schema that shipped to the client would disclose the rule and
 * could be bypassed (AGENTS.md §7).
 */

export const MAX_ORDER_QUANTITY = 99;

/** PRD §16.3: fulfilment_type is delivery | collection. Physical products only. */
export const FULFILMENT_TYPES = ['delivery', 'collection'] as const;
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

export const orderPlaceSchema = z.object({
  productId: z
    .string()
    .min(1, 'Choose a product.')
    // A cuid, not free text: the id reaches a `where` clause, and bounding it
    // keeps a malformed body from turning into a full-table scan attempt.
    .regex(/^[a-z0-9]{20,32}$/, 'That product reference is not valid.'),
  quantity: z.coerce
    .number()
    .int('Choose a whole number of items.')
    .min(1, 'Order at least one item.')
    .max(MAX_ORDER_QUANTITY, `Order at most ${MAX_ORDER_QUANTITY} of one item.`),
  // Optional in the schema because a digital product has neither. The domain
  // rejects a fulfilment type on a digital product rather than ignoring it, since
  // silently dropping it would show the member a "collection" order that can
  // never be collected.
  fulfilmentType: z.enum(FULFILMENT_TYPES).optional(),
  deliveryAddress: z.string().trim().max(400, 'That address is too long.').optional().default(''),
});

export type OrderPlaceInput = z.input<typeof orderPlaceSchema>;
export type OrderPlaceParsed = z.output<typeof orderPlaceSchema>;

/**
 * PROVISIONAL. The PRD does not settle order statuses; see docs/decisions.md D-10.
 *
 * Mirrors the payment machine rather than inventing a parallel one: an order is
 * paid when its payment is verified, and fulfilment is a separate manual act
 * (BR-013), so `paid` and `fulfilled` are distinct.
 */
export const ORDER_STATUSES = [
  'pending_payment',
  'awaiting_verification',
  'paid',
  'fulfilled',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting your payment',
  awaiting_verification: 'Awaiting verification',
  paid: 'Paid — awaiting fulfilment',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
};

export const ORDER_MEMBER_ACTIONABLE_STATUSES: readonly OrderStatus[] = ['pending_payment'];

export const ORDER_FULFILMENT_QUEUE_STATUSES: readonly OrderStatus[] = ['paid'];

export const PRODUCT_TYPES = ['physical', 'digital'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
