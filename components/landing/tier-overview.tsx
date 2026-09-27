import Link from 'next/link';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Section } from '@/components/ui/section';
import { SectionHeading } from '@/components/ui/section-heading';

/**
 * The tier overview FR-001 calls for: the six active tiers, in display order,
 * with the two entitlements that are CONFIRMED and non-blocking — mentorship
 * duration and whether the tier is free.
 *
 * ## What is deliberately absent
 *
 * - **Prices.** D-2 is BLOCKING (the 50% Advanced discount is unmodelled, so a
 *   public list price could mislead a returning member), and
 *   `test/landing-page.test.tsx` pins "no naira amounts". The full pricing
 *   comparison is FR-006 / `/pricing`, linked below, which 404s until it is
 *   built — exactly the "link to the appropriate page, or 404 until built" rule.
 * - **Certificate counts.** D-5 is BLOCKING (the per-tier counts do not
 *   reconcile with the catalogue), pinned by the "no per-tier cert counts" test.
 *
 * ## Names are a contract
 *
 * The six names and their order come from `AGENTS.md` §3 and must not be renamed
 * or reordered, and BR-016 forbids displaying the retired tiers II, VI and VII.
 * `test/landing-page.test.tsx` pins this list exactly.
 */
const TIERS: { name: string; mentorship: string; free: boolean; desc: string }[] = [
  {
    name: "O'Free Levels",
    mentorship: 'Community access',
    free: true,
    desc: 'Start here to explore the platform and community at no cost.',
  },
  {
    name: 'Basic Level',
    mentorship: '1 month mentorship',
    free: false,
    desc: 'Your first structured step into the programme.',
  },
  {
    name: 'Basic Level III',
    mentorship: '1 month mentorship',
    free: false,
    desc: 'A deeper foundation on the same entry path.',
  },
  {
    name: 'Advanced Level IV',
    mentorship: '2 months mentorship',
    free: false,
    desc: 'Unlocks EHEMS OPEN sales and marketing access.',
  },
  {
    name: 'Advanced Level V',
    mentorship: '3 months mentorship',
    free: false,
    desc: 'Extended mentorship for a growing business.',
  },
  {
    name: 'Higher Advanced VIII',
    mentorship: '6 months mentorship',
    free: false,
    desc: 'The fullest mentorship EHEMS offers.',
  },
];

export function TierOverview() {
  return (
    <Section id="tiers" labelledBy="tiers-heading" className="scroll-mt-24">
      <SectionHeading
        titleId="tiers-heading"
        eyebrow={<Eyebrow>Membership tiers</Eyebrow>}
        title="Six tiers, one clear path upward"
        lede="Every tier is a one-time payment, never a subscription. Start free and move up when you are ready."
      />

      <ul className="mt-10 flex flex-col">
        {TIERS.map((tier) => (
          <li
            key={tier.name}
            className="border-outline-variant flex flex-col gap-2 border-t py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
          >
            <div className="max-w-xl">
              <div className="flex items-center gap-2.5">
                <h3 className="title-large text-on-surface">{tier.name}</h3>
                {tier.free && (
                  <span className="bg-secondary-container text-on-secondary-container label-small rounded-full px-2.5 py-1">
                    Free
                  </span>
                )}
              </div>
              <p className="body-medium text-on-surface-variant mt-1.5 text-pretty">{tier.desc}</p>
            </div>
            <p className="label-medium text-on-surface-variant shrink-0">{tier.mentorship}</p>
          </li>
        ))}
      </ul>

      <p className="mt-8">
        <Link
          href="/pricing"
          className="label-large text-primary transition-colors duration-(--motion-duration-fast) hover:text-on-surface"
        >
          See full pricing
        </Link>
      </p>
    </Section>
  );
}
