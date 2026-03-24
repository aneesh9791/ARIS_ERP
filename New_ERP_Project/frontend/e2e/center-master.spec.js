const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const BASE = 'http://localhost:3001';
const API  = 'http://localhost:3003';
const TOKEN_FILE = path.join(__dirname, '.auth-token.json');

// Unique code so repeated runs don't clash
const CODE = `PW${Date.now().toString().slice(-6)}`;
const CENTER = { name: 'Playwright Test Center', code: CODE, address: '123 Test Street, Test City' };

// ── helpers ──────────────────────────────────────────────────────────────────

async function goToCenterTab(page) {
  await page.goto(`${BASE}/master-data`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /center master/i }).click();
  // Wait for the section heading
  await expect(page.getByRole('heading', { name: 'Center Master' })).toBeVisible({ timeout: 10000 });
}

// ── tests run sequentially because later tests depend on prior ones ──────────
test.describe.serial('Center Master E2E', () => {
  // Login once — reuse token across all tests to avoid rate-limit
  let authToken;

  test.beforeAll(async ({ request }) => {
    // Read shared token written by global setup (avoids repeated login / rate-limit)
    authToken = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).token;

    // Clean up any orphaned Playwright test centers from previous runs
    const centersResp = await request.get(`${API}/api/center-master?active_only=false`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const centersBody = await centersResp.json();
    const orphans = (centersBody.centers || []).filter(c =>
      c.name && c.name.includes('Playwright Test Center')
    );
    for (const c of orphans) {
      await request.delete(`${API}/api/center-master/${c.id}`, {
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
  test('loads Center Master tab and shows table', async ({ page }) => {
    await goToCenterTab(page);

    await expect(page.getByRole('heading', { name: 'Center Master' })).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ add center/i })).toBeVisible();
    // Table headers or empty state should be visible
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    if (hasTable) {
      await expect(page.getByText('Center Name')).toBeVisible();
      await expect(page.getByText('Center Code')).toBeVisible();
    } else {
      await expect(page.getByText(/no centers found/i)).toBeVisible();
    }
  });

  // 2. Validation — empty submit ───────────────────────────────────────────────
  test('shows validation errors on empty submit', async ({ page }) => {
    await goToCenterTab(page);

    await page.getByRole('button', { name: /\+ add center/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Center' })).toBeVisible();

    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText('Center Name is required')).toBeVisible();
    await expect(page.getByText('Center Code is required')).toBeVisible();
    await expect(page.getByText('Address is required')).toBeVisible();
    await expect(page.getByText('Contract Type is required')).toBeVisible();

    // Cancel to close
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Center' })).not.toBeVisible({ timeout: 3000 });
  });

  // 3. Duplicate code ─────────────────────────────────────────────────────────
  test('shows duplicate code error for existing code', async ({ page }) => {
    await goToCenterTab(page);

    // Get an existing code from the first row
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 8000 });
    const existingCode = await firstRow.locator('td').nth(1).textContent();

    await page.getByRole('button', { name: /\+ add center/i }).click();
    await page.getByPlaceholder(/e\.g\. ARIS Kozhikode/i).fill('Duplicate Test');
    await page.getByPlaceholder(/e\.g\. DLK001/i).fill(existingCode.trim());
    await page.getByPlaceholder(/full address/i).fill('Some Address');
    await page.getByLabel(/contract type/i).selectOption('lease');
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText('Center Code already exists')).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  // 4. Add ────────────────────────────────────────────────────────────────────
  test('can add a new center', async ({ page }) => {
    await goToCenterTab(page);

    await page.getByRole('button', { name: /\+ add center/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Center' })).toBeVisible();

    await page.getByPlaceholder(/e\.g\. ARIS Kozhikode/i).fill(CENTER.name);
    await page.getByPlaceholder(/e\.g\. DLK001/i).fill(CENTER.code);
    await page.getByPlaceholder(/full address/i).fill(CENTER.address);
    await page.getByLabel(/contract type/i).selectOption('lease');
    await page.getByLabel(/^status/i).selectOption('active');

    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByRole('heading', { name: 'Add Center' })).not.toBeVisible({ timeout: 5000 });
    // Use unique code to confirm the row was added
    await expect(page.getByRole('cell', { name: CENTER.code })).toBeVisible({ timeout: 8000 });
  });

  // 5. Edit ───────────────────────────────────────────────────────────────────
  test('can edit the test center', async ({ page }) => {
    await goToCenterTab(page);

    // Find the row by unique code
    const row = page.locator('tr', { hasText: CENTER.code });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Center' })).toBeVisible();
    const nameInput = page.getByPlaceholder(/e\.g\. ARIS Kozhikode/i);
    await expect(nameInput).toHaveValue(CENTER.name);
    await expect(page.getByPlaceholder(/e\.g\. DLK001/i)).toHaveValue(CENTER.code);

    // Change name
    await nameInput.fill(CENTER.name + ' Updated');

    await page.getByRole('button', { name: /^update$/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Center' })).not.toBeVisible({ timeout: 5000 });
    // Verify updated name appears in the row with our unique code
    const updatedRow = page.locator('tr', { hasText: CENTER.code });
    await expect(updatedRow).toContainText(CENTER.name + ' Updated', { timeout: 8000 });
  });

  // 6. Active → Inactive ──────────────────────────────────────────────────────
  test('can change status from Active to Inactive', async ({ page }) => {
    await goToCenterTab(page);

    const row = page.locator('tr', { hasText: CENTER.code });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Center' })).toBeVisible();
    await page.getByLabel(/^status/i).selectOption('inactive');
    await page.getByRole('button', { name: /^update$/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Center' })).not.toBeVisible({ timeout: 5000 });

    // Inactive badge visible in that row
    const updatedRow = page.locator('tr', { hasText: CENTER.code });
    await expect(updatedRow.getByText('Inactive')).toBeVisible({ timeout: 8000 });
  });

  // 7. Inactive → Active ──────────────────────────────────────────────────────
  test('can restore status from Inactive to Active', async ({ page }) => {
    await goToCenterTab(page);

    const row = page.locator('tr', { hasText: CENTER.code });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Center' })).toBeVisible();
    await page.getByLabel(/^status/i).selectOption('active');
    await page.getByRole('button', { name: /^update$/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Center' })).not.toBeVisible({ timeout: 5000 });

    const updatedRow = page.locator('tr', { hasText: CENTER.code });
    await expect(updatedRow.getByText('Active')).toBeVisible({ timeout: 8000 });
  });

  // 8. Cancel discards ────────────────────────────────────────────────────────
  test('Cancel closes modal without saving', async ({ page }) => {
    await goToCenterTab(page);

    await page.getByRole('button', { name: /\+ add center/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Center' })).toBeVisible();

    await page.getByPlaceholder(/e\.g\. ARIS Kozhikode/i).fill('Should Not Appear');
    await page.getByRole('button', { name: /cancel/i }).click();

    await expect(page.getByRole('heading', { name: 'Add Center' })).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Should Not Appear')).not.toBeVisible();
  });

  // 9. Delete ─────────────────────────────────────────────────────────────────
  test('can delete the test center', async ({ page }) => {
    await goToCenterTab(page);

    const row = page.locator('tr', { hasText: CENTER.code });
    await expect(row).toBeVisible({ timeout: 8000 });

    page.on('dialog', (d) => d.accept());
    await row.getByRole('button', { name: /delete/i }).click();

    await expect(page.getByRole('cell', { name: CENTER.code })).not.toBeVisible({ timeout: 8000 });
  });
});
