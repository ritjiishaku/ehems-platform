import type { Metadata } from 'next';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Section } from '@/components/ui/section';
import { SectionHeading } from '@/components/ui/section-heading';
import { LinkButton } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions | EHEMS Platform',
  description:
    'Clear answers regarding EHEMS membership tiers, one-time payment rules, tier upgrades, completion criteria, and member guidelines.',
};

const FAQS = [
  {
    question: 'Is membership a recurring subscription?',
    answer:
      'No. All tier memberships are strictly one-time payments (BR-001). There are no recurring monthly or yearly subscription fees. Once you pay for a tier, your access for that tier remains active without hidden renewals.',
  },
  {
    question: 'How do tier upgrades work?',
    answer:
      'Upgrade difference is calculated from the official list price of your current tier (BR-003). Upgrades are permitted only when your previous tier is fully paid AND marked completed by an admin (BR-004). Otherwise, full price applies.',
  },
  {
    question: 'How are payments verified?',
    answer:
      'Payments on Phase 1 are manual. After making a direct bank transfer, you submit your payment details and proof of transfer. An EHEMS admin verifies the transaction, after which your tier enrolment becomes active.',
  },
  {
    question: 'Can members sell services to other members?',
    answer:
      'No. EHEMS operates a strict no-marketplace rule (BR-012). Members cannot promote their own services to other members or send unsolicited marketing messages within community channels.',
  },
  {
    question: 'How are certificates earned and issued?',
    answer:
      'Certificates are issued only after an admin marks your enrolment as Completed (BR-010). Completion requires verified payment, ≥60% attendance, completed assignments, satisfactory performance, and feedback submission (BR-008).',
  },
  {
    question: 'What is the Advanced Tier 50% discount rule?',
    answer:
      'First-time subscribers receive a 50% discount on their very first Advanced-tier purchase (BR-005). This discount is non-combinable with upgrade price differences and does not repeat (BR-007).',
  },
];

export default function FAQPage() {
  return (
    <main id="main" className="py-12 sm:py-16">
      <Section labelledBy="faq-title">
        <SectionHeading
          titleId="faq-title"
          eyebrow={<Eyebrow>Help & Guidance</Eyebrow>}
          title="Frequently Asked Questions"
          lede="Everything you need to know about EHEMS membership rules, payments, tier upgrades, and completion."
        />

        {/* FAQ List */}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {FAQS.map((faq) => (
            <div
              key={faq.question}
              className="border-outline-variant bg-surface-container-lowest flex flex-col justify-between rounded-3xl border p-7"
            >
              <div>
                <h2 className="title-large font-bold text-on-surface">{faq.question}</h2>
                <p className="body-medium text-on-surface-variant mt-3 leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Still Have Questions Box */}
        <div className="border-outline-variant bg-surface-container-low mt-16 rounded-3xl border p-8 text-center sm:p-10">
          <Eyebrow>Have more questions?</Eyebrow>
          <h2 className="headline-small mt-2 font-bold text-on-surface">We are here to help</h2>
          <p className="body-large text-on-surface-variant mt-3 max-w-xl mx-auto">
            Our team is available to assist you with tier selection, payment submissions, or
            technical inquiries.
          </p>

          <div className="mt-8 flex justify-center gap-4">
            <LinkButton href="/contact" variant="primary" size="lg">
              Contact Support
            </LinkButton>
            <LinkButton href="/register" variant="secondary" size="lg">
              Create Account
            </LinkButton>
          </div>
        </div>
      </Section>
    </main>
  );
}
