import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Section } from '@/components/ui/section';
import { SectionHeading } from '@/components/ui/section-heading';
import { LinkButton } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Pricing & Membership Tiers | EHEMS Platform',
  description:
    "Explore EHEMS six active membership tiers. One-time payments only, no recurring subscriptions. Start free with O'Free Levels.",
};

/**
  The 6 active tiers from AGENTS.md §3 / PRD §3.
  Tiers II, VI, and VII are retired/internal and must never render (BR-016).
 */
const ACTIVE_TIERS = [
  {
    name: "O'Free Levels",
    mentorship: 'Community access',
    communityAccess: 'General Community Access',
    description: 'Entry-level access to platform orientation, brochure, and community forums.',
    highlight: false,
    badge: 'Free Tier',
  },
  {
    name: 'Basic Level',
    mentorship: '1 month mentorship',
    communityAccess: 'General Community Access',
    description: 'Your first structured step into practical healthcare business building.',
    highlight: false,
  },
  {
    name: 'Basic Level III',
    mentorship: '1 month mentorship',
    communityAccess: 'General Community Access',
    description: 'Deeper foundational modules and structured assignments on the entry path.',
    highlight: false,
  },
  {
    name: 'Advanced Level IV',
    mentorship: '2 months mentorship',
    communityAccess: 'EHEMS OPEN Sales & Marketing',
    description: 'Unlocks EHEMS OPEN benefits for promoting and scaling your healthcare business.',
    highlight: true,
    badge: 'Most Popular',
  },
  {
    name: 'Advanced Level V',
    mentorship: '3 months mentorship',
    communityAccess: 'EHEMS OPEN Sales & Marketing',
    description: 'Extended hands-on mentorship designed for growing healthcare enterprises.',
    highlight: false,
  },
  {
    name: 'Higher Advanced VIII',
    mentorship: '6 months mentorship',
    communityAccess: 'EHEMS OPEN Sales & Marketing',
    description:
      'The highest tier of direct executive mentorship and strategic guidance EHEMS offers.',
    highlight: false,
    badge: 'Executive Tier',
  },
];

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
          {ACTIVE_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col justify-between rounded-3xl border p-7 transition-all ${
                tier.highlight
                  ? 'border-primary bg-surface-container-lowest shadow-lg ring-2 ring-primary/20'
                  : 'border-outline-variant bg-surface-container-lowest shadow-sm hover:border-outline'
              }`}
            >
              <div>
                {tier.badge && (
                  <span
                    className={`label-small inline-block rounded-full px-3 py-1 font-semibold ${
                      tier.highlight
                        ? 'bg-primary text-on-primary'
                        : 'bg-secondary-container text-on-secondary-container'
                    }`}
                  >
                    {tier.badge}
                  </span>
                )}
                <h2 className="headline-small mt-4 font-bold text-on-surface">{tier.name}</h2>
                <p className="body-medium text-on-surface-variant mt-2">{tier.description}</p>

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
                      Access: {tier.communityAccess}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4">
                <LinkButton
                  href="/register"
                  variant={tier.highlight ? 'primary' : 'secondary'}
                  size="md"
                  block
                >
                  Choose {tier.name}
                </LinkButton>
              </div>
            </div>
          ))}
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
