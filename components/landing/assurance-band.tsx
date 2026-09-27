import { Icon, type IconName } from '@/components/ui/icon';
import { EyebrowInverse } from '@/components/ui/eyebrow';
import { Section } from '@/components/ui/section';
import { SectionHeading } from '@/components/ui/section-heading';

/**
 * The one full-bleed dark band on the page.
 *
 * This is the highest-leverage change in the whole redesign and it costs
 * nothing: `--color-inverse-surface`, `--color-inverse-on-surface`, and
 * `--color-inverse-primary` were already in `tokens.json`, already inside the
 * 102-pair contrast audit, and had no consumer. Every other section is a light
 * surface, so a single ink band is what stops the page reading as one long cream
 * document - and it is where the trust copy belongs, because this is the one
 * section making promises rather than describing features.
 *
 * ## Why these four claims
 *
 * Every line is a CONFIRMED business rule, not marketing invention:
 *
 * | Claim                   | Rule    |
 * | ----------------------- | ------- |
 * | One-time payment        | BR-001  |
 * | Admin marks completion  | BR-009  |
 * | Certificates after that | BR-010  |
 * | Community from free up  | BR-011  |
 *
 * What is deliberately absent is the set of claims that are still blocked on the
 * client: no prices (D-2), no per-tier certificate counts (D-5), no member
 * numbers, no testimonials, no partner logos. Those are pinned by
 * `test/landing-page.test.tsx` and by `AGENTS.md` §3, and inventing them for a
 * real business would be worse than leaving the space empty.
 */
const ASSURANCES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'lock',
    title: 'You pay once',
    body: 'Membership is a one-time payment at the tier you choose. There is no recurring charge and no subscription to cancel.',
  },
  {
    icon: 'shield',
    title: 'An admin confirms completion',
    body: 'Nothing is marked complete automatically. A member finishes only after attendance, assignments, and performance have been checked.',
  },
  {
    icon: 'badge',
    title: 'Certificates come after that',
    body: 'A certificate is issued as a deliberate step once completion is recorded, and it carries a verification ID you can point to.',
  },
  {
    icon: 'users',
    title: 'Community starts at free',
    body: 'You are not isolated while you decide. General community access is open to every tier, including the free one.',
  },
];

export function AssuranceBand() {
  return (
    <Section id="why" labelledBy="why-heading" tone="inverse">
      {/*
        A flat `--color-inverse-surface` with nothing behind the text. This band
        used to carry a blurred bloom, which made every heading and paragraph in
        it undecidable for axe - the e2e spec fails on an undecided contrast
        result, and a gradient or an overlapping decorative element both remove
        the only two checks that make a colour safe to put under a sentence. The
        drama in this section comes from the tonal jump to ink and from
        `display-small`, neither of which costs the contrast audit.
      */}

      <SectionHeading
        titleId="why-heading"
        eyebrow={<EyebrowInverse>What you can rely on</EyebrowInverse>}
        title="The parts that are not negotiable"
        headingClass="display-small text-inverse-on-surface"
        ledeClass="text-inverse-on-surface"
        lede="Membership money and member records are the two things a platform like this cannot be careless about. So these four rules are built into how EHEMS works, not left to a policy page."
      />

      <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
        {ASSURANCES.map((item) => (
          <li key={item.title} className="border-inverse-primary/50 border-t pt-6">
            <span
              className="bg-inverse-primary text-inverse-surface flex h-12 w-12 items-center justify-center rounded-2xl"
              aria-hidden="true"
            >
              <Icon name={item.icon} className="text-2xl" />
            </span>
            <h3 className="title-medium text-inverse-on-surface mt-6">{item.title}</h3>
            <p className="body-medium text-inverse-on-surface mt-3 text-pretty">{item.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
