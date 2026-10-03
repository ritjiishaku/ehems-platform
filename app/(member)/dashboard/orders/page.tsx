import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';
import { listActiveProducts, listOrdersForMember } from '@/lib/orders';
import { formatDate } from '@/lib/format';
import { formatNaira } from '@/lib/format';
import { ORDER_MEMBER_ACTIONABLE_STATUSES } from '@/lib/validation/orders';
import { cancelOrderAction, placeOrderAction } from './actions';

export default async function MemberOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const user = await requireRole('member', 'mentor', 'admin', 'super_admin');
  const query = await searchParams;
  const [products, orders] = await Promise.all([
    listActiveProducts(),
    listOrdersForMember(user.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Products &amp; orders</h1>
          <p className="body-large text-on-surface-variant mt-3">
            Order a physical or digital product. You pay by bank transfer and upload your receipt,
            the same way a tier payment works.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>

      {query.status === 'cancelled' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          That order has been cancelled.
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {query.error}
        </p>
      ) : null}

      <section aria-labelledby="catalogue" className="mt-8">
        <h2 id="catalogue" className="title-large text-on-surface">
          Catalogue
        </h2>
        {products.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-3">
            No products are available right now. Please check back later.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {products.map((product) => (
              <li key={product.id} className="bg-surface-container rounded-2xl p-5">
                <h3 className="title-medium text-on-surface">{product.name}</h3>
                <p className="body-large text-on-surface-variant mt-2">
                  {product.description ?? 'No description.'}
                </p>
                <p className="label-large text-primary mt-3">{formatNaira(product.priceKobo)}</p>
                <p className="body-medium text-on-surface-variant mt-1">
                  {product.productType === 'physical'
                    ? 'Physical — delivered or collected by the team.'
                    : 'Digital — available as soon as payment is verified.'}
                </p>

                <form action={placeOrderAction} className="mt-4">
                  <input type="hidden" name="productId" value={product.id} />

                  <label
                    className="label-medium text-on-surface"
                    htmlFor={`quantity-${product.id}`}
                  >
                    Quantity
                  </label>
                  <input
                    id={`quantity-${product.id}`}
                    name="quantity"
                    type="number"
                    min={1}
                    max={99}
                    defaultValue={1}
                    className="border-outline text-on-surface mt-1 w-24 rounded-lg border px-3 py-2"
                  />

                  {product.productType === 'physical' ? (
                    <fieldset className="mt-4">
                      <legend className="label-medium text-on-surface">
                        How would you like it?
                      </legend>
                      <label className="body-large text-on-surface mt-2 flex items-center gap-2">
                        <input type="radio" name="fulfilmentType" value="delivery" required />{' '}
                        Delivered
                      </label>
                      <label className="body-large text-on-surface mt-1 flex items-center gap-2">
                        <input type="radio" name="fulfilmentType" value="collection" /> I will
                        collect
                      </label>

                      <label
                        className="label-medium text-on-surface mt-4 block"
                        htmlFor={`address-${product.id}`}
                      >
                        Delivery address
                      </label>
                      <textarea
                        id={`address-${product.id}`}
                        name="deliveryAddress"
                        rows={3}
                        className="border-outline text-on-surface mt-1 w-full rounded-lg border px-3 py-2"
                      />
                      <p className="body-small text-on-surface-variant mt-1">
                        Only needed if you choose delivery. Stored encrypted.
                      </p>
                    </fieldset>
                  ) : null}

                  <button
                    type="submit"
                    className="bg-primary text-on-primary mt-4 rounded-full px-6 py-3 label-large"
                  >
                    Place order
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history" className="mt-10">
        <h2 id="history" className="title-large text-on-surface">
          Your orders
        </h2>
        {orders.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-3">
            You have not ordered anything yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {orders.map((order) => (
              <li key={order.id} className="bg-surface-container rounded-2xl p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title-medium text-on-surface">{order.productName}</h3>
                  <span className="label-large text-on-surface-variant">{order.statusLabel}</span>
                </div>
                <dl className="body-medium text-on-surface-variant mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt>Quantity</dt>
                  <dd>{order.quantity}</dd>
                  <dt>Total</dt>
                  <dd>{formatNaira(order.totalKobo)}</dd>
                  <dt>Placed</dt>
                  <dd>{formatDate(order.createdAt)}</dd>
                  <dt>Fulfilment</dt>
                  <dd>
                    {order.fulfilmentType === 'delivery'
                      ? 'Delivery'
                      : order.fulfilmentType === 'collection'
                        ? 'Collection'
                        : 'Digital'}
                  </dd>
                </dl>
                {order.status === 'pending_payment' ? (
                  <Link
                    href="/dashboard/payments"
                    className="text-label-large text-primary mt-3 inline-block underline-offset-4 hover:underline"
                  >
                    Pay for this order
                  </Link>
                ) : null}
                {ORDER_MEMBER_ACTIONABLE_STATUSES.includes(order.status) ? (
                  <form action={cancelOrderAction} className="mt-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <button
                      type="submit"
                      className="text-error label-large underline-offset-4 hover:underline"
                    >
                      Cancel order
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
