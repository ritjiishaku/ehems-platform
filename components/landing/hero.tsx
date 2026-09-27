import Link from 'next/link';
import Image from 'next/image';
import { Eyebrow } from '@/components/ui/eyebrow';
import { LinkButton } from '@/components/ui/button';
import { Band } from '@/components/ui/section';

/**
 * The first viewport. Type-forward: one h1, one lede, two actions, and the
 * brand plate - nothing else competing for attention.
 *
 * ## Why the type steps up to display-large
 *
 * The three `display-*` roles were already in `tokens.json`, already audited,
 * and unused, so the jump costs zero bytes and zero tokens. `display-large` is
 * 57px and only comes in at `lg:`; mobile stays at `display-small` (36px)
 * because the e2e spec requires the h1 to sit inside 667px at 375px
 * (`test/e2e/landing-page.spec.ts:38-41`), and 57px across three lines plus the
 * sticky header leaves no room for the CTA. Desktop has no fold ceiling, so the
 * `lg:` step is free. The `md:` stop keeps the ramp from being a 36px-to-57px
 * cliff.
 *
 * ## What the declutter removed
 *
 * The three icon "points" (Community / Mentorship / Certification) and the two
 * dl cards below the plate are gone. Both repeated what the programme overview
 * and the assurance band already say, and a hero is the place for one idea, not
 * a catalogue. The plate is the only thing sharing the row with the text now.
 */
export function Hero() {
  return (
    <Band
      labelledBy="hero-heading"
      tone="background"
      width="wide"
      className="hero-viewport-height relative flex flex-col justify-center py-8 sm:py-12 lg:py-16"
    >
      {/*
        A tricolour rule along the top edge. This is the hero's one piece of
        decoration, and it is a rule rather than a wash on purpose: nothing may
        sit behind text on this page, because axe cannot verify the contrast of
        text over a gradient or behind an overlapping element, and
        `test/e2e/landing-page.spec.ts` refuses to pass a run where contrast went
        undecided. See the note on `accent-rule` in app/globals.css.

        The rule is `inset-x-0 top-0 h-1`, so it is exactly the section's own
        width sitting on its top edge, and it cannot widen the document. That is
        what holds the 320px reflow assertion in `test/e2e/landing-page.spec.ts`
        without an `overflow-hidden` escape hatch here.
      */}
      <div
        aria-hidden="true"
        data-decorative
        className="accent-rule absolute inset-x-0 top-0 h-1"
      />

      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <Eyebrow>For healthcare entrepreneurs in Nigeria</Eyebrow>

          {/*
            One h1 per page, and the copy is pinned by
            `test/landing-page.test.tsx:26`. Only the size and colour are ours.
          */}
          <h1
            id="hero-heading"
            className="display-small md:display-medium lg:display-large text-on-surface mt-6 max-w-2xl text-balance"
          >
            Build a healthcare business that lasts
          </h1>

          <p className="body-large text-on-surface-variant mt-5 max-w-xl text-balance">
            EHEMS turns the knowledge you already have into a healthcare business that runs. Learn
            alongside peers, get mentored, and finish with credentials you can point to.
          </p>

          <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            {/*
              The primary CTA stays in-page for Phase 1; registration lands later as
              a dedicated route without forcing a dead link on the marketing site
              (D-17). `shadow-md` gives it a plain elevation - a glow here read as a
              halo around a solid button, which is not the depth a CTA wants.
            */}
            <LinkButton href="/register" variant="primary" size="lg" block className="shadow-md">
              Get started
            </LinkButton>
            <LinkButton href="#programmes" variant="ghost" size="lg" block>
              Explore programmes
            </LinkButton>
          </div>
        </div>

        {/*
          The brand plate. The delivered lockup is a 1080x550 composition with a
          transparent background, so it needs a light card to sit on rather than
          the one it was drawn for. The declared width/height match its viewBox -
          the previous 640x260 reserved the wrong 2.46:1 box for a 1.96:1 file,
          which is the placeholder a reader on a slow connection sees before the
          SVG paints.

          It is flat on purpose: a hairline border, no shadow. The user's taste
          moved away from shadows, and a flat plate lets the mark carry the
          visual weight.
        */}
        <div className="relative">
          {/*
            Accent geometry behind the plate. Two tinted shapes peek out from
            opposite corners so the plate reads as layered depth. They fade to
            transparent so the wash is soft rather than a hard blob, and they sit
            in the text-free plate region - a gradient is only safe on this page
            where no sentence is behind it, because axe cannot decide contrast
            under a `background-image` (see app/globals.css). `data-decorative`
            plus the geometry guard in the e2e suite enforce that they never touch
            a line of text.
          */}
          <div
            aria-hidden="true"
            data-decorative
            className="bg-gradient-to-br from-tertiary/70 to-transparent absolute -bottom-6 -left-6 h-3/4 w-3/4 rounded-3xl"
          />
          <div
            aria-hidden="true"
            data-decorative
            className="bg-gradient-to-tl from-primary/70 to-transparent absolute -top-6 -right-6 h-full w-full rounded-3xl"
          />

          <Link
            href="/"
            title="EHEMS Home"
            className="border-outline-variant bg-gradient-to-br from-surface-container-lowest to-primary-container relative block rounded-3xl border p-6 transition-opacity hover:opacity-90 sm:p-10"
          >
            <Image
              src="/ehems-logo-creative.svg"
              alt="EHEMS"
              width={1080}
              height={550}
              priority
              className="h-auto w-full"
            />
          </Link>
        </div>
      </div>
    </Band>
  );
}
