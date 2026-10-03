/**
 * Product orders (FR-049, BR-013).
 *
 * ## The rule this module exists to enforce
 *
 * An order grants nothing. A `paid` order means money arrived, not that the
 * member owns the thing — entitlement for a product is derived from a **Verified**
 * payment, exactly as a tier enrolment is (AGENTS.md §4, SEC-007). Concretely:
 *
 *   - placing an order creates a `pending` payment; it grants nothing
 *   - `verifyPayment` flips the order to `paid` in the same transaction that
 *     verifies the payment, via `settleOrderFromVerifiedPayment`
 *   - community access a product unlocks is computed from
 *     "verified payment for a product that has entitlements", never from the
 *     order existing
 *
 * This is the same seam that already exists between payment and enrolment, for the
 * same reason: the client has been burned by systems that conflate them.
 *
 * ## Provisional status vocabulary
 *
 * See docs/decisions.md D-10. The PRD does not settle these values. They are a
 * technical recommendation and must be confirmed before launch.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { orderAddressKey, openFromBase64, sealToBase64 } from '@/lib/crypto/seal';
import {
  isOrderStatus,
  ORDER_FULFILMENT_QUEUE_STATUSES,
  ORDER_STATUS_LABELS,
  type FulfilmentType,
  type OrderStatus,
  type ProductType,
  MAX_ORDER_QUANTITY,
} from '@/lib/validation/orders';

export type OrderOutcome<T> = ({ ok: true } & T) | { ok: false; message: string };

export type CatalogueProduct = {
  id: string;
  name: string;
  description: string | null;
  productType: ProductType;
  priceKobo: number;
  currency: string;
  entitlementGranted: boolean;
};

export type MemberOrder = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  totalKobo: number;
  currency: string;
  status: OrderStatus;
  statusLabel: string;
  fulfilmentType: FulfilmentType | null;
  hasDeliveryAddress: boolean;
  createdAt: Date;
  paymentStatus: string | null;
};

export type FulfilmentOrder = MemberOrder & {
  userId: string;
  memberName: string;
  memberEmail: string;
  /**
   * Decrypted for the fulfilment screen only.
   *
   * Reading it writes an audit entry naming the admin, because a delivery address
   * is sensitive personal data under SEC-017 and "an admin looked at a member's
   * address" should not be invisible.
   */
  deliveryAddress: string | null;
};

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/**
 * Active products, cheapest first.
 *
 * `entitlementGranted` is read from the row rather than derived from the presence
 * of an entitlement, because PRD §16.3 lists it as its own column and a product
 * whose entitlements were removed should stop advertising what it unlocks.
 */
export async function listActiveProducts(): Promise<CatalogueProduct[]> {
  const rows = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ priceKobo: 'asc' }, { name: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    productType: row.productType as ProductType,
    priceKobo: row.priceKobo,
    currency: row.currency,
    entitlementGranted: row.entitlementGranted,
  }));
}

export async function getActiveProduct(productId: string): Promise<CatalogueProduct | null> {
  const row = await prisma.product.findFirst({ where: { id: productId, active: true } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    productType: row.productType as ProductType,
    priceKobo: row.priceKobo,
    currency: row.currency,
    entitlementGranted: row.entitlementGranted,
  };
}

// ---------------------------------------------------------------------------
// Placing an order
// ---------------------------------------------------------------------------

export type PlaceOrderInput = {
  userId: string;
  productId: string;
  quantity: number;
  fulfilmentType?: FulfilmentType;
  deliveryAddress?: string;
};

/**
 * Place an order and open its payment intent.
 *
 * ## Pricing
 *
 * The total is the product's own list price times quantity. The tier discount
 * machinery (BR-005/BR-006/BR-007) deliberately does **not** apply: those rules
 * are about a *first-time subscriber's first Advanced-tier purchase*, and
 * extending them to products would be inventing a commercial policy the client
 * never agreed to.
 *
 * ## Payment
 *
 * A `pending` Payment is created in the same transaction as the order so the pair
 * cannot exist apart. `enrolmentId` stays null: a payment pays for one subject,
 * and this one pays for the order. The database cannot enforce "at most one"
 * meaningfully because both FKs are ON DELETE SET NULL (see the migration note),
 * so the refusal is explicit here.
 */
export async function placeOrder(
  input: PlaceOrderInput,
): Promise<OrderOutcome<{ orderId: string; paymentId: string }>> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || user.deletedAt) return { ok: false, message: 'That account is not available.' };

  const product = await prisma.product.findFirst({
    where: { id: input.productId, active: true },
  });
  if (!product) return { ok: false, message: 'That product is not available.' };

  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_QUANTITY) {
    return { ok: false, message: `Choose a quantity between 1 and ${MAX_ORDER_QUANTITY}.` };
  }

  // BR-013 applies to physical products only. This is the invariant the migration
  // cannot express (PostgreSQL forbids subqueries in CHECK), so it is asserted
  // here and pinned by test/order-workflow.db.test.ts.
  const isPhysical = product.productType === 'physical';
  const fulfilment = input.fulfilmentType ?? null;
  const address = (input.deliveryAddress ?? '').trim();

  if (isPhysical && !fulfilment) {
    return {
      ok: false,
      message: 'Choose whether this order will be delivered or collected.',
    };
  }
  if (!isPhysical && fulfilment) {
    return {
      ok: false,
      message: 'This product is delivered digitally, so it has no delivery or collection.',
    };
  }
  if (fulfilment === 'delivery' && !address) {
    return { ok: false, message: 'Enter a delivery address for a delivered order.' };
  }
  // Collection implies the member collects it, so an address would only be extra
  // personal data we do not need — and SEC-017 means not collecting it is the
  // cheaper default.
  if (fulfilment === 'collection' && address) {
    return { ok: false, message: 'A collection order does not need a delivery address.' };
  }

  const totalKobo = product.priceKobo * quantity;
  if (product.priceKobo <= 0) {
    return { ok: false, message: 'That product has no price set. Contact the team.' };
  }

  // Encrypted before it reaches the database. A home address is sensitive
  // personal data (SEC-017) and `Order.deliveryAddressEncrypted` is the only copy.
  const sealedAddress = fulfilment === 'delivery' ? sealToBase64(address, orderAddressKey()) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId: input.userId,
          productId: product.id,
          quantity,
          totalKobo,
          currency: product.currency,
          status: 'pending_payment',
          fulfilmentType: fulfilment,
          deliveryAddressEncrypted: sealedAddress,
          productNameSnapshot: product.name,
        },
      });

      const payment = await tx.payment.create({
        data: {
          userId: input.userId,
          orderId: order.id,
          amountKobo: totalKobo,
          currency: product.currency,
          status: 'pending',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: 'ORDER_PLACED',
          entityType: 'Order',
          entityId: order.id,
          metadata: {
            productId: product.id,
            productName: product.name,
            productType: product.productType,
            quantity,
            totalKobo,
            currency: product.currency,
            fulfilmentType: fulfilment,
            // Presence, never the value: the audit log is append-only and
            // long-lived, so the plaintext address must not be copied into it.
            deliveryAddressCaptured: sealedAddress !== null,
            paymentId: payment.id,
          },
        },
      });

      return { ok: true as const, orderId: order.id, paymentId: payment.id };
    });
  } catch (error) {
    // `payment_one_open_intent_per_order` is a partial unique index, so a
    // double-tap lands here as a unique violation rather than two payments.
    if (isUniqueViolation(error)) {
      return { ok: false, message: 'You already have an open payment for this order.' };
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function toMemberOrder(row: {
  id: string;
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  totalKobo: number;
  currency: string;
  status: string;
  fulfilmentType: string | null;
  deliveryAddressEncrypted: string | null;
  createdAt: Date;
  payments?: { status: string }[];
}): MemberOrder {
  const status = isOrderStatus(row.status) ? row.status : 'pending_payment';
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productNameSnapshot,
    quantity: row.quantity,
    totalKobo: row.totalKobo,
    currency: row.currency,
    status,
    statusLabel: ORDER_STATUS_LABELS[status],
    fulfilmentType: (row.fulfilmentType as FulfilmentType | null) ?? null,
    hasDeliveryAddress: row.deliveryAddressEncrypted !== null,
    createdAt: row.createdAt,
    paymentStatus: row.payments?.[0]?.status ?? null,
  };
}

/** A member's own order history, newest first. Scoped to the member in SQL. */
export async function listOrdersForMember(userId: string): Promise<MemberOrder[]> {
  const rows = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { payments: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return rows.map(toMemberOrder);
}

export async function getOrderForMember(
  orderId: string,
  userId: string,
): Promise<MemberOrder | null> {
  const row = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { payments: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return row ? toMemberOrder(row) : null;
}

/**
 * The admin fulfilment queue: paid orders awaiting manual delivery or collection.
 *
 * Physical only. A digital product is delivered on payment, so a digital order
 * never waits in this queue — if one appears it is a bug, and listing it here
 * would send an admin looking for a courier for something already sent.
 */
export async function listOrdersForFulfilment(): Promise<FulfilmentOrder[]> {
  const rows = await prisma.order.findMany({
    where: { status: { in: [...ORDER_FULFILMENT_QUEUE_STATUSES] } },
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { name: true, email: true } },
      product: { select: { productType: true } },
      payments: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  return rows
    .filter((row) => row.product.productType === 'physical')
    .map((row) => {
      const order = toMemberOrder(row);
      return {
        ...order,
        userId: row.userId,
        memberName: row.user.name,
        memberEmail: row.user.email,
        deliveryAddress: null,
      };
    });
}

/**
 * Decrypt one order's delivery address for an admin fulfilment view.
 *
 * Audited, and only ever called for an order already in the fulfilment queue —
 * the caller cannot pass an arbitrary member id. Returns `null` rather than
 * throwing if the payload cannot be opened, so a key rotation does not take the
 * whole queue down; the admin sees "address unavailable" and asks the member.
 */
export async function readDeliveryAddress(
  orderId: string,
  adminId: string,
): Promise<string | null> {
  const row = await prisma.order.findFirst({
    where: { id: orderId, fulfilmentType: 'delivery' },
    select: { id: true, deliveryAddressEncrypted: true, userId: true },
  });
  if (!row?.deliveryAddressEncrypted) return null;

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: 'ORDER_DELIVERY_ADDRESS_VIEWED',
      entityType: 'Order',
      entityId: row.id,
      metadata: { memberId: row.userId, reason: 'fulfilment' },
    },
  });

  return openFromBase64(row.deliveryAddressEncrypted, orderAddressKey());
}

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------

/**
 * Mark a paid order fulfilled.
 *
 * `paid → fulfilled` only. There is no un-fulfil: once a courier has taken the
 * parcel, "un-delivering" is not a state, and inventing one would let an admin
 * silently hand back an entitlement they already granted.
 */
export async function markOrderFulfilled(
  orderId: string,
  adminId: string,
): Promise<OrderOutcome<{ status: OrderStatus }>> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, message: 'That order no longer exists.' };
  if (!isOrderStatus(order.status) || !ORDER_FULFILMENT_QUEUE_STATUSES.includes(order.status)) {
    return {
      ok: false,
      message: `Only a paid order can be marked fulfilled. This one is ${order.status}.`,
    };
  }

  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: order.status },
    data: { status: 'fulfilled' },
  });
  if (claimed.count !== 1) {
    return {
      ok: false,
      message: 'Someone else updated this order a moment ago. Reload and try again.',
    };
  }

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: 'ORDER_FULFILLED',
      entityType: 'Order',
      entityId: orderId,
      metadata: {
        from: order.status,
        to: 'fulfilled',
        fulfilmentType: order.fulfilmentType,
        totalKobo: order.totalKobo,
        currency: order.currency,
      },
    },
  });

  return { ok: true, status: 'fulfilled' };
}

/**
 * `ownerId` scopes the lookup, and a member-supplied call **must** pass it.
 * Without the scope this is an IDOR: any authenticated member could cancel any
 * order in the system by guessing a cuid, so the admin path (which omits it) is
 * the only one allowed to reach another member's order.
 *
 * Cancel an order that has not been paid for.
 *
 * Refuses once the payment is verified. Cancelling a paid order would refund
 * nothing and leave a member who has handed over money with no order — that is a
 * refund conversation for the team, not a status click.
 */
export async function cancelOrder(
  orderId: string,
  actorId: string,
  options: { ownerId?: string } = {},
): Promise<OrderOutcome<{ status: OrderStatus }>> {
  const order = await prisma.order.findFirst({
    where: options.ownerId ? { id: orderId, userId: options.ownerId } : { id: orderId },
    include: { payments: { select: { status: true } } },
  });
  // A member asking for someone else's order gets "no longer exists" rather than
  // "not yours", so the response does not confirm that the order exists at all.
  if (!order) return { ok: false, message: 'That order no longer exists.' };
  if (order.status === 'cancelled')
    return { ok: false, message: 'That order is already cancelled.' };

  const paid = order.payments.some((payment) => payment.status === 'verified');
  if (paid) {
    return {
      ok: false,
      message: 'That order has a verified payment. Ask the team about a refund.',
    };
  }
  if (order.status !== 'pending_payment' && order.status !== 'awaiting_verification') {
    return { ok: false, message: `That order cannot be cancelled from ${order.status}.` };
  }

  const updated = await prisma.order.updateMany({
    where: { id: orderId, status: order.status },
    data: { status: 'cancelled' },
  });
  if (updated.count !== 1) {
    return {
      ok: false,
      message: 'Someone else updated this order a moment ago. Reload and try again.',
    };
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'ORDER_CANCELLED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { from: order.status, to: 'cancelled', totalKobo: order.totalKobo },
    },
  });

  return { ok: true, status: 'cancelled' };
}

// ---------------------------------------------------------------------------
// Payment hook
// ---------------------------------------------------------------------------

/**
 * Settle an order whose payment has just been verified.
 *
 * Called from inside `verifyPayment`'s transaction, with that transaction's
 * client. This is the only path by which an order becomes `paid` — there is no
 * admin action that does it, so "was the money actually received?" always has one
 * answer.
 *
 * Returns true when an order was settled, so the caller can include it in the
 * audit and notification it already writes.
 */
export async function settleOrderFromVerifiedPayment(
  tx: Prisma.TransactionClient,
  payment: { id: string; orderId: string | null; userId: string; amountKobo: number },
  actorId: string,
): Promise<boolean> {
  if (!payment.orderId) return false;

  const order = await tx.order.findUnique({ where: { id: payment.orderId } });
  if (!order) return false;

  // A second verification attempt cannot reach here (the payment state machine
  // refuses a verified payment), but an order cancelled by an admin before the
  // money cleared is reachable, and must not be resurrected silently.
  if (order.status === 'cancelled') {
    throw new Error(
      `Payment ${payment.id} verified against cancelled order ${order.id}. Refund or reinstate deliberately.`,
    );
  }
  if (order.status === 'paid' || order.status === 'fulfilled') return false;

  await tx.order.update({
    where: { id: order.id },
    data: { status: 'paid' },
  });

  await tx.auditLog.create({
    data: {
      actorId,
      action: 'ORDER_PAID',
      entityType: 'Order',
      entityId: order.id,
      metadata: {
        from: order.status,
        to: 'paid',
        paymentId: payment.id,
        amountKobo: payment.amountKobo,
        // Recorded so an admin can see at a glance whether the verified amount
        // matched the order, without joining two tables.
        orderTotalKobo: order.totalKobo,
        amountMatchesOrder: order.totalKobo === payment.amountKobo,
      },
    },
  });

  return true;
}

// ---------------------------------------------------------------------------
// Product entitlements
// ---------------------------------------------------------------------------

export type ProductEntitlementGrant = {
  entitlementType: string;
  entitlementValue: string;
  productId: string;
  productName: string;
};

/**
 * Entitlement grants a member holds by **verified payment**.
 *
 * The same shape AGENTS.md §4 mandates for tiers: derived from a Verified
 * payment, never from an order existing. `status: 'verified'` is the only thing
 * that counts, so an unpaid or rejected order grants nothing.
 */
export async function listProductEntitlementGrants(
  userId: string,
): Promise<ProductEntitlementGrant[]> {
  const rows = await prisma.payment.findMany({
    where: {
      userId,
      status: 'verified',
      orderId: { not: null },
    },
    select: {
      order: {
        select: {
          product: {
            select: {
              id: true,
              name: true,
              entitlements: { select: { entitlementType: true, entitlementValue: true } },
            },
          },
        },
      },
    },
  });

  const seen = new Set<string>();
  const grants: ProductEntitlementGrant[] = [];
  for (const row of rows) {
    const product = row.order?.product;
    if (!product) continue;
    for (const entitlement of product.entitlements) {
      const key = `${entitlement.entitlementType}:${entitlement.entitlementValue}`;
      if (seen.has(key)) continue;
      seen.add(key);
      grants.push({
        entitlementType: entitlement.entitlementType,
        entitlementValue: entitlement.entitlementValue,
        productId: product.id,
        productName: product.name,
      });
    }
  }
  return grants;
}
