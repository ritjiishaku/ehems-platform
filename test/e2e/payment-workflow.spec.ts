import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../lib/auth/password';

/**
 * Browser coverage for the manual payment trust boundary.
 *
 * The fixture is per Playwright project, not global: mobile and desktop run in
 * parallel against the same database, so sharing one pending payment would make
 * the partial unique index correctly turn the second test into an idempotent
 * retry instead of an independent journey.
 */
test.describe.configure({ mode: 'serial' });

const prisma = new PrismaClient();
const suffix = randomBytes(4).toString('hex');
const memberEmail = `e2e-member-${suffix}@example.test`;
const adminEmail = `e2e-admin-${suffix}@example.test`;
const memberPassword = 'E2e-member-password-2026!';
const adminPassword = 'E2e-admin-password-2026!';

let paymentId = '';

test.beforeAll(async () => {
  const [memberHash, adminHash] = await Promise.all([
    hashPassword(memberPassword),
    hashPassword(adminPassword),
  ]);

  await prisma.user.create({
    data: {
      email: memberEmail,
      name: 'E2E Paying Member',
      passwordHash: memberHash,
      roleId: 'role-member',
    },
  });
  await prisma.user.create({
    data: {
      email: adminEmail,
      name: 'E2E Payments Admin',
      passwordHash: adminHash,
      roleId: 'role-super-admin',
    },
  });

  // The destination is deliberately non-functional. `live` is used here only
  // because the production server correctly disables `test` mode; the values are
  // still unmistakably test data and the test database is disposable.
  const settings = [
    ['payment.instructions.mode', 'live'],
    ['payment.bank.name', 'EHEMS TEST BANK - DO NOT USE'],
    ['payment.bank.account_name', 'EHEMS TEST ACCOUNT - DO NOT SEND MONEY'],
    ['payment.bank.account_number', '0000000000'],
    ['payment.bank.reference_format', 'TEST-{memberId}'],
    ['payment.mobile_money.enabled', 'false'],
    ['payment.support.name', 'EHEMS E2E Support'],
    ['payment.support.email', 'payments-e2e@example.com'],
  ] as const;

  for (const [key, value] of settings) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, updatedBy: 'e2e:payment-workflow' },
      update: { value, updatedBy: 'e2e:payment-workflow' },
    });
  }
});

test.afterAll(async () => {
  const member = await prisma.user.findUnique({
    where: { email: memberEmail },
    select: { id: true, enrolments: { select: { id: true } } },
  });
  if (member) {
    const enrolmentIds = member.enrolments.map((enrolment) => enrolment.id);
    if (enrolmentIds.length > 0) {
      await prisma.payment.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
      await prisma.enrolment.deleteMany({ where: { id: { in: enrolmentIds } } });
    }
  }

  for (const email of [memberEmail, adminEmail]) {
    await prisma.user.updateMany({
      where: { email },
      data: {
        email: `erased-${randomBytes(4).toString('hex')}@anonymised.invalid`,
        name: 'Erased E2E user',
        deletedAt: new Date(),
      },
    });
  }
  await prisma.$disconnect();
});

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('member sees configured payment instructions and creates a payment', async ({ page }) => {
  await login(page, memberEmail, memberPassword);
  await page.goto('/dashboard/payments');

  await expect(page.getByRole('heading', { name: 'Payment instructions' })).toBeVisible();
  await expect(page.getByText('EHEMS TEST BANK - DO NOT USE')).toBeVisible();
  await expect(page.getByText('EHEMS TEST ACCOUNT - DO NOT SEND MONEY')).toBeVisible();

  await page.getByRole('button', { name: 'Get payment instructions' }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/payments\?focus=.*&sent=1/);
  await expect(page.getByText('Your payments')).toBeVisible();

  const paymentCard = page.locator('li').filter({ hasText: 'Basic Level' }).first();
  await expect(paymentCard.getByText('Submit proof of payment')).toBeVisible();
  paymentId = new URL(page.url()).searchParams.get('focus') ?? '';
  expect(paymentId).not.toBe('');
});

test('member submits an encrypted proof of payment', async ({ page }) => {
  await login(page, memberEmail, memberPassword);
  await page.goto(`/dashboard/payments?focus=${paymentId}`);

  const paymentCard = page.locator('li').filter({ hasText: 'Basic Level' }).first();
  await paymentCard.getByLabel('How did you pay?').selectOption('bank_transfer');
  await paymentCard.getByLabel('Bank or provider').fill('EHEMS TEST BANK');
  await paymentCard.getByLabel('Reference').fill('TEST-TRANSFER-001');
  await paymentCard.getByLabel('Transfer date').fill('2026-09-29');
  await paymentCard.locator('input[type="file"]').setInputFiles({
    name: 'receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nEHEMS E2E receipt'),
  });
  await paymentCard.getByRole('button', { name: 'Submit proof of payment' }).click();

  await expect(page).toHaveURL(/\/dashboard\/payments\?sent=1/);
  await expect(page.getByText('Your proof is with our team')).toBeVisible();
  await expect(paymentCard.getByText('Waiting in the admin verification queue')).toBeVisible();
});

test('admin opens, re-authenticates, views, and verifies the payment', async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await page.goto('/admin/payments');

  const paymentCard = page
    .locator('section[aria-labelledby="waiting"] li')
    .filter({ hasText: memberEmail })
    .first();
  await expect(paymentCard).toBeVisible();
  const openButton = paymentCard.getByRole('button', { name: 'Open for review' });
  await expect(openButton).toBeEnabled();
  await openButton.click();

  const inReviewCard = page
    .locator('section[aria-labelledby="in-review"] li')
    .filter({ hasText: memberEmail })
    .first();
  await expect(page.getByRole('heading', { name: /In review/ })).toBeVisible();
  await inReviewCard.getByText('View proof of payment').click();
  await inReviewCard.locator('details input[name="password"]').fill(adminPassword);

  const downloadPromise = page.waitForEvent('download');
  await inReviewCard.getByRole('button', { name: 'Open proof' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('payment-proof.pdf');

  // A download navigation is not a stable page-navigation boundary in all
  // Chromium versions. Re-enter the queue so the next locator cannot resolve
  // against the waiting card or a stale DOM snapshot.
  await page.goto('/admin/payments?opened=1');
  const verifiedCard = page
    .locator('section[aria-labelledby="in-review"] li')
    .filter({ hasText: memberEmail })
    .first();
  await verifiedCard.locator('form').last().getByLabel('Your password').fill(adminPassword);
  const recordButton = verifiedCard.getByRole('button', { name: 'Record outcome' });
  await recordButton.click();
  await expect(page).toHaveURL(/\/admin\/payments\?verified=1/);
  await expect(page.getByText('Verified. The member')).toBeVisible();
});

test('Super Admin can update payment settings with re-authentication', async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await page.goto('/admin/payment-settings');

  await expect(page.getByRole('heading', { name: 'Payment settings' })).toBeVisible();
  await page.getByLabel('Support name').fill('EHEMS E2E Support Updated');
  await page.getByLabel('Your password').fill(adminPassword);
  const saveButton = page.getByRole('button', { name: 'Save payment settings' });
  await saveButton.click();

  await expect(page).toHaveURL(/\/admin\/payment-settings\?status=updated/);
  await expect(page.getByText('Payment settings updated')).toBeVisible();
});
