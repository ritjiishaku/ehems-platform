import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * Registration through the browser, covering the two auth changes that only show
 * up once the real form is rendered and hydrated: the password confirmation, and
 * the reveal toggle being the first client component in the codebase.
 *
 * The register form is a server component posting to a server action, so the
 * mismatch path cannot be exercised by a client-side submit -- it needs the
 * round trip through `registerAction` and its redirect back with `?error=`.
 */
// Serial, and the success case last: it consumes the one email in this suite, so
// anything ordered after it would collide.
test.describe.configure({ mode: 'serial' });

const prisma = new PrismaClient();
const suffix = randomBytes(4).toString('hex');
const email = `e2e-register-${suffix}@example.test`;
// Fixed rather than derived from `suffix`: the Nigerian format is validated, and
// a random tail is not a valid number. Only the email needs to be unique.
const phone = '+2348031234567';

test.afterAll(async () => {
  // Runs first in the suite, so the mismatch tests have not created anything
  // yet; the success test does. Anonymised rather than deleted, because soft
  // delete is the erasure path the audit log has to be able to reference.
  await prisma.user.updateMany({
    where: { email },
    data: {
      email: `erased-${randomBytes(4).toString('hex')}@anonymised.invalid`,
      name: 'Erased E2E registration',
      deletedAt: new Date(),
    },
  });
  await prisma.$disconnect();
});

async function fillRegistration(
  page: Page,
  overrides: { password?: string; confirmPassword?: string; fullName?: string } = {},
) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(overrides.fullName ?? 'E2E Registering Member');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Nigerian phone number').fill(phone);
  await page.getByLabel('Profession', { exact: true }).fill('Pharmacist');
  await page
    .getByLabel('Password', { exact: true })
    .fill(overrides.password ?? 'Register-pass-2026!');
  await page
    .getByLabel('Confirm password', { exact: true })
    .fill(overrides.confirmPassword ?? 'Register-pass-2026!');
  await page.getByLabel(/I agree to the EHEMS Terms/).check();
}

test('registration is refused when the password confirmation does not match', async ({ page }) => {
  await fillRegistration(page, { confirmPassword: 'Register-pass-2026?' });

  await page.getByRole('button', { name: 'Create account' }).click();

  // The boundary message, relayed through the redirect. If this regresses to
  // something generic, the member is left guessing which field was wrong.
  //
  // Scoped to `p[role="alert"]`: the alert is a sibling of the form, not inside
  // it, and Next.js's route announcer is a `div[role="alert"]` that stays empty
  // once the page settles. A bare getByRole('alert') matches both and fails
  // strict mode.
  await expect(page.locator('p[role="alert"]')).toHaveText('Passwords do not match');

  // The whole point: no account, and no consent record either.
  expect(await prisma.user.count({ where: { email } })).toBe(0);
  expect(await prisma.consentRecord.count({ where: { user: { email } } })).toBe(0);
});

test('a mismatched registration reaches the public page without internal detail', async ({
  page,
}) => {
  await fillRegistration(page, { confirmPassword: 'Register-pass-2026?' });
  await page.getByRole('button', { name: 'Create account' }).click();

  // Guards the D-26 regression class: whatever the failure, no Prisma invocation,
  // table name, or other internal string is rendered to an anonymous visitor.
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).not.toContain('prisma');
  expect(body).not.toContain('public.user');
  expect(body).not.toContain('does not exist');
});

test('the reveal toggle reveals the password without submitting the form', async ({ page }) => {
  await fillRegistration(page);

  const password = page.getByLabel('Password', { exact: true });
  await expect(password).toHaveAttribute('type', 'password');

  // Still on /register after pressing it: a default-type button inside a form
  // posting to a server action would have navigated away.
  await page.getByRole('button', { name: 'Show password' }).click();

  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('Register-pass-2026!');
  await expect(page).toHaveURL(/\/register$/);

  // Pressing again restores masking, and the control announces the new state.
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('the registration form fits a 375px viewport without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await fillRegistration(page);

  // No element may exceed the viewport width: a fixed-width child is the usual
  // cause, and it is invisible in a unit test because jsdom has no layout.
  const overflowing = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((element) => element.getBoundingClientRect().right > width + 1)
      .map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`);
  });
  expect(overflowing).toEqual([]);

  // And the submit control is reachable, which is the property the density
  // change was made to restore.
  await page.getByRole('button', { name: 'Create account' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeInViewport();
});

test('matching confirmations create the account and its consent record', async ({ page }) => {
  await fillRegistration(page);

  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  const created = await prisma.user.findUnique({
    where: { email },
    include: { consentRecords: true },
  });
  expect(created).not.toBeNull();
  // SEC-011: the consent row must land with the user, or registration is a breach.
  expect(created?.consentRecords).toHaveLength(1);
  expect(created?.consentRecords[0]?.consentType).toBe('data_processing');
});
