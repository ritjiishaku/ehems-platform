import { Card, type CardSurface } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Icon, type IconName } from '@/components/ui/icon';
import { Section } from '@/components/ui/section';
import { SectionHeading } from '@/components/ui/section-heading';

/**
 * The four benefits, as a bento rather than four identical cards.
 *
 * `span` drives the asymmetry: two cards run full width on desktop and two are
 * single, so the eye lands on a pair instead of scanning a uniform matrix. The
 * previous version rendered the same `Card` four times, which is the clearest
 * single reason the page read as a template.
 *
 * `surface` puts the EHEMS OPEN tile (BR-011) on the solid brand fill. It is the
 * upsell, so it earns the emphasis rather than the default card.
 *
 * `eyebrow` is real copy in the data. It replaces `title.split(' ')[0]`, which
 * rendered the chip "A" on the third card.
 */
const BENEFITS: {
  icon: IconName;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  span: string;
  surface: CardSurface;
  iconTone: string;
  eyebrowTone: string;
  bodyTone: string;
  pointTone: string;
  dividerTone: string;
}[] = [
  {
    icon: 'spark',
    eyebrow: 'Mentorship',
    title: 'Mentorship that turns knowledge into action',
    body: 'You learn as a mentee first, then grow through a structured programme that moves you from idea to execution with real guidance and accountability.',
    points: ['Tier-based learning journeys', 'Support from mentors who have gone before'],
    span: 'md:col-span-2',
    surface: 'lowest',
    iconTone: 'bg-primary-container text-on-primary-container',
    eyebrowTone: 'text-secondary',
    bodyTone: 'text-on-surface-variant',
    pointTone: 'text-on-surface-variant',
    dividerTone: 'border-outline-variant',
  },
  {
    icon: 'badge',
    eyebrow: 'Certification',
    title: 'Certification that carries weight',
    body: 'Certificates are issued only after an admin confirms attendance, assignments, and performance. That keeps your learning credible and your progress visible.',
    points: ['Admin-confirmed outcomes', 'Verification ID for authenticity'],
    span: 'md:col-span-1',
    surface: 'low',
    iconTone: 'bg-tertiary-container text-on-tertiary-container',
    eyebrowTone: 'text-tertiary',
    bodyTone: 'text-on-surface-variant',
    pointTone: 'text-on-surface-variant',
    dividerTone: 'border-outline-variant',
  },
  {
    icon: 'users',
    eyebrow: 'Community',
    title: 'A community that keeps you in motion',
    body: 'General community access is available to every tier, so you are not isolated. You learn alongside the right people at the right stage of your growth.',
    points: ['Open access from the start', 'Built for peer learning and accountability'],
    span: 'md:col-span-1',
    surface: 'low',
    iconTone: 'bg-primary-container text-on-primary-container',
    eyebrowTone: 'text-secondary',
    bodyTone: 'text-on-surface-variant',
    pointTone: 'text-on-surface-variant',
    dividerTone: 'border-outline-variant',
  },
  {
    icon: 'growth',
    eyebrow: 'EHEMS OPEN',
    title: 'Commercial support when you are ready',
    body: 'EHEMS OPEN unlocks sales and marketing opportunities from Advanced Level IV onward, giving members the right tools to grow beyond the classroom.',
    points: ['Starts at Advanced Level IV', 'Built for market-facing growth'],
    span: 'md:col-span-2',
    surface: 'primary',
    iconTone: 'bg-on-primary text-primary',
    eyebrowTone: 'text-on-primary',
    // No `on-primary-variant` role exists, so this tile stays at full strength
    // rather than reaching for an opacity to fake a muted tone - an opacity
    // would sidestep the 102-pair audit in scripts/build-tokens.js and leave the
    // contrast resting on arithmetic instead of a verified pair.
    bodyTone: 'text-on-primary',
    pointTone: 'text-on-primary',
    dividerTone: 'border-on-primary/50',
  },
];

/** `id="programmes"` is the hero's secondary CTA target and `#benefits-heading` is
 *  asserted by name in both the unit and e2e suites. Neither is ours to change. */
export function ProgrammeOverview() {
  return (
    <Section id="programmes" labelledBy="benefits-heading" tone="lowest" className="scroll-mt-24">
      <SectionHeading
        titleId="benefits-heading"
        eyebrow={<Eyebrow>What you get</Eyebrow>}
        title="Built for healthcare entrepreneurs who want momentum"
        lede="EHEMS gives you the structure to learn, connect, and grow. Every tier is designed to move you from capability to confidence, and from ideas to action."
      />

      <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {BENEFITS.map((benefit) => (
          <li key={benefit.eyebrow} className={benefit.span}>
            <Card
              surface={benefit.surface}
              className="h-full p-6 hover:shadow-xl hover:-translate-y-0.5 sm:p-7"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${benefit.iconTone}`}
                aria-hidden="true"
              >
                <Icon name={benefit.icon} className="text-2xl" />
              </span>

              <p className={`label-medium mt-6 tracking-widest uppercase ${benefit.eyebrowTone}`}>
                {benefit.eyebrow}
              </p>

              <h3 className="title-large mt-2 text-balance">{benefit.title}</h3>

              <p className={`body-medium mt-3 text-pretty ${benefit.bodyTone}`}>{benefit.body}</p>

              <ul className={`mt-6 flex flex-col gap-2.5 border-t pt-5 ${benefit.dividerTone}`}>
                {benefit.points.map((point) => (
                  <li
                    key={point}
                    className={`body-small flex items-start gap-2 ${benefit.pointTone}`}
                  >
                    <Icon name="check" className="mt-0.5 text-base" />
                    {point}
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
