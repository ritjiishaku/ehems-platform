import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingPage from '@/app/(public)/page';
import { expectNoAxeViolations } from '@/test/helpers/axe';

/**
 * Render tests for the landing page.
 *
 * Behaviour and visible text, not snapshots (.agents/rules/testing.md
 * §What not to test). The axe assertion covers WCAG 2.1 AA on every render, which
 * is the cheapest place to catch a colour or heading-order regression.
 */
describe('landing page', () => {
  it('has exactly one h1', () => {
    render(<LandingPage />);

    // More than one h1 means the document outline is ambiguous for screen
    // reader users; zero means the page has no top-level heading at all.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('states the value proposition in the h1', () => {
    render(<LandingPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /build a healthcare business that lasts/i }),
    ).toBeInTheDocument();
  });

  it('offers a single Get started call to action', () => {
    render(<LandingPage />);

    const cta = screen.getByRole('link', { name: /get started/i });
    expect(cta).toBeInTheDocument();
    // An in-page anchor today; /register once Phase 5 lands. Either way it must
    // be a real link - a div with an onClick is not navigable by keyboard.
    expect(cta.tagName).toBe('A');
    expect(cta).toHaveAttribute('href');
  });

  it('names every section', () => {
    const { container } = render(<LandingPage />);

    // Was `toBeGreaterThanOrEqual(2)`, which is how the closing CTA shipped
    // without an aria-labelledby: it only had to be outnumbered. Now that every
    // section is named, the floor is the whole set.
    const sections = [...container.querySelectorAll('section')];
    expect(sections.length).toBeGreaterThanOrEqual(5);

    const unnamed = sections.filter((section) => !section.hasAttribute('aria-labelledby'));
    expect(
      unnamed.map((s) => s.outerHTML.slice(0, 80)),
      'every section needs an accessible name',
    ).toEqual([]);
  });

  it('resolves every in-page link to a target that exists', () => {
    const { container } = render(<LandingPage />);

    // The sticky header made this a real failure mode: `#join` still "works" as
    // an anchor while rendering underneath a 64px bar, and a typo'd id fails
    // silently in a browser. Playwright asserts the hero CTA specifically; this
    // covers every anchor the header and footer introduce.
    const anchors = [...container.querySelectorAll('a[href^="#"]')].map((a) =>
      a.getAttribute('href')!,
    );

    expect(anchors.length).toBeGreaterThan(0);

    for (const href of anchors) {
      const id = href.slice(1);
      expect(id, `"${href}" should not be an empty fragment`).not.toBe('');
      expect(container.querySelector(`[id="${id}"]`), `${href} has no target`).not.toBeNull();
    }
  });

  it('explains how to join as a single ordered list of three steps', () => {
    const { container } = render(<LandingPage />);

    // The benefits grid is an unordered list, so the ordered list is
    // unambiguous - and the step count is part of the PRD §8.1 journey.
    const ordered = container.querySelectorAll('ol');
    expect(ordered).toHaveLength(1);
    expect(ordered[0].querySelectorAll(':scope > li')).toHaveLength(3);
  });

  it('lists the six active tiers in display order, without the retired ones', () => {
    const { container } = render(<LandingPage />);

    // FR-001 requires a tier overview. The names and order are a contract from
    // `AGENTS.md` §3, and BR-016 forbids displaying the retired tiers II, VI and
    // VII - so the rendered list must be exactly these six, in this order.
    const names = [...container.querySelectorAll('#tiers h3')].map((h) => h.textContent);
    expect(names).toEqual([
      "O'Free Levels",
      'Basic Level',
      'Basic Level III',
      'Advanced Level IV',
      'Advanced Level V',
      'Higher Advanced VIII',
    ]);
  });

  // D-2 and D-5: a discounted price shown to a visitor who will be charged the
  // full list price is a consumer-protection problem, and the per-tier
  // certificate counts cannot ship beside a catalogue that does not reconcile.
  // Both are pinned here so a marketing pass cannot reintroduce them quietly.
  it('shows no naira amounts', () => {
    const { container } = render(<LandingPage />);

    expect(container.textContent).not.toMatch(/[₦N]\s?\d/);
  });

  it('shows no per-tier certificate counts', () => {
    const { container } = render(<LandingPage />);

    expect(container.textContent).not.toMatch(/\d+\s*\+?\s*certificates?/i);
  });

  // .agents/rules/architecture.md §Community links are data: a hardcoded
  // WhatsApp or Telegram URL in the codebase is a bug, not a convenience.
  it('hardcodes no community links', () => {
    const { container } = render(<LandingPage />);

    expect(container.innerHTML).not.toMatch(/chat\.whatsapp\.com|t\.me\//i);
  });

  it('has no axe violations (ARIA, roles, names, heading order, semantics)', async () => {
    const { container } = render(<LandingPage />);

    // Contrast is deliberately not asserted here: jsdom has no canvas, so axe's
    // colour-contrast rule is undecidable. See test/helpers/axe.ts. The
    // authoritative contrast check is the 102-pair audit in
    // scripts/build-tokens.js, plus the Chromium e2e run.
    await expectNoAxeViolations(container);
  });
});

/**
 * Proves the accessibility gate can actually fail. An axe assertion that passes
 * for the wrong reason - matcher never registered, empty container, wrong
 * element - is indistinguishable from a clean page, so the gate is itself tested
 * against markup known to violate a rule.
 */
describe('the accessibility gate', () => {
  it('rejects markup with a WCAG violation', async () => {
    const bad = document.createElement('div');
    // An image with no alt attribute is a rule axe always reports.
    bad.innerHTML = '<img src="/ehems-logo.jpg" />';

    await expect(expectNoAxeViolations(bad)).rejects.toThrow(/image-alt|no violations/i);
  });
});
