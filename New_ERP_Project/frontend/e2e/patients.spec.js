const { test, expect } = require('@playwright/test');
const { mockAuth } = require('./helpers/auth');

test.describe('Patients page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
    await page.route('**/api/patients**', async (route) => {
      const url = route.request().url();
      if (url.includes('api/patients')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ patients: [], total: 0 }),
        });
      } else {
        await route.continue();
      }
    });
  });

  test('patients page loads', async ({ page }) => {
    await page.goto('/patients');
    await expect(page.locator('main h1', { hasText: 'Patients' })).toBeVisible({ timeout: 10000 });
  });

  test('shows search input', async ({ page }) => {
    await page.goto('/patients');
    await expect(
      page.locator('input[placeholder*="Search"]')
    ).toBeVisible();
  });

  test('shows Add Patient button', async ({ page }) => {
    await page.goto('/patients');
    await expect(page.locator('button', { hasText: 'Add Patient' })).toBeVisible();
  });

  test('search input is interactive', async ({ page }) => {
    await page.goto('/patients');
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('John');
    await expect(searchInput).toHaveValue('John');
  });

  test('Add Patient button opens modal', async ({ page }) => {
    await page.goto('/patients');
    await page.locator('button', { hasText: 'Add Patient' }).click();
    // Modal has heading "Add New Patient"
    await expect(page.locator('text=Add New Patient')).toBeVisible();
  });

  test('filter panel toggles', async ({ page }) => {
    await page.goto('/patients');
    const filtersBtn = page.locator('button', { hasText: 'Filters' });
    if (await filtersBtn.isVisible()) {
      await filtersBtn.click();
      // Filter panel shows Gender and Status selects
      await expect(page.locator('label', { hasText: 'Gender' })).toBeVisible();
    }
  });

  test('intercepts API call with correct auth header', async ({ page }) => {
    let authHeader = null;
    await page.route('**/api/patients**', async (route) => {
      authHeader = route.request().headers()['authorization'];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ patients: [], total: 0 }),
      });
    });
    await page.goto('/patients');
    await page.waitForTimeout(500);
    expect(authHeader).toBeDefined();
    expect(authHeader).toContain('Bearer');
  });

  test('shows empty state when no patients', async ({ page }) => {
    await page.route('**/api/patients**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ patients: [], total: 0 }),
      });
    });
    await page.goto('/patients');
    await expect(page.locator('text=No patients found')).toBeVisible();
  });
});
