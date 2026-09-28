import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Section } from '@/components/ui/section';
import { SectionHeading } from '@/components/ui/section-heading';
import { LinkButton } from '@/components/ui/button';
import { listActiveTiers, type TierId } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Pricing & Membership Tiers | EHEMS Platform',
  description:
    "Explore EHEMS six active membership tiers. One-time payments only, no recurring subscriptions. Start free with O'Free Levels.",
};

/**
 * Presentation only, keyed by `TierId`. The tier names, order, mentorship
 * duration, and community access level all come from `lib/pricing/tiers.ts`,
 * which is the single code-level catalogue. This page previously held its own
 * copy of the six names, which had already drifted from the copy in
 * `tier-overview.tsx`; a rename in one would have silently disagreed with the
 * other, and BR-016 makes those names a contract.
 *
 * `communityAccessLabel` renders the BR-011 entitlement. The entitlement itself
 * is `tier.communityAccess`; the wording is a display concern and belongs here.
 */
const PRESENTATION: Record<
  TierId,
  { description: string; communityAccessLabel: string; highlight: boolean; badge?: string }
> = {
  'o-free': {
    description: 'Entry-level access to platform orientation, brochure, and community forums.',
    communityAccessLabel: 'General Community Access',
    highlight: false,
    badge: 'Free Tier',
  },
  basic: {
    description: 'Your first structured step into practical healthcare business building.',
    communityAccessLabel: 'General Community Access',
    highlight: false,
  },
  'basic-iii': {
    description: 'Deeper foundational modules and structured assignments on the entry path.',
    communityAccessLabel: 'General Community Access',
    highlight: false,
  },
  'advanced-iv': {
    description: 'Unlocks EHEMS OPEN benefits for promoting and scaling your healthcare business.',
    communityAccessLabel: 'EHEMS OPEN Sales & Marketing',
    highlight: true,
    badge: 'Most Popular',
  },
  'advanced-v': {
    description: 'Extended hands-on mentorship designed for growing healthcare enterprises.',
    communityAccessLabel: 'EHEMS OPEN Sales & Marketing',
    highlight: false,
  },
  'higher-advanced-viii': {
    description:
      'The highest tier of direct executive mentorship and strategic guidance EHEMS offers.',
    communityAccessLabel: 'EHEMS OPEN Sales & Marketing',
    highlight: false,
    badge: 'Executive Tier',
  },
};

export default function PricingPage() {
  return (
    <main id="main" className="py-12 sm:py-16">
      <Section labelledBy="pricing-title">
        <SectionHeading
          titleId="pricing-title"
          eyebrow={<Eyebrow>Transparent Membership</Eyebrow>}
          title="One-time payments. Clear growth."
          lede="Membership is a one-time payment — never a recurring subscription (BR-001). Start free with O'Free Levels and upgrade when you are ready."
        />

        {/* Tier Cards Grid */}
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {listActiveTiers().map((tier) => {
            const presentation = PRESENTATION[tier.id];
            return (
              <div
                key={tier.id}
                className={`relative flex flex-col justify-between rounded-3xl border p-7 transition-all ${
                  presentation.highlight
                    ? 'border-primary bg-surface-container-lowest shadow-lg ring-2 ring-primary/20'
                    : 'border-outline-variant bg-surface-container-lowest shadow-sm hover:border-outline'
                }`}
              >
                <div>
                  {presentation.badge && (
                    <span
                      className={`label-small inline-block rounded-full px-3 py-1 font-semibold ${
                        presentation.highlight
                          ? 'bg-primary text-on-primary'
                          : 'bg-secondary-container text-on-secondary-container'
                      }`}
                    >
                      {presentation.badge}
                    </span>
                  )}
                  <h2 className="headline-small mt-4 font-bold text-on-surface">{tier.name}</h2>
                  <p className="body-medium text-on-surface-variant mt-2">
                    {presentation.description}
                  </p>

                  <div className="border-outline-variant mt-6 space-y-3 border-t pt-5">
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-bold">✓</span>
                      <span className="body-medium font-medium text-on-surface">
                        Mentorship: {tier.mentorship}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-bold">✓</span>
                      <span className="body-medium text-on-surface-variant">
                        Access: {presentation.communityAccessLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4">
                  <LinkButton
                    href="/register"
                    variant={presentation.highlight ? 'primary' : 'secondary'}
                    size="md"
                    block
                  >
                    Choose {tier.name}
                  </LinkButton>
                </div>
              </div>
            );
          })}
        </div>

        {/* Upgrade & Business Rules Callout */}
        <div className="border-outline-variant bg-surface-container-low mt-16 rounded-3xl border p-8 sm:p-10">
          <Eyebrow>Upgrade Principles</Eyebrow>
          <h3 className="title-large mt-2 font-bold text-on-surface">
            Upgrading your tier is simple & fair
          </h3>
          <ul className="body-medium text-on-surface-variant mt-4 space-y-2.5">
            <li>
              • <strong>One-time payments:</strong> You pay once for your chosen tier. There are no
              surprise monthly or yearly recurring charges.
            </li>
            <li>
              • <strong>Upgrade calculation:</strong> Upgrade difference is computed from the
              official list price of your current completed tier.
            </li>
            <li>
              • <strong>Completion requirement:</strong> Upgrades are permitted once your previous
              tier is fully paid and marked completed by an admin.
            </li>
          </ul>

          <div className="mt-6">
            <Link href="/faq" className="label-large text-primary hover:underline">
              Read full upgrade FAQ →
            </Link>
          </div>
        </div>
      </Section>
    </main>
  );
}
