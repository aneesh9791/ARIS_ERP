const { test, expect } = require('@playwright/test');

test.describe('Login page', () => {
  test('shows login page at /login', async ({ page }) => {
    await page.goto('/login');
    // Page should contain "ARIS" branding or "Sign in" text
    const hasAris = await page.locator('text=ARIS').first().isVisible().catch(() => false);
    const hasSignIn = await page.locator('text=Sign in').first().isVisible().catch(() => false);
    expect(hasAris || hasSignIn).toBeTruthy();
  });

  test('login form has email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid credentials' }),
      });
    });

    await page.goto('/login');
    await page.locator('input[name="email"]').fill('wrong@test.com');
    await page.locator('input[name="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('redirects to dashboard on successful login', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'abc123',
          user: { id: '1', username: 'admin', email: 'admin@aris.com', role: 'ADMIN' },
        }),
      });
    });

    await page.goto('/login');
    await page.locator('input[name="email"]').fill('admin@aris.com');
    await page.locator('input[name="password"]').fill('password123');
    await page.locator('button[type="submit"]').click();

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    expect(page.url()).toContain('/dashboard');
  });

  test('password visibility toggle works', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.locator('input[name="password"]');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click the toggle button inside the password wrapper
    await page.locator('input[name="password"] ~ button[type="button"]').click();

    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('Sign in button is disabled when loading', async ({ page }) => {
    // Intercept and delay the login request
    await page.route('**/api/auth/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'abc', user: {} }),
      });
    });

    await page.goto('/login');
    await page.locator('input[name="email"]').fill('admin@aris.com');
    await page.locator('input[name="password"]').fill('password123');
    await page.locator('button[type="submit"]').click();

    // Button should become disabled while the request is in-flight
    await expect(page.locator('button[type="submit"]')).toBeDisabled({ timeout: 3000 });
  });
});
