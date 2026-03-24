const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const BASE = 'http://localhost:3001';
const API  = 'http://localhost:3003';
const TOKEN_FILE = path.join(__dirname, '.auth-token.json');

const SUFFIX = Date.now().toString().slice(-6);
const PHYSICIAN = {
  first_name: 'Playwright',
  last_name:  `Doctor${SUFFIX}`,
  specialty:  'Radiology',
  phone:      '+91 98000 11111',
  address:    '42 Test Nagar, Kozhikode',
};

// ── helpers ───────────────────────────────────────────────────────────────────

async function goToPhysicianTab(page) {
  await page.goto(`${BASE}/master-data`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /referring physician/i }).click();
  await expect(page.getByRole('heading', { name: 'Referring Physician Master' })).toBeVisible({ timeout: 10000 });
}

// ── tests run sequentially ────────────────────────────────────────────────────
test.describe.serial('Physician Master E2E', () => {
  let authToken;

  test.beforeAll(async ({ request }) => {
    authToken = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).token;

    // Clean up orphaned Playwright test physicians from previous runs
    const resp = await request.get(`${API}/api/referring-physicians?active_only=false`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const body = await resp.json();
    const orphans = (body.physicians || []).filter(p =>
      p.first_name === 'Playwright'
    );
    for (const p of orphans) {
      await request.delete(`${API}/api/referring-physicians/${p.id}`, {
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

  // 1. Page loads ──────────────────────────────────────────────────────────────
  test('loads Physician Master tab and shows table', async ({ page }) => {
    await goToPhysicianTab(page);
    await expect(page.getByRole('heading', { name: 'Referring Physician Master' })).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ add physician/i })).toBeVisible();
    // Existing seeded physicians should appear
    await expect(page.getByText('Priya')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Cardiology')).toBeVisible({ timeout: 8000 });
  });

  // 2. Table shows all seeded physicians ────────────────────────────────────────
  test('table shows seeded physicians with correct columns', async ({ page }) => {
    await goToPhysicianTab(page);
    // Check table headers
    await expect(page.getByRole('columnheader', { name: 'Code' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Specialty' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Phone' })).toBeVisible();
    // Check a few seeded rows
    await expect(page.getByText('Suresh')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Gastroenterology')).toBeVisible();
    await expect(page.getByText('PHY0004')).toBeVisible();
  });

  // 3. Validation — empty submit ─────────────────────────────────────────────
  test('shows validation errors on empty submit', async ({ page }) => {
    await goToPhysicianTab(page);

    await page.getByRole('button', { name: /\+ add physician/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Physician' })).toBeVisible();

    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText('First name is required')).toBeVisible();
    await expect(page.getByText('Last name is required')).toBeVisible();
    await expect(page.getByText('Specialty is required')).toBeVisible();

    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Physician' })).not.toBeVisible({ timeout: 3000 });
  });

  // 4. Add ───────────────────────────────────────────────────────────────────
  test('can add a new physician', async ({ page }) => {
    await goToPhysicianTab(page);

    await page.getByRole('button', { name: /\+ add physician/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Physician' })).toBeVisible();

    await page.getByPlaceholder(/first name/i).fill(PHYSICIAN.first_name);
    await page.getByPlaceholder(/last name/i).fill(PHYSICIAN.last_name);
    await page.locator('select').filter({ hasText: /select specialty/i }).selectOption(PHYSICIAN.specialty);
    await page.getByPlaceholder(/e\.g\. \+91/i).fill(PHYSICIAN.phone);
    await page.getByPlaceholder(/clinic \/ hospital address/i).fill(PHYSICIAN.address);

    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByRole('heading', { name: 'Add Physician' })).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(PHYSICIAN.last_name)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(PHYSICIAN.specialty)).toBeVisible();
  });

  // 5. Edit ──────────────────────────────────────────────────────────────────
  test('can edit the test physician', async ({ page }) => {
    await goToPhysicianTab(page);

    const row = page.locator('tr', { hasText: PHYSICIAN.last_name });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Physician' })).toBeVisible();

    // Verify fields are populated
    await expect(page.getByPlaceholder(/first name/i)).toHaveValue(PHYSICIAN.first_name);
    await expect(page.getByPlaceholder(/last name/i)).toHaveValue(PHYSICIAN.last_name);

    // Update address
    await page.getByPlaceholder(/clinic \/ hospital address/i).fill('99 Updated Street, Kozhikode');

    await page.getByRole('button', { name: /^update$/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Physician' })).not.toBeVisible({ timeout: 5000 });
    const updatedRow = page.locator('tr', { hasText: PHYSICIAN.last_name });
    await expect(updatedRow).toBeVisible({ timeout: 8000 });
  });

  // 6. Status — Active → Inactive ────────────────────────────────────────────
  test('can set physician status to Inactive', async ({ page }) => {
    await goToPhysicianTab(page);

    const row = page.locator('tr', { hasText: PHYSICIAN.last_name });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Physician' })).toBeVisible();
    await page.getByLabel(/^status/i).selectOption('inactive');
    await page.getByRole('button', { name: /^update$/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Physician' })).not.toBeVisible({ timeout: 5000 });
    const updatedRow = page.locator('tr', { hasText: PHYSICIAN.last_name });
    await expect(updatedRow.getByText('Inactive')).toBeVisible({ timeout: 8000 });
  });

  // 7. Status — Inactive → Active ────────────────────────────────────────────
  test('can restore physician status to Active', async ({ page }) => {
    await goToPhysicianTab(page);

    const row = page.locator('tr', { hasText: PHYSICIAN.last_name });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /edit/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Physician' })).toBeVisible();
    await page.getByLabel(/^status/i).selectOption('active');
    await page.getByRole('button', { name: /^update$/i }).click();

    await expect(page.getByRole('heading', { name: 'Edit Physician' })).not.toBeVisible({ timeout: 5000 });
    const updatedRow = page.locator('tr', { hasText: PHYSICIAN.last_name });
    await expect(updatedRow.getByText('Active')).toBeVisible({ timeout: 8000 });
  });

  // 8. Cancel discards ────────────────────────────────────────────────────────
  test('Cancel closes Add Physician modal without saving', async ({ page }) => {
    await goToPhysicianTab(page);

    await page.getByRole('button', { name: /\+ add physician/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Physician' })).toBeVisible();

    await page.getByPlaceholder(/first name/i).fill('ShouldNotAppear');
    await page.getByRole('button', { name: /cancel/i }).click();

    await expect(page.getByRole('heading', { name: 'Add Physician' })).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText('ShouldNotAppear')).not.toBeVisible();
  });

  // 9. Delete ────────────────────────────────────────────────────────────────
  test('can delete the test physician', async ({ page }) => {
    await goToPhysicianTab(page);

    const row = page.locator('tr', { hasText: PHYSICIAN.last_name });
    await expect(row).toBeVisible({ timeout: 8000 });

    page.on('dialog', d => d.accept());

    const deleteResponse = page.waitForResponse(
      resp => resp.url().includes('/api/referring-physicians/') && resp.request().method() === 'DELETE'
    );
    await row.getByRole('button', { name: /delete/i }).click();
    const resp = await deleteResponse;
    expect(resp.status()).toBe(200);

    await expect(page.locator('tr', { hasText: PHYSICIAN.last_name })).not.toBeVisible({ timeout: 8000 });
  });
});
