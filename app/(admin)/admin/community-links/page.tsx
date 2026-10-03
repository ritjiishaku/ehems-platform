import Link from 'next/link';
import { requireRole } from '@/lib/auth/rbac';
import { listAllCommunityLinks, pinnableTierNames } from '@/lib/community';
import { COMMUNITY_ACCESS_LEVELS } from '@/lib/validation/community-links';
import {
  createCommunityLinkAction,
  setCommunityLinkActiveAction,
  updateCommunityLinkAction,
} from './actions';

const LEVEL_LABELS: Record<(typeof COMMUNITY_ACCESS_LEVELS)[number], string> = {
  general: 'General — every tier, including O’Free',
  ehems_open_sales: 'EHEMS OPEN — Advanced Level IV and above',
};

const STATUS_MESSAGES: Record<string, string> = {
  created: 'Link created.',
  updated: 'Link updated.',
  activated: 'Link activated.',
  withdrawn: 'Link withdrawn. Members can no longer see it.',
};

export default async function AdminCommunityLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  await requireRole('admin', 'super_admin');
  const query = await searchParams;
  const [links, tierNames] = await Promise.all([listAllCommunityLinks(), pinnableTierNames()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="headline-medium text-on-surface">Community links</h1>
          <p className="body-large text-on-surface-variant mt-3">
            Links live here as data, so a new platform can be added without a code change. Nothing
            in this codebase hardcodes a chat URL.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to admin
        </Link>
      </div>

      {query.status && STATUS_MESSAGES[query.status] ? (
        <p
          role="status"
          className="bg-primary-container text-on-primary-container mt-5 rounded-xl p-4"
        >
          {STATUS_MESSAGES[query.status]}
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="bg-error-container text-on-error-container mt-5 rounded-xl p-4">
          {query.error.replace(/\+/g, ' ')}
        </p>
      ) : null}

      <section aria-labelledby="new-link" className="mt-8">
        <h2 id="new-link" className="title-large text-on-surface">
          New link
        </h2>
        <form
          action={createCommunityLinkAction}
          className="border-outline-variant bg-surface-container-lowest mt-4 grid gap-4 rounded-2xl border p-5 sm:grid-cols-2"
        >
          <div>
            <label htmlFor="link-name" className="label-medium text-on-surface block font-medium">
              Name
            </label>
            <input
              id="link-name"
              name="name"
              required
              maxLength={200}
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="link-url" className="label-medium text-on-surface block font-medium">
              URL
            </label>
            <input
              id="link-url"
              name="url"
              type="url"
              required
              maxLength={2000}
              placeholder="https://"
              className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="link-access-level"
              className="label-medium text-on-surface block font-medium"
            >
              Who can see it
            </label>
            <select
              id="link-access-level"
              name="accessLevel"
              defaultValue="general"
              className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            >
              {COMMUNITY_ACCESS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="link-tier" className="label-medium text-on-surface block font-medium">
              Limit to one tier (optional)
            </label>
            <select
              id="link-tier"
              name="tierName"
              defaultValue=""
              className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
            >
              <option value="">Everyone at the access level above</option>
              {tierNames.map((name) => (
                <option key={name} value={name}>
                  {name} only
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="submit"
              className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors"
            >
              Add link
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="link-list" className="mt-10">
        <h2 id="link-list" className="title-large text-on-surface">
          All links
        </h2>
        {links.length === 0 ? (
          <p className="body-large text-on-surface-variant mt-4">No community links yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {links.map((link) => (
              <li
                key={link.id}
                className="border-outline-variant bg-surface-container-lowest rounded-2xl border p-5"
              >
                <form action={updateCommunityLinkAction}>
                  <input type="hidden" name="linkId" value={link.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`name-${link.id}`}
                        className="label-medium text-on-surface block font-medium"
                      >
                        Name
                      </label>
                      <input
                        id={`name-${link.id}`}
                        name="name"
                        defaultValue={link.name}
                        required
                        maxLength={200}
                        className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`url-${link.id}`}
                        className="label-medium text-on-surface block font-medium"
                      >
                        URL
                      </label>
                      <input
                        id={`url-${link.id}`}
                        name="url"
                        type="url"
                        defaultValue={link.url}
                        required
                        maxLength={2000}
                        className="border-outline bg-surface-container text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`level-${link.id}`}
                        className="label-medium text-on-surface block font-medium"
                      >
                        Who can see it
                      </label>
                      <select
                        id={`level-${link.id}`}
                        name="accessLevel"
                        defaultValue={link.accessLevel}
                        className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                      >
                        {COMMUNITY_ACCESS_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {LEVEL_LABELS[level]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor={`tier-${link.id}`}
                        className="label-medium text-on-surface block font-medium"
                      >
                        Limit to one tier
                      </label>
                      <select
                        id={`tier-${link.id}`}
                        name="tierName"
                        defaultValue={link.tierName ?? ''}
                        className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                      >
                        <option value="">Everyone at the access level</option>
                        {tierNames.map((name) => (
                          <option key={name} value={name}>
                            {name} only
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      className="bg-primary text-on-primary text-label-large hover:bg-primary/90 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors"
                    >
                      Save changes
                    </button>
                    <span
                      className={`label-large ${link.active ? 'text-primary' : 'text-on-surface-variant'}`}
                    >
                      {link.active ? 'Active' : 'Withdrawn'}
                    </span>
                  </div>
                </form>

                <form action={setCommunityLinkActiveAction} className="mt-3">
                  <input type="hidden" name="linkId" value={link.id} />
                  <input type="hidden" name="active" value={link.active ? 'false' : 'true'} />
                  <button
                    type="submit"
                    className="border-outline text-on-surface hover:bg-surface-container text-label-large rounded-xl border px-5 py-2.5 font-semibold transition-colors"
                  >
                    {link.active ? 'Withdraw link' : 'Reactivate link'}
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
