const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const BASE = 'http://localhost:3001';
const API  = 'http://localhost:3003';
const TOKEN_FILE = path.join(__dirname, '.auth-token.json');

// Unique suffix so repeated runs don't clash
const SUFFIX = Date.now().toString().slice(-6);
const ROLE = {
  code:        `PW_ROLE_${SUFFIX}`,
  name:        `Playwright Test Role ${SUFFIX}`,
  description: 'Created by Playwright automated test suite',
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function goToRoleTab(page) {
  await page.goto(`${BASE}/master-data`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /role master/i }).click();
  await expect(page.getByRole('heading', { name: 'Role Master' })).toBeVisible({ timeout: 10000 });
}

// ── tests run sequentially ───────────────────────────────────────────────────
test.describe.serial('Role Master E2E', () => {
  let authToken;

  test.beforeAll(async ({ request }) => {
    // Read shared token written by global setup (avoids repeated login / rate-limit)
    authToken = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).token;

    // Clean up orphaned Playwright test roles from previous runs
    const rolesResp = await request.get(`${API}/api/rbac/roles?active_only=false`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rolesBody = await rolesResp.json();
    const orphans = (rolesBody.roles || []).filter(r =>
      r.role && r.role.startsWith('PW_ROLE_')
    );
    for (const r of orphans) {
      await request.delete(`${API}/api/rbac/roles/${r.id}`, {
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
  test('loads Role Master tab and shows table', async ({ page }) => {
    await goToRoleTab(page);
    await expect(page.getByRole('heading', { name: 'Role Master' })).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ add role/i })).toBeVisible();
    // Existing system roles should be present
    await expect(page.getByText('SUPER_ADMIN')).toBeVisible({ timeout: 8000 });
  });

  // 2. Validation — empty submit ───────────────────────────────────────────────
  test('shows validation errors on empty submit', async ({ page }) => {
    await goToRoleTab(page);

    await page.getByRole('button', { name: /\+ add role/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Role' })).toBeVisible();

    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText('Role Code is required')).toBeVisible();
    await expect(page.getByText('Display Name is required')).toBeVisible();
    await expect(page.getByText('Description is required')).toBeVisible();

    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Role' })).not.toBeVisible({ timeout: 3000 });
  });

  // 3. Role code format validation ────────────────────────────────────────────
  test('shows error for invalid role code format', async ({ page }) => {
    await goToRoleTab(page);

    await page.getByRole('button', { name: /\+ add role/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Role' })).toBeVisible();

    await page.getByPlaceholder(/e\.g\. RECEPTIONIST/i).fill('invalid role!');
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText(/only uppercase letters/i)).toBeVisible();

    await page.getByRole('button', { name: /cancel/i }).click();
  });

  // 4. Add ────────────────────────────────────────────────────────────────────
  test('can add a new role', async ({ page }) => {
    await goToRoleTab(page);

    await page.getByRole('button', { name: /\+ add role/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Role' })).toBeVisible();

    await page.getByPlaceholder(/e\.g\. RECEPTIONIST/i).fill(ROLE.code);
    await page.getByPlaceholder(/e\.g\. Front Desk/i).fill(ROLE.name);
    await page.getByPlaceholder(/brief description/i).fill(ROLE.description);

    // Toggle corporate role checkbox
    await page.getByLabel(/corporate role/i).check();

    // Check a couple of individual permissions inside the modal
    const modal = page.locator('.fixed.inset-0').last();
    const patientViewChk = modal.locator('label').filter({ hasText: /Patient view/i }).locator('input[type="checkbox"]');
    if (await patientViewChk.count()) await patientViewChk.check();

    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByRole('heading', { name: 'Add Role' })).not.toBeVisible({ timeout: 5000 });
    // Role code should now appear in table
    await expect(page.getByText(ROLE.code)).toBeVisible({ timeout: 8000 });
  });

  // 5. Edit ───────────────────────────────────────────────────────────────────
  test('can edit the test role', async ({ page }) => {
    await goToRoleTab(page);

    const row = page.locator('tr', { hasText: ROLE.code });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Role' })).toBeVisible();

    // Role Code field should be disabled (not editable)
    const roleCodeInput = page.getByPlaceholder(/e\.g\. RECEPTIONIST/i);
    await expect(roleCodeInput).toBeDisabled();

    // Update display name
    const nameInput = page.getByPlaceholder(/e\.g\. Front Desk/i);
    await nameInput.fill(ROLE.name + ' Updated');

    await page.getByRole('button', { name: /^update$/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Role' })).not.toBeVisible({ timeout: 5000 });

    // Updated name should appear in the row for our role code
    const updatedRow = page.locator('tr', { hasText: ROLE.code });
    await expect(updatedRow).toContainText(ROLE.name + ' Updated', { timeout: 8000 });
  });

  // 6. Permissions select-all / clear-all ────────────────────────────────────
  test('select-all and clear-all permissions work', async ({ page }) => {
    await goToRoleTab(page);

    const row = page.locator('tr', { hasText: ROLE.code });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();
    await expect(page.getByRole('heading', { name: 'Edit Role' })).toBeVisible();

    // Select all
    await page.getByRole('button', { name: /select all/i }).click();
    // At least one permission checkbox should now be checked
    const checkedBoxes = page.locator('input[type="checkbox"]:checked');
    await expect(checkedBoxes).not.toHaveCount(0);

    // Clear all
    await page.getByRole('button', { name: /clear all/i }).click();

    await page.getByRole('button', { name: /cancel/i }).click();
  });

  // 7. Cancel discards ────────────────────────────────────────────────────────
  test('Cancel closes modal without saving', async ({ page }) => {
    await goToRoleTab(page);

    await page.getByRole('button', { name: /\+ add role/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Role' })).toBeVisible();

    await page.getByPlaceholder(/e\.g\. RECEPTIONIST/i).fill('SHOULD_NOT_EXIST');
    await page.getByRole('button', { name: /cancel/i }).click();

    await expect(page.getByRole('heading', { name: 'Add Role' })).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText('SHOULD_NOT_EXIST')).not.toBeVisible();
  });

  // 8. Delete ─────────────────────────────────────────────────────────────────
  test('can delete the test role', async ({ page }) => {
    await goToRoleTab(page);

    const row = page.locator('tr', { hasText: ROLE.code });
    await expect(row).toBeVisible({ timeout: 8000 });

    page.on('dialog', d => d.accept());

    const deleteResponse = page.waitForResponse(
      resp => resp.url().includes('/api/rbac/roles/') && resp.request().method() === 'DELETE'
    );
    await row.getByRole('button', { name: /delete/i }).click();
    const resp = await deleteResponse;
    expect(resp.status()).toBe(200);

    await expect(page.locator('tr', { hasText: ROLE.code })).not.toBeVisible({ timeout: 8000 });
  });
});
