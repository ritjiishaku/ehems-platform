import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getMemberEntitlement, listAccessibleCommunityLinks } from '@/lib/member';

/**
 * Community links (BR-011).
 *
 * General community access is available to every tier including O'Free; EHEMS OPEN
 * sales and marketing benefits begin at Advanced Level IV. The gate is applied in
 * `lib/member/`, so a link a member cannot use is never rendered here.
 *
 * Every URL on this page is a `CommunityLink` row. No WhatsApp or Telegram URL is
 * written into this component (AGENTS.md §7: links are data, not code), which is
 * what lets an admin add or retire one without a code change.
 */
export default async function MemberCommunityPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [links, entitlement] = await Promise.all([
    listAccessibleCommunityLinks(user.id),
    getMemberEntitlement(user.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="title-small text-on-surface-variant">Member area</p>
          <h1 className="headline-medium mt-2 text-on-surface">Community</h1>
        </div>
        <Link
          href="/dashboard"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>

      {entitlement.tier === null ? (
        <p className="body-large text-on-surface-variant mt-8">
          Community links become available once your membership is active.
        </p>
      ) : (
        <>
          <p className="body-large text-on-surface-variant mt-3">
            {entitlement.communityAccess === 'ehems_open_sales'
              ? 'Your tier includes EHEMS OPEN sales and marketing benefits alongside the general community.'
              : 'Your tier includes general community access. EHEMS OPEN sales and marketing benefits begin at Advanced Level IV.'}
          </p>

          {links.length === 0 ? (
            <p className="body-large text-on-surface-variant mt-8">
              No community links have been published yet. EHEMS publishes these from the admin
              panel, so check back soon.
            </p>
          ) : (
            <ul className="mt-8 grid gap-3">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="rounded-2xl border border-outline-variant bg-surface-container p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="title-large text-on-surface">{link.name}</h2>
                    <span className="label-small text-on-surface-variant">
                      {link.accessLevel === 'ehems_open_sales' ? 'EHEMS OPEN' : 'Community'}
                    </span>
                  </div>
                  <p className="body-large mt-3">
                    <a
                      href={link.url}
                      className="text-primary underline-offset-4 hover:underline"
                      rel="noreferrer"
                    >
                      Open {link.name}
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
