import { Eyebrow } from '@/components/ui/eyebrow';
import { LinkButton } from '@/components/ui/button';

/**
 * Global 404 (`/_not-found`), rendered by Next for any URL that matches no
 * route — including every page that is planned but not yet built (About,
 * Products, Events, Pricing, FAQ, Contact, register…).
 *
 * It is deliberately a *standalone* page rather than inside the `(public)`
 * layout. The marketing header's nav links are in-page anchors (`#programmes`,
 * `#why`, `#join`), which only resolve on `/`; on a 404 route like `/about` they
 * would resolve to `/about#programmes` and dangle. A single "Back to home"
 * action to the one route that always exists is the only link this page needs,
 * which is what keeps it free of dead links.
 */
export default function NotFound() {
  return (
    <main id="main" className="relative">
      {/*
        The same tricolour rule as the hero, so a 404 still reads as EHEMS
        rather than a blank frame. `inset-x-0 top-0 h-1` is exactly the page's
        own top edge, so it cannot widen the document.
      */}
      <div
        aria-hidden="true"
        data-decorative
        className="accent-rule absolute inset-x-0 top-0 h-1"
      />

      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-24 text-center">
        <Eyebrow>Error 404</Eyebrow>

        <h1 className="display-medium text-on-surface mt-4 text-balance">Page not found</h1>

        <p className="body-large text-on-surface-variant mt-5 max-w-xl text-pretty">
          This page does not exist, or it has not been built yet. Head back to the home page to see
          what is available.
        </p>

        <div className="mt-8">
          <LinkButton href="/" variant="primary" size="lg">
            Back to home
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
