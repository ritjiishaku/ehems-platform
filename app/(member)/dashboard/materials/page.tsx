import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listAccessibleMaterials } from '@/lib/member';

/**
 * Tier-gated programme materials (D-6, FR-032).
 *
 * D-6 settled the model: materials belong to a programme and inherit that
 * programme's tier mapping. The filtering happens in `lib/member/`, in the query —
 * this page receives only what the member may actually open. Hiding links here
 * would be presentation, not access control.
 */
export default async function MemberMaterialsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const materials = await listAccessibleMaterials(user.id);

  const byProgramme = new Map<string, typeof materials>();
  for (const material of materials) {
    const existing = byProgramme.get(material.programmeName) ?? [];
    existing.push(material);
    byProgramme.set(material.programmeName, existing);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="title-small text-on-surface-variant">Member area</p>
          <h1 className="headline-medium mt-2 text-on-surface">Programme materials</h1>
        </div>
        <Link
          href="/dashboard"
          className="text-label-large text-primary underline-offset-4 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>

      {materials.length === 0 ? (
        <p className="body-large text-on-surface-variant mt-8">
          No materials are available to you yet. Materials are released per programme and are gated
          by your tier, so this list fills in as your programme publishes them.
        </p>
      ) : (
        [...byProgramme.entries()].map(([programmeName, entries]) => (
          <section
            key={programmeName}
            className="mt-8"
            aria-labelledby={`programme-${programmeName}`}
          >
            <h2 id={`programme-${programmeName}`} className="headline-small text-on-surface">
              {programmeName}
            </h2>
            <ul className="mt-3 grid gap-3">
              {entries.map((material) => (
                <li
                  key={material.id}
                  className="rounded-2xl border border-outline-variant bg-surface-container p-5"
                >
                  <h3 className="title-large text-on-surface">{material.title}</h3>
                  {material.description ? (
                    <p className="body-medium text-on-surface-variant mt-2">
                      {material.description}
                    </p>
                  ) : null}
                  <p className="body-large mt-4">
                    <a
                      href={material.fileUrl}
                      className="text-primary underline-offset-4 hover:underline"
                      rel="noreferrer"
                    >
                      Open material
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
