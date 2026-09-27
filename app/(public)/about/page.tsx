import type { Metadata } from 'next';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Section } from '@/components/ui/section';
import { SectionHeading } from '@/components/ui/section-heading';
import { LinkButton } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'About EHEMS | Emerging Healthcare Entrepreneurs Meeting Space',
  description:
    'EHEMS is a Nigerian healthcare entrepreneurship platform empowering healthcare professionals with practical learning, mentorship, and verified credentials.',
};

const PILLARS = [
  {
    title: 'Practical Learning',
    description:
      'Turn existing medical expertise into structured, operational healthcare enterprises that create lasting impact.',
  },
  {
    title: 'Peer Mentorship',
    description:
      'Learn alongside fellow Nigerian healthcare professionals and receive guidance from experienced mentors who have built real businesses.',
  },
  {
    title: 'Admin-Verified Completion',
    description:
      'Earn credible certificates backed by explicit admin review, manual attendance tracking, and satisfactory project completion.',
  },
  {
    title: 'One-Time Transparency',
    description:
      'Straightforward one-time tier payments with zero recurring subscription traps or auto-renewing hidden charges.',
  },
];

export default function AboutPage() {
  return (
    <main id="main" className="py-12 sm:py-16">
      <Section labelledBy="about-title">
        <SectionHeading
          titleId="about-title"
          eyebrow={<Eyebrow>About EHEMS</Eyebrow>}
          title="Building healthcare businesses that last in Nigeria"
          lede="Emerging Healthcare Entrepreneurs Meeting Space (EHEMS) bridges the gap between clinical knowledge and practical healthcare entrepreneurship."
        />

        {/* Mission & Vision Section */}
        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="border-outline-variant bg-surface-container-lowest rounded-3xl border p-8 shadow-sm">
            <Eyebrow>Our Mission</Eyebrow>
            <h2 className="headline-small mt-3 font-bold text-on-surface">
              Empowering healthcare workers to innovate
            </h2>
            <p className="body-large text-on-surface-variant mt-4">
              Nigerian healthcare professionals possess deep clinical knowledge, but often lack the
              structured business frameworks, mentorship, and operational support required to scale
              sustainable healthcare practices. EHEMS provides the space, structure, and peer
              community to bridge that gap.
            </p>
          </div>

          <div className="border-outline-variant bg-surface-container-lowest rounded-3xl border p-8 shadow-sm">
            <Eyebrow>Target Audience</Eyebrow>
            <h2 className="headline-small mt-3 font-bold text-on-surface">
              Built for low bandwidth, high impact
            </h2>
            <p className="body-large text-on-surface-variant mt-4">
              We design specifically for healthcare workers across Nigeria — optimized for 3G mobile
              connections and mid-range devices. No bloated JavaScript, no confusing subscriptions,
              just reliable learning tools and transparent progress.
            </p>
          </div>
        </div>

        {/* Core Pillars */}
        <div className="mt-16">
          <SectionHeading
            titleId="pillars-heading"
            eyebrow={<Eyebrow>Core Pillars</Eyebrow>}
            title="What sets EHEMS apart"
            lede="Every aspect of the platform is built around member success and integrity."
          />

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((pillar) => (
              <div
                key={pillar.title}
                className="border-outline-variant bg-surface-container-lowest rounded-2xl border p-6"
              >
                <h3 className="title-large font-bold text-on-surface">{pillar.title}</h3>
                <p className="body-medium text-on-surface-variant mt-3">{pillar.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action */}
        <div className="bg-primary text-on-primary mt-16 rounded-3xl px-8 py-12 text-center sm:px-12 sm:py-16">
          <h2 className="headline-medium font-bold">Ready to start your journey?</h2>
          <p className="body-large mt-3 text-on-primary/90 max-w-xl mx-auto">
            Join the free O&apos;Free Levels tier today to access the brochure, community links, and
            orientation materials.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <LinkButton href="/register" variant="secondary" size="lg">
              Start Free Account
            </LinkButton>
            <LinkButton href="/programmes" variant="inverse" size="lg">
              Explore Programmes
            </LinkButton>
          </div>
        </div>
      </Section>
    </main>
  );
}
