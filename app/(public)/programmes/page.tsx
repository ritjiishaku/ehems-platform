import type { Metadata } from 'next';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Section } from '@/components/ui/section';
import { SectionHeading } from '@/components/ui/section-heading';
import { LinkButton } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Programmes & Curriculum | EHEMS Platform',
  description:
    'Discover EHEMS healthcare entrepreneurship training programmes, structured mentorship tiers, assignment requirements, and completion criteria.',
};

const MODULES = [
  {
    step: '01',
    title: 'Orientation & Business Foundation',
    description:
      'Learn the fundamentals of healthcare business structure in Nigeria, regulatory compliance, and business model formulation.',
    audience: "All Tiers (O'Free Levels+)",
  },
  {
    step: '02',
    title: 'Operational Excellence & Financial Management',
    description:
      'Master financial planning, cash flow management, patient retention, and healthcare service delivery logistics.',
    audience: 'Basic Level III+',
  },
  {
    step: '03',
    title: 'EHEMS OPEN Sales & Growth Acceleration',
    description:
      'Access sales, marketing, and business promotion benefits. Learn strategic growth strategies tailored for Nigerian healthcare ventures.',
    audience: 'Advanced Level IV+',
  },
  {
    step: '04',
    title: 'Executive Leadership & Long-Term Expansion',
    description:
      'Receive 6 months of direct executive mentorship for institutional growth, strategic partnerships, and enterprise leadership.',
    audience: 'Higher Advanced VIII',
  },
];

const COMPLETION_REQUIREMENTS = [
  'Verified manual payment confirmation by an admin',
  'Minimum 60% attendance record across live sessions',
  'All practical assignments, tests, and projects complete',
  'Satisfactory overall performance evaluation',
  'Submission of required session feedback forms',
];

export default function ProgrammesPage() {
  return (
    <main id="main" className="py-12 sm:py-16">
      <Section labelledBy="programmes-title">
        <SectionHeading
          titleId="programmes-title"
          eyebrow={<Eyebrow>Structured Learning</Eyebrow>}
          title="Curriculum designed for real healthcare businesses"
          lede="EHEMS programmes combine practical coursework, structured assignments, live mentorship, and verifiable completion standards."
        />

        {/* Modules Timeline */}
        <div className="mt-12 space-y-6">
          {MODULES.map((module) => (
            <div
              key={module.step}
              className="border-outline-variant bg-surface-container-lowest flex flex-col gap-6 rounded-3xl border p-8 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-6">
                <span className="display-small text-primary font-bold">{module.step}</span>
                <div>
                  <span className="label-small bg-secondary-container text-on-secondary-container inline-block rounded-full px-3 py-1 font-semibold">
                    {module.audience}
                  </span>
                  <h2 className="title-large mt-2 font-bold text-on-surface">{module.title}</h2>
                  <p className="body-medium text-on-surface-variant mt-2 max-w-2xl">
                    {module.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Completion Criteria Section */}
        <div className="border-outline-variant bg-surface-container-low mt-16 rounded-3xl border p-8 sm:p-10">
          <Eyebrow>Completion Standards (BR-008)</Eyebrow>
          <h2 className="headline-small mt-2 font-bold text-on-surface">
            How completion & certificates work
          </h2>
          <p className="body-large text-on-surface-variant mt-3">
            Certificates are issued only after an admin verifies that all completion criteria have
            been satisfied. EHEMS certificates are earned, not automatically generated.
          </p>

          <ul className="mt-6 space-y-3">
            {COMPLETION_REQUIREMENTS.map((req) => (
              <li key={req} className="flex items-center gap-3">
                <span className="text-primary font-bold">✓</span>
                <span className="body-medium text-on-surface">{req}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/register" variant="primary" size="md">
              Register Free Account
            </LinkButton>
            <LinkButton href="/pricing" variant="secondary" size="md">
              View Tier Overview
            </LinkButton>
          </div>
        </div>
      </Section>
    </main>
  );
}
