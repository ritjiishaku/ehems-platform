import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cancelOrder,
  listActiveProducts,
  listOrdersForFulfilment,
  listOrdersForMember,
  listProductEntitlementGrants,
  markOrderFulfilled,
  placeOrder,
  readDeliveryAddress,
} from '@/lib/orders';
import { openForReview, verifyPayment } from '@/lib/payments';
import { prisma } from '@/lib/db/client';

const suffix = randomBytes(4).toString('hex');

// `placeOrder` seals the delivery address, which needs a key.
const TEST_KEY = randomBytes(32).toString('base64');

let adminId = '';
let physicalId = '';
let digitalId = '';
let entitlingId = '';
const orderIds: string[] = [];
const userIds: string[] = [];

beforeAll(async () => {
  process.env.ORDER_ADDRESS_ENCRYPTION_KEY = TEST_KEY;

  const admin = await prisma.user.create({
    data: {
      email: `order-admin-${suffix}@example.test`,
      name: 'Order Admin',
      passwordHash: 'x',
      roleId: 'role-super-admin',
    },
  });
  adminId = admin.id;
  userIds.push(admin.id);

  const physical = await prisma.product.create({
    data: {
      name: `Physical Book ${suffix}`,
      description: 'A book.',
      productType: 'physical',
      priceKobo: 250_000,
    },
  });
  const digital = await prisma.product.create({
    data: {
      name: `Digital Podcast ${suffix}`,
      description: 'A download.',
      productType: 'digital',
      priceKobo: 50_000,
    },
  });
  const entitling = await prisma.product.create({
    data: {
      name: `Community Book ${suffix}`,
      description: 'Unlocks a room.',
      productType: 'physical',
      priceKobo: 100_000,
      entitlementGranted: true,
    },
  });
  physicalId = physical.id;
  digitalId = digital.id;
  entitlingId = entitling.id;

  // PRD §16.3: community access is an entitlement on a product, reusing the
  // accessLevel vocabulary CommunityLink already uses.
  await prisma.productEntitlement.create({
    data: {
      productId: entitling.id,
      entitlementType: 'community_access',
      entitlementValue: 'ehems_open_sales',
    },
  });
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.productEntitlement.deleteMany({ where: { productId: entitlingId } });
  await prisma.product.deleteMany({ where: { id: { in: [physicalId, digitalId, entitlingId] } } });
  for (const id of userIds) {
    await prisma.user
      .update({
        where: { id },
        data: {
          email: `erased-order-${id.slice(-6)}-${suffix}@anonymised.invalid`,
          name: 'Erased user',
          deletedAt: new Date(),
        },
      })
      .catch(() => null);
  }
  delete process.env.ORDER_ADDRESS_ENCRYPTION_KEY;
  await prisma.$disconnect();
});

/**
 * A fresh member per test.
 *
 * `payment_one_pending_per_user` (20260929150000) allows one open payment per
 * member at a time, across tiers *and* orders. That is deliberate, so each test
 * buys as its own member rather than sharing one and cancelling between orders.
 */
async function makeBuyer(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `buyer-${randomBytes(6).toString('hex')}@example.test`,
      name: 'Buyer',
      passwordHash: 'x',
    },
  });
  userIds.push(user.id);
  return user.id;
}

type OrderOptions = {
  userId: string;
  productId?: string;
  quantity?: number;
  fulfilmentType?: 'delivery' | 'collection';
  deliveryAddress?: string;
};

async function order(options: OrderOptions) {
  const result = await placeOrder({
    userId: options.userId,
    productId: options.productId ?? physicalId,
    quantity: options.quantity ?? 1,
    fulfilmentType: options.fulfilmentType,
    deliveryAddress: options.deliveryAddress,
  });
  if (result.ok) orderIds.push(result.orderId);
  return result;
}

/**
 * Walk an order's payment through to verified, the way an admin would.
 *
 * `pending → submitted → under_review → verified` is the real state machine
 * (AGENTS.md §4), so the test drives every hop rather than writing `verified`
 * directly — otherwise it would not be testing the path that moves the order.
 */
async function payOrder(orderId: string) {
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'submitted', submittedAt: new Date() },
  });

  const opened = await openForReview(payment.id, adminId);
  if (!opened.ok) throw new Error(`openForReview failed: ${JSON.stringify(opened)}`);

  const result = await verifyPayment(payment.id, adminId);
  if (!result.ok) throw new Error(`verifyPayment failed: ${JSON.stringify(result)}`);
}

describe('placing an order', () => {
  it('lists active products with their list price', async () => {
    const products = await listActiveProducts();
    const book = products.find((p) => p.id === physicalId);
    expect(book?.priceKobo).toBe(250_000);
    expect(book?.productType).toBe('physical');
  });

  it('multiplies list price by quantity with no tier discount applied', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection', quantity: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    // The tier discount rules (BR-005/006/007) are about a first Advanced-tier
    // purchase. Applying them to a product would invent a commercial policy.
    expect(row.totalKobo).toBe(750_000);
  });

  it('opens a pending payment and grants nothing yet', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: result.orderId },
      include: { payments: true },
    });
    expect(row.status).toBe('pending_payment');
    expect(row.payments).toHaveLength(1);
    expect(row.payments[0].status).toBe('pending');
    // AGENTS.md §4: an order existing is not entitlement.
    expect(row.payments[0].orderId).toBe(row.id);
    expect(row.payments[0].enrolmentId).toBeNull();
    expect(await listProductEntitlementGrants(buyer)).toEqual([]);
  });

  it('snapshots the product name so a rename cannot rewrite history', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await prisma.product.update({ where: { id: physicalId }, data: { name: 'Renamed' } });
    const row = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(row.productNameSnapshot).toBe(`Physical Book ${suffix}`);

    await prisma.product.update({
      where: { id: physicalId },
      data: { name: `Physical Book ${suffix}` },
    });
  });

  it('allows only one open payment per member, across tiers and orders', async () => {
    // Pre-existing deliberate constraint (payment_one_pending_per_user), not new
    // behaviour: a member resolves their outstanding payment before opening another.
    const buyer = await makeBuyer();
    expect((await order({ userId: buyer, fulfilmentType: 'collection' })).ok).toBe(true);

    const second = await order({ userId: buyer, fulfilmentType: 'collection' });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toContain('open payment');
  });

  it('refuses a quantity outside 1 to 99 even when the caller skips the schema', async () => {
    const buyer = await makeBuyer();
    for (const quantity of [0, -1, 1.5, 100]) {
      const result = await order({ userId: buyer, fulfilmentType: 'collection', quantity });
      expect(result.ok).toBe(false);
    }
  });

  it('refuses an inactive product', async () => {
    const buyer = await makeBuyer();
    await prisma.product.update({ where: { id: physicalId }, data: { active: false } });
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    await prisma.product.update({ where: { id: physicalId }, data: { active: true } });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('not available');
  });
});

describe('BR-013 — physical products are fulfilled manually', () => {
  it('refuses a physical order with no fulfilment choice', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('delivered or collected');
  });

  it('refuses a fulfilment type on a digital product', async () => {
    // The invariant PostgreSQL cannot express: the check needs a subquery on
    // product_type, and CHECK forbids subqueries. Asserted here instead.
    const buyer = await makeBuyer();
    const result = await order({
      userId: buyer,
      productId: digitalId,
      fulfilmentType: 'delivery',
      deliveryAddress: '1 Ana St',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('digitally');
  });

  it('accepts a digital order with no fulfilment detail', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, productId: digitalId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(row.fulfilmentType).toBeNull();
    expect(row.deliveryAddressEncrypted).toBeNull();
  });

  it('refuses a delivered order with no address', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'delivery' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('delivery address');
  });

  it('refuses an address on a collection order rather than storing it', async () => {
    const buyer = await makeBuyer();
    const result = await order({
      userId: buyer,
      fulfilmentType: 'collection',
      deliveryAddress: '1 Ana Street, Lagos',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('does not need');
  });
});

describe('SEC-017 — the delivery address is encrypted at rest', () => {
  it('never writes plaintext, and round-trips for an admin', async () => {
    const buyer = await makeBuyer();
    const address = '17 Bourdillon Road, Ikoyi, Lagos';
    const result = await order({
      userId: buyer,
      fulfilmentType: 'delivery',
      deliveryAddress: address,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(row.deliveryAddressEncrypted).not.toBeNull();
    // The single most important assertion in this block.
    expect(row.deliveryAddressEncrypted).not.toContain(address);
    expect(row.deliveryAddressEncrypted).not.toContain('Bourdillon');

    expect(await readDeliveryAddress(result.orderId, adminId)).toBe(address);
  });

  it('audits an admin reading the address', async () => {
    const buyer = await makeBuyer();
    const result = await order({
      userId: buyer,
      fulfilmentType: 'delivery',
      deliveryAddress: '5 Awolowo Road',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await readDeliveryAddress(result.orderId, adminId);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: result.orderId, action: 'ORDER_DELIVERY_ADDRESS_VIEWED' },
    });
    expect(audit?.actorId).toBe(adminId);
  });

  it('records only the presence of an address in the audit log, not its value', async () => {
    const buyer = await makeBuyer();
    const result = await order({
      userId: buyer,
      fulfilmentType: 'delivery',
      deliveryAddress: '9 Awokoye Street, Yaba',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: result.orderId, action: 'ORDER_PLACED' },
    });
    // The audit log is append-only and long-lived, so plaintext must not be
    // copied into it even though the row already holds it encrypted.
    expect(JSON.stringify(audit.metadata)).not.toContain('Awokoye');
    expect(audit.metadata).toMatchObject({ deliveryAddressCaptured: true });
  });

  it('returns null for a non-delivery order instead of throwing', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    if (!result.ok) throw new Error('setup failed');

    expect(await readDeliveryAddress(result.orderId, adminId)).toBeNull();
  });
});

describe('payment verification is the only path to paid', () => {
  it('leaves an unpaid order unpaid and ungranted', async () => {
    const buyer = await makeBuyer();
    const result = await order({
      userId: buyer,
      productId: entitlingId,
      fulfilmentType: 'collection',
    });
    if (!result.ok) throw new Error('setup failed');

    expect((await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } })).status).toBe(
      'pending_payment',
    );
    expect(await listProductEntitlementGrants(buyer)).toEqual([]);
  });

  it('settles the order in the same transaction that verifies the payment', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection', quantity: 2 });
    if (!result.ok) throw new Error('setup failed');

    await payOrder(result.orderId);

    const row = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(row.status).toBe('paid');

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: result.orderId, action: 'ORDER_PAID' },
    });
    expect(audit?.metadata).toMatchObject({ to: 'paid', amountMatchesOrder: true });
  });

  it('grants a product entitlement only once the payment is verified', async () => {
    const buyer = await makeBuyer();
    const result = await order({
      userId: buyer,
      productId: entitlingId,
      fulfilmentType: 'collection',
    });
    if (!result.ok) throw new Error('setup failed');

    // Placed but unpaid: no grant, even though the product grants one.
    expect(await listProductEntitlementGrants(buyer)).toEqual([]);

    await payOrder(result.orderId);

    expect(await listProductEntitlementGrants(buyer)).toEqual([
      {
        entitlementType: 'community_access',
        entitlementValue: 'ehems_open_sales',
        productId: entitlingId,
        productName: `Community Book ${suffix}`,
      },
    ]);
  });

  it('grants nothing for a rejected payment', async () => {
    const buyer = await makeBuyer();
    const result = await order({
      userId: buyer,
      productId: entitlingId,
      fulfilmentType: 'collection',
    });
    if (!result.ok) throw new Error('setup failed');

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: result.orderId } });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'rejected', rejectionReason: 'test' },
    });

    expect(await listProductEntitlementGrants(buyer)).toEqual([]);
  });

  it('grants nothing for a product with no entitlements', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    if (!result.ok) throw new Error('setup failed');

    await payOrder(result.orderId);
    expect(await listProductEntitlementGrants(buyer)).toEqual([]);
  });
});

describe('fulfilment queue', () => {
  it('lists only paid physical orders, never digital or unpaid ones', async () => {
    const buyerA = await makeBuyer();
    const buyerB = await makeBuyer();
    const physical = await order({ userId: buyerA, fulfilmentType: 'collection' });
    if (!physical.ok) throw new Error('setup failed');
    const digital = await order({ userId: buyerB, productId: digitalId });
    if (!digital.ok) throw new Error('setup failed');

    const unpaidBuyer = await makeBuyer();
    const unpaid = await order({ userId: unpaidBuyer, fulfilmentType: 'collection' });
    if (!unpaid.ok) throw new Error('setup failed');

    await payOrder(physical.orderId);
    await payOrder(digital.orderId);

    const queue = await listOrdersForFulfilment();
    const queuedIds = queue.map((entry) => entry.id);
    expect(queuedIds).toContain(physical.orderId);
    // A digital product is delivered on payment; putting it in a courier queue
    // sends an admin looking for a parcel that was never going to exist.
    expect(queuedIds).not.toContain(digital.orderId);
    expect(queuedIds).not.toContain(unpaid.orderId);
  });

  it('marks a paid order fulfilled', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    if (!result.ok) throw new Error('setup failed');
    await payOrder(result.orderId);

    expect((await markOrderFulfilled(result.orderId, adminId)).ok).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } })).status).toBe(
      'fulfilled',
    );
  });

  it('refuses to fulfil an unpaid order', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    if (!result.ok) throw new Error('setup failed');

    const fulfilled = await markOrderFulfilled(result.orderId, adminId);
    expect(fulfilled.ok).toBe(false);
    if (!fulfilled.ok) expect(fulfilled.message).toContain('paid order');
  });

  it('refuses to fulfil the same order twice', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    if (!result.ok) throw new Error('setup failed');
    await payOrder(result.orderId);
    await markOrderFulfilled(result.orderId, adminId);

    expect((await markOrderFulfilled(result.orderId, adminId)).ok).toBe(false);
  });
});

describe('cancellation', () => {
  it('cancels an unpaid order', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    if (!result.ok) throw new Error('setup failed');

    expect((await cancelOrder(result.orderId, buyer)).ok).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } })).status).toBe(
      'cancelled',
    );
  });

  it('refuses to cancel a paid order, because that is a refund conversation', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    if (!result.ok) throw new Error('setup failed');
    await payOrder(result.orderId);

    const cancelled = await cancelOrder(result.orderId, buyer);
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) expect(cancelled.message).toContain('refund');
  });

  it('refuses to cancel twice', async () => {
    const buyer = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    if (!result.ok) throw new Error('setup failed');

    await cancelOrder(result.orderId, buyer);
    expect((await cancelOrder(result.orderId, buyer)).ok).toBe(false);
  });

  it('refuses to cancel another member order', async () => {
    const buyer = await makeBuyer();
    const attacker = await makeBuyer();
    const result = await order({ userId: buyer, fulfilmentType: 'collection' });
    if (!result.ok) throw new Error('setup failed');

    // An IDOR guard: `ownerId` must scope the lookup, or any member can cancel
    // any order by guessing a cuid.
    const cancelled = await cancelOrder(result.orderId, attacker, { ownerId: attacker });
    expect(cancelled.ok).toBe(false);
    // The message must not confirm the order exists.
    if (!cancelled.ok) expect(cancelled.message).toBe('That order no longer exists.');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } })).status).toBe(
      'pending_payment',
    );
  });
});

describe('member order history', () => {
  it('shows only the member own orders', async () => {
    const buyer = await makeBuyer();
    const other = await makeBuyer();
    const mine = await order({ userId: buyer, fulfilmentType: 'collection' });
    if (!mine.ok) throw new Error('setup failed');

    expect((await listOrdersForMember(buyer)).some((row) => row.id === mine.orderId)).toBe(true);
    expect((await listOrdersForMember(other)).some((row) => row.id === mine.orderId)).toBe(false);
  });

  it('reports whether an address was captured without exposing it', async () => {
    const buyer = await makeBuyer();
    const result = await order({
      userId: buyer,
      fulfilmentType: 'delivery',
      deliveryAddress: '2 Awokoye Street',
    });
    if (!result.ok) throw new Error('setup failed');

    const row = (await listOrdersForMember(buyer)).find((entry) => entry.id === result.orderId);
    expect(row?.hasDeliveryAddress).toBe(true);
    expect(JSON.stringify(row)).not.toContain('Awokoye');
  });
});
