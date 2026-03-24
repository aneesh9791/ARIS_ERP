const { test, expect } = require('@playwright/test');
const { mockAuth } = require('./helpers/auth');

const mockReportsAPI = async (page) => {
  await page.route('**/api/reports/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        revenue: { total_revenue: 50000, pending_revenue: 5000, avg_invoice: 1500 },
        customers: { total_customers: 200, active_customers: 180, new_customers: 15 },
      }),
    });
  });
};

test.describe('Reports page', () => {
  test('reports page loads', async ({ page }) => {
    await mockAuth(page);
    await mockReportsAPI(page);
    await page.goto('/reports');
    await expect(page.locator('main h1', { hasText: 'Reports' })).toBeVisible({ timeout: 10000 });
  });

  test('all report type tiles are visible', async ({ page }) => {
    await mockAuth(page);
    await mockReportsAPI(page);
    await page.goto('/reports');

    await expect(page.locator('text=Dashboard Overview')).toBeVisible();
    await expect(page.locator('text=Financial Reports')).toBeVisible();
    await expect(page.locator('text=Customer Analytics')).toBeVisible();
    await expect(page.locator('text=Inventory Reports')).toBeVisible();
    await expect(page.locator('text=Sales Performance')).toBeVisible();
  });

  test('clicking a report tile selects it', async ({ page }) => {
    await mockAuth(page);
    await mockReportsAPI(page);
    await page.goto('/reports');

    const financialTile = page.locator('button', { hasText: 'Financial Reports' });
    await financialTile.click();

    // Selected tile should have border-teal-600 class
    await expect(financialTile).toHaveClass(/border-teal-600/);
  });

  test('date range filter works', async ({ page }) => {
    await mockAuth(page);
    await mockReportsAPI(page);
    await page.goto('/reports');

    const dateRangeSelect = page.locator('select').first();
    await dateRangeSelect.selectOption('7');
    await expect(dateRangeSelect).toHaveValue('7');
  });

  test('Export button is disabled when no data', async ({ page }) => {
    await mockAuth(page);
    // Return an error so reportData stays null
    await page.route('**/api/reports/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Server error' }),
      });
    });
    await page.goto('/reports');

    // Wait for the error state
    await page.waitForTimeout(1000);
    const exportBtn = page.locator('button', { hasText: 'Export' });
    await expect(exportBtn).toBeDisabled();
  });
});
