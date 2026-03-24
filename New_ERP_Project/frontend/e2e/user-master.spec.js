const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const BASE = 'http://localhost:3001';
const API  = 'http://localhost:3003';
const TOKEN_FILE = path.join(__dirname, '.auth-token.json');

const SUFFIX = Date.now().toString().slice(-6);
const USER = {
  first_name: 'Playwright',
  last_name:  'Tester',
  username:   `pw_test_${SUFFIX}`,
  email:      `pw_test_${SUFFIX}@playwright.test`,
  password:   'PlaywrightTest@123',
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function goToUserTab(page) {
  await page.goto(`${BASE}/master-data`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /user master/i }).click();
  await expect(page.getByRole('heading', { name: 'User Master' })).toBeVisible({ timeout: 10000 });
}

// ── tests run sequentially ───────────────────────────────────────────────────
test.describe.serial('User Master E2E', () => {
  let authToken;

  test.beforeAll(async ({ request }) => {
    // Read shared token written by global setup (avoids repeated login / rate-limit)
    authToken = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).token;

    // Clean up orphaned Playwright test users from previous runs
    const usersResp = await request.get(`${API}/api/rbac/users?active_only=false`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const usersBody = await usersResp.json();
    const orphans = (usersBody.users || []).filter(u =>
      u.username && u.username.startsWith('pw_test_')
    );
    for (const u of orphans) {
      await request.delete(`${API}/api/rbac/users/${u.id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ id: 1, email: 'admin@aris.com', role: 'ADMIN' }));
    }, authToken);
  });

  // 1. Page loads ─────────────────────────────────────────────────────────────
  test('loads User Master tab and shows table', async ({ page }) => {
    await goToUserTab(page);
    await expect(page.getByRole('heading', { name: 'User Master' })).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ add user/i })).toBeVisible();
    // Existing admin user should appear in the table
    await expect(page.getByRole('cell', { name: 'admin@aris.com' })).toBeVisible({ timeout: 8000 });
  });

  // 2. Validation — empty submit ───────────────────────────────────────────────
  test('shows validation errors on empty submit', async ({ page }) => {
    await goToUserTab(page);

    await page.getByRole('button', { name: /\+ add user/i }).click();
    await expect(page.getByRole('heading', { name: 'Add User' })).toBeVisible();

    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText(/first or last name required/i)).toBeVisible();
    await expect(page.getByText('Username is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
    await expect(page.getByText('Role is required')).toBeVisible();

    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('heading', { name: 'Add User' })).not.toBeVisible({ timeout: 3000 });
  });

  // 3. Duplicate username / email (backend validation) ────────────────────────
  test('shows error for duplicate email', async ({ page }) => {
    await goToUserTab(page);

    await page.getByRole('button', { name: /\+ add user/i }).click();
    await expect(page.getByRole('heading', { name: 'Add User' })).toBeVisible();

    await page.getByPlaceholder(/first name/i).fill('Dupe');
    await page.getByPlaceholder(/e\.g\. john\.doe/i).fill('dupeuser_test');
    await page.getByPlaceholder(/user@example\.com/i).fill('admin@aris.com'); // existing email
    await page.getByPlaceholder(/min\. 8 characters/i).fill('Password@123');
    await page.locator('select').filter({ hasText: /select role/i }).selectOption({ index: 1 });

    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText(/email.*already exists/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /cancel/i }).click();
  });

  // 4. Add ────────────────────────────────────────────────────────────────────
  test('can add a new user', async ({ page }) => {
    await goToUserTab(page);

    await page.getByRole('button', { name: /\+ add user/i }).click();
    await expect(page.getByRole('heading', { name: 'Add User' })).toBeVisible();

    await page.getByPlaceholder(/first name/i).fill(USER.first_name);
    await page.getByPlaceholder(/last name/i).fill(USER.last_name);
    await page.getByPlaceholder(/e\.g\. john\.doe/i).fill(USER.username);
    await page.getByPlaceholder(/user@example\.com/i).fill(USER.email);
    await page.getByPlaceholder(/min\. 8 characters/i).fill(USER.password);
    // Select any available role
    await page.locator('select').filter({ hasText: /select role/i }).selectOption({ index: 1 });

    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByRole('heading', { name: 'Add User' })).not.toBeVisible({ timeout: 5000 });
    // Verify by unique email
    await expect(page.getByText(USER.email)).toBeVisible({ timeout: 8000 });
  });

  // 5. Edit ───────────────────────────────────────────────────────────────────
  test('can edit the test user', async ({ page }) => {
    await goToUserTab(page);

    const row = page.locator('tr', { hasText: USER.email });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();

    // Username field should be disabled
    const usernameInput = page.getByPlaceholder(/e\.g\. john\.doe/i);
    await expect(usernameInput).toBeDisabled();

    // Update first name
    const firstNameInput = page.getByPlaceholder(/first name/i);
    await firstNameInput.fill('PlaywrightUpdated');

    await page.getByRole('button', { name: /^update$/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit User' })).not.toBeVisible({ timeout: 5000 });

    const updatedRow = page.locator('tr', { hasText: USER.email });
    await expect(updatedRow).toContainText('PlaywrightUpdated', { timeout: 8000 });
  });

  // 6. Status — Active → Inactive ─────────────────────────────────────────────
  test('can set user status to Inactive', async ({ page }) => {
    await goToUserTab(page);

    const row = page.locator('tr', { hasText: USER.email });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();
    await page.getByLabel(/^status/i).selectOption('inactive');
    await page.getByRole('button', { name: /^update$/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit User' })).not.toBeVisible({ timeout: 5000 });

    const updatedRow = page.locator('tr', { hasText: USER.email });
    await expect(updatedRow.getByText('Inactive')).toBeVisible({ timeout: 8000 });
  });

  // 7. Status — Inactive → Active ─────────────────────────────────────────────
  test('can restore user status to Active', async ({ page }) => {
    await goToUserTab(page);

    const row = page.locator('tr', { hasText: USER.email });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();
    await page.getByLabel(/^status/i).selectOption('active');
    await page.getByRole('button', { name: /^update$/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit User' })).not.toBeVisible({ timeout: 5000 });

    const updatedRow = page.locator('tr', { hasText: USER.email });
    await expect(updatedRow.getByText('Active')).toBeVisible({ timeout: 8000 });
  });

  // 8. Reset password ─────────────────────────────────────────────────────────
  test('can reset user password', async ({ page }) => {
    await goToUserTab(page);

    const row = page.locator('tr', { hasText: USER.email });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /reset pwd/i }).click();

    await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible();

    // Type short password — should show error
    await page.getByPlaceholder(/min\. 8 characters/i).fill('short');
    await page.getByRole('button', { name: /change password/i }).click();
    await expect(page.getByText(/minimum 8 characters/i)).toBeVisible();

    // Type valid password
    await page.getByPlaceholder(/min\. 8 characters/i).fill('NewPassword@456');
    await page.getByRole('button', { name: /change password/i }).click();

    await expect(page.getByRole('heading', { name: 'Reset Password' })).not.toBeVisible({ timeout: 5000 });
  });

  // 9. Cancel discards ────────────────────────────────────────────────────────
  test('Cancel closes Add User modal without saving', async ({ page }) => {
    await goToUserTab(page);

    await page.getByRole('button', { name: /\+ add user/i }).click();
    await expect(page.getByRole('heading', { name: 'Add User' })).toBeVisible();

    await page.getByPlaceholder(/first name/i).fill('Should Not Appear');
    await page.getByRole('button', { name: /cancel/i }).click();

    await expect(page.getByRole('heading', { name: 'Add User' })).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Should Not Appear')).not.toBeVisible();
  });

  // 10. Delete ────────────────────────────────────────────────────────────────
  test('can delete the test user', async ({ page }) => {
    await goToUserTab(page);

    const row = page.locator('tr', { hasText: USER.email });
    await expect(row).toBeVisible({ timeout: 8000 });

    page.on('dialog', d => d.accept());

    const deleteResponse = page.waitForResponse(
      resp => resp.url().includes('/api/rbac/users/') && resp.request().method() === 'DELETE'
    );
    await row.getByRole('button', { name: /delete/i }).click();
    const resp = await deleteResponse;
    expect(resp.status()).toBe(200);

    await expect(page.getByRole('cell', { name: USER.email })).not.toBeVisible({ timeout: 8000 });
  });
});
