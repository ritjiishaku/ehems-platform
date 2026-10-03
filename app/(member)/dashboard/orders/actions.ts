'use server';

import { redirect } from 'next/navigation';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { requireRole } from '@/lib/auth/rbac';
import { cancelOrder, placeOrder } from '@/lib/orders';
import { orderPlaceSchema } from '@/lib/validation/orders';

const BASE = '/dashboard/orders';

/**
 * Place a product order.
 *
 * The member is redirected to their order with the payment intent they will pay
 * against, because Phase 1 has no gateway: they bank-transfer and upload proof
 * exactly as they do for a tier (D-8).
 */
export async function placeOrderAction(formData: FormData): Promise<void> {
  const user = await requireRole('member', 'mentor', 'admin', 'super_admin');
  await assertSameOrigin();

  const rawFulfilment = formData.get('fulfilmentType');
  const rawAddress = formData.get('deliveryAddress');

  const parsed = orderPlaceSchema.safeParse({
    productId: formData.get('productId'),
    quantity: formData.get('quantity') ?? 1,
    // A radio group reports nothing when nothing is chosen, which is different
    // from an explicit choice, so "absent" must stay absent rather than
    // defaulting to collection.
    fulfilmentType:
      typeof rawFulfilment === 'string' && rawFulfilment.length > 0 ? rawFulfilment : undefined,
    deliveryAddress: typeof rawAddress === 'string' ? rawAddress : '',
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? 'Check your order details.';
    redirect(`${BASE}?error=${encodeURIComponent(first)}`);
  }

  const result = await placeOrder({
    userId: user.id,
    productId: parsed.data.productId,
    quantity: parsed.data.quantity,
    fulfilmentType: parsed.data.fulfilmentType,
    deliveryAddress: parsed.data.deliveryAddress,
  });

  if (!result.ok) {
    redirect(`${BASE}?error=${encodeURIComponent(result.message)}`);
  }

  // Straight to the payment step: an order with no payment is a dead end, and the
  // member's next action is to pay.
  redirect(`/dashboard/payments?orderId=${result.orderId}&paymentId=${result.paymentId}`);
}

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const user = await requireRole('member', 'mentor', 'admin', 'super_admin');
  await assertSameOrigin();

  const orderId = String(formData.get('orderId') ?? '');
  // `ownerId` is not optional here: without it a member could cancel anyone's
  // order by guessing an id.
  const result = await cancelOrder(orderId, user.id, { ownerId: user.id });

  if (!result.ok) {
    redirect(`${BASE}?error=${encodeURIComponent(result.message)}`);
  }

  redirect(`${BASE}?status=cancelled`);
}
