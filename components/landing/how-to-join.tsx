import { cn } from '@/lib/cn';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Section } from '@/components/ui/section';
import { SectionHeading } from '@/components/ui/section-heading';

/** The three steps from PRD §8.1. */
const STEPS = [
  {
    title: 'Create your free account',
    body: 'Tell us who you are, what you do, and how to reach you. This gives you entry into the platform, orientation, and the information you need before you commit to anything.',
  },
  {
    title: 'Explore the programme guide',
    body: 'Read the brochure, review the FAQ, and understand what each tier includes, so you can choose the right next step for your stage and your goals.',
  },
  {
    title: 'Choose your tier and activate your access',
    body: 'When the time is right, select the tier that fits your ambition, make your one-time payment, and upload your proof. Once an admin verifies it, your membership is activated.',
  },
];

/**
 * The join journey as a connected timeline.
 *
 * The connector is a flex sibling rather than an absolutely positioned rule.
 * An absolutely positioned hairline would need an x-offset to sit centred under
 * the 44px badge, and that offset is an arbitrary Tailwind value, which
 * `eslint.config.mjs` rejects outright. As a `flex-1` sibling it tracks the
 * badge width automatically, and it cannot be left behind at 320px because the
 * row it lives in reflows with the page.
 *
 * `scroll-mt-24` is not decoration. The header is `sticky top-0` and 64px tall,
 * so the old `scroll-mt-6` would park the heading underneath it - the anchor
 * would work and still look broken.
 *
 * The `<ol>` and its three direct `<li>` children are pinned by
 * `test/landing-page.test.tsx:55-57`, so the badge markup has to live inside each
 * `<li>` rather than in a wrapper element.
 */
export function HowToJoin() {
  return (
    <Section id="join" labelledBy="join-heading" className="scroll-mt-24">
      <SectionHeading
        titleId="join-heading"
        eyebrow={<Eyebrow>How to join</Eyebrow>}
        title="Start free, and move up when it makes sense"
        lede="Nobody is expected to commit on day one. The free tier exists so you can see how the programme works before you pay for anything."
      />

      <ol className="mt-12 flex flex-col">
        {STEPS.map((step, index) => {
          const isLast = index === STEPS.length - 1;

          return (
            <li key={step.title} className="flex gap-5 sm:gap-6">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className="bg-primary text-on-primary title-medium shadow-glow-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                >
                  {index + 1}
                </span>
                {!isLast && (
                  <span aria-hidden="true" className="bg-outline-variant mt-3 w-px flex-1" />
                )}
              </div>

              <div className={cn('min-w-0', !isLast && 'pb-12')}>
                <div className="border-outline-variant bg-surface-container-lowest rounded-2xl border p-6 sm:p-7">
                  <h3 className="title-large text-on-surface text-balance">{step.title}</h3>
                  <p className="body-large text-on-surface-variant mt-2.5 text-pretty">
                    {step.body}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="body-large text-on-surface-variant border-outline-variant mt-2 max-w-prose border-t pt-8">
        Not sure which tier fits yet? The programme guide explains what each one includes, how
        payment and verification work, and what to expect at every stage.
      </p>
    </Section>
  );
}
