import { EyebrowInverse } from '@/components/ui/eyebrow';
import { Icon } from '@/components/ui/icon';
import { LinkButton } from '@/components/ui/button';
import { Section } from '@/components/ui/section';

const REASSURANCES = ['No subscription', 'No card needed to start', 'Admin-verified'];

/**
 * The closer.
 *
 * This section was the only `<section>` on the page without an
 * `aria-labelledby`, which is why `test/landing-page.test.tsx` only ever asserted
 * "at least two named sections". It has a name now, and the test is tightened to
 * match.
 *
 * It is a contained card on the light page rather than a second full-bleed dark
 * band. The assurance band is the one moment the page goes ink; a second one
 * here would flatten the contrast between them and leave the page with two
 * identical dark slabs instead of one deliberate one.
 *
 * Neither button says "Get started". That name resolves with `getByRole` in both
 * suites, and a second match throws. The hero owns it.
 */
export function ClosingCta() {
  return (
    <Section labelledBy="closing-heading" className="pt-0">
      <div className="bg-primary text-on-primary relative overflow-hidden rounded-3xl px-6 py-14 shadow-2xl sm:px-12 sm:py-16 lg:px-16">
        {/*
          Flat `bg-primary` and nothing behind the text. A bloom here was
          measurably prettier and had to go: axe reports text over a gradient as
          an undecided contrast pair, and the e2e spec treats undecided as failed.
          The panel earns its emphasis from being a solid navy block on an
          off-white page, which needs no decoration to read.
        */}

        <div className="max-w-2xl">
          <EyebrowInverse>Ready when you are</EyebrowInverse>

          <h2 id="closing-heading" className="display-small text-on-primary mt-4 text-balance">
            Start with the free tier, and grow at the pace that fits your ambition.
          </h2>

          <p className="body-large text-on-primary mt-5 text-pretty">
            EHEMS is built for healthcare entrepreneurs who want practical learning, progress they
            can point to, and a community that helps them keep moving. Nothing is locked behind a
            payment you have not chosen yet.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="#join" variant="secondary" size="lg" block>
              Read the programme guide
            </LinkButton>
            <LinkButton href="#programmes" variant="inverse" size="lg" block>
              See what you get
            </LinkButton>
          </div>
        </div>

        <ul className="border-on-primary/50 mt-12 flex flex-col gap-4 border-t pt-8 sm:flex-row sm:gap-8">
          {REASSURANCES.map((item) => (
            <li key={item} className="flex items-center gap-2.5">
              <span className="text-on-primary flex" aria-hidden="true">
                <Icon name="check" className="text-lg" />
              </span>
              <span className="label-medium text-on-primary">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
