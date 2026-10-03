import { requireRole } from '@/lib/auth/rbac';
import { listOrdersForFulfilment, readDeliveryAddress } from '@/lib/orders';
import { formatDate } from '@/lib/format';
import { formatNaira } from '@/lib/format';
import { markOrderFulfilledAction } from './actions';

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const admin = await requireRole('admin', 'super_admin');
  const query = await searchParams;

  // Decrypting the address is a read of sensitive personal data (SEC-017), so it
  // is done here — on the server — and each call writes an audit entry naming the
  // admin who looked.
  const orders = await listOrdersForFulfilment();
  const resolved = await Promise.all(
    orders.map(async (order) => ({
      ...order,
      deliveryAddress:
        order.fulfilmentType === 'delivery' ? await readDeliveryAddress(order.id, admin.id) : null,
    })),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="headline-medium text-on-surface">Order fulfilment</h1>
      <p className="body-large text-on-surface-variant mt-3">
        Physical orders that have been paid for and are waiting to be delivered or collected.
        Digital products are delivered on payment and do not appear here.
      </p>

      {query.status === 'fulfilled' ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          That order has been marked fulfilled.
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {query.error}
        </p>
      ) : null}

      <section aria-labelledby="queue" className="mt-8">
        <h2 id="queue" className="title-large text-on-surface">
          Awaiting fulfilment
        </h2>
        {resolved.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-3">
            Nothing is waiting. Paid physical orders appear here.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {resolved.map((order) => (
              <li key={order.id} className="bg-surface-container rounded-2xl p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title-medium text-on-surface">{order.productName}</h3>
                  <span className="label-large text-primary">
                    {order.fulfilmentType === 'delivery' ? 'Deliver' : 'Collect'}
                  </span>
                </div>
                <p className="body-large text-on-surface-variant mt-1">
                  {order.memberName} &middot; {order.memberEmail}
                </p>
                <dl className="body-medium text-on-surface-variant mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt>Quantity</dt>
                  <dd>{order.quantity}</dd>
                  <dt>Total</dt>
                  <dd>{formatNaira(order.totalKobo)}</dd>
                  <dt>Paid</dt>
                  <dd>{formatDate(order.createdAt)}</dd>
                </dl>

                {order.fulfilmentType === 'delivery' ? (
                  <div className="mt-3">
                    <p className="label-medium text-on-surface">Delivery address</p>
                    <p className="body-large text-on-surface-variant mt-1">
                      {order.deliveryAddress ?? 'Address unavailable — ask the member.'}
                    </p>
                  </div>
                ) : null}

                <form action={markOrderFulfilledAction} className="mt-4">
                  <input type="hidden" name="orderId" value={order.id} />
                  <button
                    type="submit"
                    className="bg-primary text-on-primary rounded-full px-6 py-3 label-large"
                  >
                    Mark fulfilled
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
