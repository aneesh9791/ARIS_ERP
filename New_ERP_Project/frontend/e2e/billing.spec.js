const { test, expect } = require('@playwright/test');
const { mockAuth } = require('./helpers/auth');

const mockBillingAPI = async (page, bills = []) => {
  await page.route('**/api/billing**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        bills,
        total: bills.length,
        stats: { total_billed: 10000, collected: 6000, pending: 3000, overdue: 1000 },
      }),
    });
  });
};

test.describe('Billing page', () => {
  test('billing page loads', async ({ page }) => {
    await mockAuth(page);
    await mockBillingAPI(page);
    await page.goto('/billing');
    await expect(page.locator('main h1', { hasText: 'Billing' })).toBeVisible({ timeout: 10000 });
  });

  test('shows stat tiles', async ({ page }) => {
    await mockAuth(page);
    await mockBillingAPI(page);
    await page.goto('/billing');

    await expect(page.locator('text=Total Billed')).toBeVisible();
    await expect(page.locator('text=Collected')).toBeVisible();
    await expect(page.locator('div:has(p:text("Pending"))').first()).toBeVisible();
    await expect(page.locator('div:has(p:text("Overdue"))').first()).toBeVisible();
  });

  test('New Bill button opens modal', async ({ page }) => {
    await mockAuth(page);
    await mockBillingAPI(page);
    await page.goto('/billing');

    await page.locator('button', { hasText: 'New Bill' }).click();
    // Modal heading
    await expect(page.locator('h2', { hasText: 'New Bill' })).toBeVisible();
  });

  test('filter controls are visible', async ({ page }) => {
    await mockAuth(page);
    await mockBillingAPI(page);
    await page.goto('/billing');

    // Status filter select
    await expect(page.locator('label', { hasText: 'Status' })).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
  });

  test('billing table headers are correct', async ({ page }) => {
    await mockAuth(page);
    await mockBillingAPI(page, [
      {
        id: '1',
        patient_name: 'Test Patient',
        service: 'MRI Scan',
        amount: 2500,
        status: 'pending',
        due_date: '2026-04-01',
      },
    ]);
    await page.goto('/billing');

    await expect(page.locator('th', { hasText: 'Bill #' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Patient' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Amount' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Status' })).toBeVisible();
  });
});
