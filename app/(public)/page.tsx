import { AssuranceBand } from '@/components/landing/assurance-band';
import { ClosingCta } from '@/components/landing/closing-cta';
import { Hero } from '@/components/landing/hero';
import { HowToJoin } from '@/components/landing/how-to-join';
import { ProgrammeOverview } from '@/components/landing/programme-overview';
import { TierOverview } from '@/components/landing/tier-overview';

/**
 * The landing page (FR-001) at `/`.
 *
 * ## Section order and why
 *
 * The rhythm is the design. Every section below the hero is a light surface, so
 * the single inverted band is what stops the page reading as one long cream
 * document and gives the eye somewhere to rest:
 *
 *   header  -  hero (light, type-forward)  -  benefits (white)  -  assurance (INK)
 *   -  tiers (light)  -  how to join (light)  -  closer (navy card)  -  footer (grey)
 *
 * The order is also argument-shaped: what the programme *is*, why you can trust
 * it with money and records, which tier fits, how to actually join, then the
 * ask. The assurance band sits second because those four claims are the answer
 * to the objection the benefits section raises, and the tier overview sits right
 * before the join journey because "choose your tier" only makes sense once the
 * tiers are on the table.
 *
 * ## What is deliberately not here
 *
 * No tier pricing (D-2, blocking), no per-tier certificate counts (D-5,
 * blocking), no community URLs (`AGENTS.md` §3 - community links are data, and
 * D-17 is unresolved), no testimonials or member counts, and exactly one "Get
 * started" link, because both suites resolve that name with `getByRole`, which
 * throws on a second match.
 *
 * `#join` and `#programmes` are real targets, and `#why` is the assurance band.
 * `test/e2e/landing-page.spec.ts` fails on a dangling anchor, and the new
 * unit test asserts every in-page link resolves.
 */
export default function LandingPage() {
  return (
    <main id="main">
      <Hero />
      <ProgrammeOverview />
      <AssuranceBand />
      <TierOverview />
      <HowToJoin />
      <ClosingCta />
    </main>
  );
}
