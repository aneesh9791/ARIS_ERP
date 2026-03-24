const { test, expect } = require('@playwright/test');
const { mockAuth } = require('./helpers/auth');

const mockDashboardAPIs = async (page) => {
  await page.route('**/api/dashboard/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        todayPatients: 12,
        revenueToday: 45000,
        pendingReports: 7,
        activeCenters: 3,
      }),
    });
  });
  await page.route('**/api/patients**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ patients: [], total: 0 }),
    });
  });
};

test.describe('Dashboard page', () => {
  test('dashboard page loads successfully', async ({ page }) => {
    await mockAuth(page);
    await mockDashboardAPIs(page);
    await page.goto('/dashboard');
    await expect(page.locator('main h1', { hasText: 'Dashboard' })).toBeVisible({ timeout: 10000 });
  });

  test('renders all 4 stat tiles', async ({ page }) => {
    await mockAuth(page);
    await mockDashboardAPIs(page);
    await page.goto('/dashboard');

    await expect(page.locator("text=Today's Patients")).toBeVisible();
    await expect(page.locator('text=Revenue Today')).toBeVisible();
    await expect(page.locator('text=Pending Reports')).toBeVisible();
    await expect(page.locator('text=Active Centers')).toBeVisible();
  });

  test('Quick Actions section is visible', async ({ page }) => {
    await mockAuth(page);
    await mockDashboardAPIs(page);
    await page.goto('/dashboard');

    await expect(page.locator('text=Quick Actions')).toBeVisible();
  });

  test('New Patient quick action links to /patients', async ({ page }) => {
    await mockAuth(page);
    await mockDashboardAPIs(page);
    await page.goto('/dashboard');

    const newPatientLink = page.locator('a', { hasText: 'New Patient' });
    await expect(newPatientLink).toBeVisible();
    await expect(newPatientLink).toHaveAttribute('href', '/patients');
  });

  test('Create Invoice quick action links to /invoices', async ({ page }) => {
    await mockAuth(page);
    await mockDashboardAPIs(page);
    await page.goto('/dashboard');

    const createInvoiceLink = page.locator('a', { hasText: 'Create Invoice' });
    await expect(createInvoiceLink).toBeVisible();
    await expect(createInvoiceLink).toHaveAttribute('href', '/invoices');
  });

  test('page is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAuth(page);
    await mockDashboardAPIs(page);
    await page.goto('/dashboard');

    // Stat tiles should still be rendered even in stacked mobile layout
    await expect(page.locator("text=Today's Patients")).toBeVisible();
    await expect(page.locator('text=Revenue Today')).toBeVisible();
  });
});
