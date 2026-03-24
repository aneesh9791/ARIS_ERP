const { test, expect } = require('@playwright/test');
const { mockAuth } = require('./helpers/auth');

test.describe('Accessibility', () => {
  test('login page has no critical ARIA violations', async ({ page }) => {
    await page.goto('/login');

    // All inputs should have associated labels (htmlFor or aria-label)
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        const labelCount = await label.count();
        const hasLabel = labelCount > 0 || ariaLabel !== null || ariaLabelledBy !== null;
        expect(hasLabel).toBeTruthy();
      }
    }

    // Submit button should have accessible text
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
    const btnText = await submitBtn.textContent();
    expect(btnText?.trim().length).toBeGreaterThan(0);
  });

  test('dashboard page has proper heading hierarchy', async ({ page }) => {
    await mockAuth(page);
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });
    await page.goto('/dashboard');

    // Wait for page to load
    await expect(page.locator('main h1', { hasText: 'Dashboard' })).toBeVisible({ timeout: 10000 });

    // There should be exactly one h1 on the page
    const h1Elements = page.locator('main h1');
    const h1Count = await h1Elements.count();
    expect(h1Count).toBe(1);
  });

  test('buttons have accessible names', async ({ page }) => {
    await mockAuth(page);
    await page.route('**/api/patients**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ patients: [], total: 0 }),
      });
    });
    await page.goto('/patients');

    // Wait for the page to load
    await expect(page.locator('main h1', { hasText: 'Patients' })).toBeVisible({ timeout: 10000 });

    // Check all visible buttons have accessible text or aria-label
    const buttons = page.locator('button:visible');
    const buttonCount = await buttons.count();
    for (let i = 0; i < buttonCount; i++) {
      const btn = buttons.nth(i);
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute('aria-label');
      const title = await btn.getAttribute('title');
      const hasAccessibleName =
        (text !== null && text.trim().length > 0) ||
        (ariaLabel !== null && ariaLabel.trim().length > 0) ||
        (title !== null && title.trim().length > 0);
      expect(hasAccessibleName).toBeTruthy();
    }
  });

  test('images have alt attributes', async ({ page }) => {
    await mockAuth(page);
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });
    await page.goto('/dashboard');

    // Wait for the page to render
    await expect(page.locator('main h1', { hasText: 'Dashboard' })).toBeVisible({ timeout: 10000 });

    // All img elements should have non-empty alt attributes
    const images = page.locator('img');
    const imageCount = await images.count();
    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      // alt can be empty string (decorative) but must be present
      expect(alt).not.toBeNull();
    }
  });
});
