import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { formatNaira } from '@/lib/format';
import { listUpgradeOptions } from '@/lib/member';

/**
 * The member's own pricing (D-2).
 *
 * D-2 split the two surfaces deliberately: public pages show official list prices
 * only, and the discounted figure appears **here**, on the member's dashboard,
 * where eligibility has been computed. This is that surface.
 *
 * What is on it, and why:
 *
 *  - `priced.amountKobo` is what this member would actually be charged, after
 *    BR-003 (list price minus list price), BR-004 (the difference only applies if
 *    the previous tier is paid **and** completed), and BR-005 (the 50% Advanced
 *    discount, first Advanced purchase, first-time subscribers only).
 *  - The struck-through list price is shown next to it so the member can see what
 *    they are being credited. For an upgrade, the "list price" that matters is the
 *    *difference*, so it is labelled as such rather than implied.
 *  - The discount explanation names the rule that produced the figure. A member
 *    who does not get the discount is owed a reason.
 *
 * The amount is computed server-side and never read from a query parameter. A price
 * that arrived from the browser would be a price an attacker chose.
 */
export default async function MemberPricingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { options } = await listUpgradeOptions(user.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="title-small text-on-surface-variant">Member area</p>
          <h1 className="headline-medium mt-2 text-on-surface">Your membership pricing</h1>
        </div>
        <Link
          href="/dashboard"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>

      <p className="body-large text-on-surface-variant mt-3">
        These are the prices for you specifically, based on your membership history. Public pricing
        shows list prices; these figures apply the upgrade and first-purchase rules to your account.
      </p>

      <ul className="mt-8 grid gap-4">
        {options.map(({ tier, priced, discountApplies }) => (
          <li
            key={tier.id}
            className="rounded-2xl border border-outline-variant bg-surface-container p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="title-large text-on-surface">{tier.name}</h2>

              {priced === null ? (
                <p className="body-medium text-on-surface-variant">Currently unavailable</p>
              ) : priced.isFree ? (
                <p className="title-large text-on-surface">Free</p>
              ) : (
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="title-large text-on-surface">
                    {formatNaira(priced.amountKobo)}
                  </span>
                  {discountApplies ? (
                    <>
                      <span className="body-medium text-on-surface-variant line-through">
                        {formatNaira(tier.priceKobo)}
                      </span>
                      <span className="label-small bg-primary-container text-on-primary-container rounded-full px-2 py-1">
                        First-purchase discount
                      </span>
                    </>
                  ) : null}
                  {priced.isUpgrade ? (
                    <span className="label-small bg-secondary-container text-on-secondary-container rounded-full px-2 py-1">
                      Upgrade difference
                    </span>
                  ) : null}
                </p>
              )}
            </div>

            <p className="body-medium text-on-surface-variant mt-3">
              {priced === null
                ? 'This tier cannot be purchased right now. Please contact EHEMS.'
                : priced.isFree
                  ? 'No payment required.'
                  : priced.isUpgrade
                    ? 'Calculated from the official list prices of both tiers — not from what you paid, so a discount you already received is not credited again.'
                    : discountApplies
                      ? 'Your first Advanced purchase as a first-time subscriber: 50% of the official list price.'
                      : 'Official list price.'}
            </p>
          </li>
        ))}
      </ul>

      <p className="body-medium text-on-surface-variant mt-8">
        Membership is a one-time payment. There are no recurring charges (BR-001). To change tier,
        submit your payment from the{' '}
        <Link
          href="/dashboard/payments"
          className="text-primary underline-offset-4 hover:underline"
        >
          payments page
        </Link>
        .
      </p>
    </div>
  );
}
