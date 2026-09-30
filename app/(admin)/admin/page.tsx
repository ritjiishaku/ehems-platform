import { redirect } from 'next/navigation';

/**
 * The admin landing page is a redirect, not a hub.
 *
 * Payment verification is the surface an admin uses daily and data requests are
 * the one with a statutory clock, so neither should be "the" admin home. Sending
 * everyone to the queue is a product decision the client has not made; sending
 * them to the data-request queue implies the wrong one is the priority.
 */
export default function AdminIndexPage(): never {
  redirect('/admin/payments');
}
