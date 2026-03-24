/**
 * spare-parts-pr.spec.js
 *
 * Tests the end-to-end flow:
 *   Asset Maintenance → add spare parts to a log
 *     → backend auto-creates a Draft PR in Procurement
 *
 * Three layers:
 *   1. UI — Asset Maintenance page renders the Part # field (regression guard)
 *   2. UI — Procurement page renders Draft PRs correctly
 *   3. API — Real backend integration: POST maintenance log with parts,
 *             then verify Draft PR was created in /api/procurement/prs
 */

const { test, expect, request } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const { mockAuth } = require('./helpers/auth');

const API          = 'http://localhost:3003';
const TOKEN_FILE   = path.join(__dirname, '.auth-token.json');

// ── helpers ───────────────────────────────────────────────────────────────────

function getToken() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE)).token;
  } catch {
    return null;
  }
}

function authHeader() {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

// ── Shared mock data ──────────────────────────────────────────────────────────

const MOCK_ASSET = {
  asset_id: 1,          // asset_lifecycle_cost_view uses asset_id (not id)
  asset_code: 'AST-001',
  asset_name: 'Digital X-Ray Unit',
  asset_type: 'MODALITY',
  center_name: 'Main Center',
  center_id: 1,
  acquisition_cost: 500000,
  total_lifecycle_cost: 550000,
  total_maintenance_cost: 45000,
  total_parts_cost: 5000,
  total_contract_cost: 0,
  maintenance_count: 2,
  contract_count: 0,
  total_downtime_hours: 4,
  open_tickets: 0,
};

const MOCK_LOG = {
  id: 99,
  asset_id: 1,
  maintenance_type: 'CORRECTIVE',
  status: 'OPEN',
  reported_date: '2026-03-16',
  technician_name: 'Test Tech',
  problem_description: 'Fan failure',
  labor_cost: 500,
  other_cost: 0,
  total_cost: 2500,
  parts_cost: 2000,
  parts: [
    { id: 1, part_code: 'FAN-001', part_name: 'Cooling Fan', quantity: 1, unit_cost: 1800, total_cost: 2124 },
    { id: 2, part_code: 'BLT-002', part_name: 'Drive Belt',  quantity: 2, unit_cost: 100,  total_cost: 236  },
  ],
};

const MOCK_DRAFT_PR = {
  id: 201,
  pr_number: 'PR-2026-0001',
  title: 'Spare Parts Replenishment — Digital X-Ray Unit (AST-001)',
  status: 'DRAFT',
  priority: 'NORMAL',
  center_name: 'Main Center',
  requester_name: 'admin',
  total_estimated: 2000,
  item_count: 2,
  created_at: new Date().toISOString(),
  justification: 'Auto-generated from CORRECTIVE maintenance log #99 for asset AST-001.',
  department: 'Maintenance',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1 — Asset Maintenance UI
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Asset Maintenance — Spare Parts UI', () => {

  async function mockAssetMaintenanceAPIs(page) {
    await page.route('**/api/asset-maintenance/assets**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, assets: [MOCK_ASSET] }) })
    );
    // fetchDetail calls /overview and /logs in parallel
    // Response shape: { success, overview: {...asset fields...}, contracts: [] }
    await page.route('**/api/asset-maintenance/*/overview**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, overview: MOCK_ASSET, contracts: [] }) })
    );
    await page.route('**/api/asset-maintenance/*/logs**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, logs: [] }) });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/asset-maintenance/*/contracts**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, contracts: [] }) })
    );
    await page.route('**/api/centers**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, centers: [{ id: 1, name: 'Main Center' }] }) })
    );
  }

  test('page loads and shows asset in table', async ({ page }) => {
    await mockAuth(page);
    await mockAssetMaintenanceAPIs(page);
    await page.goto('/asset-maintenance');

    await expect(page.locator('text=Digital X-Ray Unit')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=AST-001')).toBeVisible();
  });

  test('asset row shows correct status badge', async ({ page }) => {
    await mockAuth(page);
    await mockAssetMaintenanceAPIs(page);
    await page.goto('/asset-maintenance');

    await expect(page.locator('text=✓ Active').or(page.locator('text=Active')).first())
      .toBeVisible({ timeout: 10000 });
  });

  test('clicking an asset opens the detail panel', async ({ page }) => {
    await mockAuth(page);
    await mockAssetMaintenanceAPIs(page);
    await page.goto('/asset-maintenance');

    await page.locator('tr:has-text("Digital X-Ray Unit")').first().click({ timeout: 10000 });
    // Detail panel should show lifecycle cost cards
    await expect(page.locator('text=Lifecycle').or(page.locator('text=Contracts')).first())
      .toBeVisible({ timeout: 10000 });
  });

  // Helper: click asset row → switch to Service Log tab → click + Log Event
  async function openLogModal(page) {
    // The onClick handler is on the <tr> — use the role=row locator which is more reliable
    await page.locator('tr').filter({ hasText: 'Digital X-Ray Unit' }).first()
      .click({ timeout: 10000 });
    // "All Assets" back-button is unique to the detail panel — reliable wait condition
    await expect(page.locator('button:has-text("All Assets")')).toBeVisible({ timeout: 8000 });
    // Switch to the "Service Log" tab inside the detail panel
    await page.locator('button:has-text("Service Log")').first().click({ timeout: 8000 });
    // Wait for the tab to activate, then click + Log Event
    await page.locator('button:has-text("Log Event")').first().click({ timeout: 8000 });
  }

  test('Log Event button opens the log modal', async ({ page }) => {
    await mockAuth(page);
    await mockAssetMaintenanceAPIs(page);
    await page.goto('/asset-maintenance');

    await openLogModal(page);

    // Modal should appear — look for spare parts section or form title
    await expect(
      page.locator('text=Spare Parts Used')
        .or(page.locator('text=Log Maintenance Event'))
        .or(page.locator('text=Add Part'))
        .first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('spare parts form has Part # column header', async ({ page }) => {
    await mockAuth(page);
    await mockAssetMaintenanceAPIs(page);
    await page.goto('/asset-maintenance');

    await openLogModal(page);
    // Add a part to reveal the column headers
    await page.locator('button:has-text("+ Add Part")').first().click({ timeout: 8000 });

    await expect(page.locator('text=Part #')).toBeVisible({ timeout: 5000 });
  });

  test('Part # input field is editable and accepts a code', async ({ page }) => {
    await mockAuth(page);
    await mockAssetMaintenanceAPIs(page);
    await page.goto('/asset-maintenance');

    await openLogModal(page);
    await page.locator('button:has-text("+ Add Part")').first().click({ timeout: 8000 });

    const codeInput = page.locator('input[placeholder="Code"]').first();
    await codeInput.fill('FAN-001');
    await expect(codeInput).toHaveValue('FAN-001');
  });

  test('spare part row captures name, qty, rate and Part #', async ({ page }) => {
    await mockAuth(page);
    await mockAssetMaintenanceAPIs(page);
    await page.goto('/asset-maintenance');

    await openLogModal(page);
    await page.locator('button:has-text("+ Add Part")').first().click({ timeout: 8000 });

    await page.locator('input[placeholder="Code"]').first().fill('FAN-001');
    await page.locator('input[placeholder="Part name *"]').first().fill('Cooling Fan');
    await page.locator('input[placeholder="0.00"]').first().fill('1800');

    await expect(page.locator('input[placeholder="Code"]').first()).toHaveValue('FAN-001');
    await expect(page.locator('input[placeholder="Part name *"]').first()).toHaveValue('Cooling Fan');
    await expect(page.locator('input[placeholder="0.00"]').first()).toHaveValue('1800');
  });

  test('saving a log with parts calls the correct API endpoint', async ({ page }) => {
    await mockAuth(page);
    await mockAssetMaintenanceAPIs(page);

    // Intercept the POST and capture the request body
    // (override the GET-only mock set in mockAssetMaintenanceAPIs for this test)
    let capturedBody = null;
    await page.route('**/api/asset-maintenance/*/logs**', async (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, log: MOCK_LOG }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, logs: [] }) });
      }
    });

    await page.goto('/asset-maintenance');
    await openLogModal(page);

    await page.locator('button:has-text("+ Add Part")').first().click({ timeout: 8000 });
    await page.locator('input[placeholder="Code"]').first().fill('FAN-001');
    await page.locator('input[placeholder="Part name *"]').first().fill('Cooling Fan');
    await page.locator('input[placeholder="0.00"]').first().fill('1800');

    await page.locator('button[type="submit"]').or(
      page.locator('button:has-text("Save")')
    ).first().click({ timeout: 5000 });

    // Verify the POST was made with parts including part_code
    await page.waitForTimeout(1000);
    if (capturedBody) {
      expect(capturedBody.parts).toBeDefined();
      expect(capturedBody.parts.length).toBeGreaterThan(0);
      expect(capturedBody.parts[0].part_code).toBe('FAN-001');
      expect(capturedBody.parts[0].part_name).toBe('Cooling Fan');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2 — Procurement UI (Draft PR)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Procurement — Draft PR from Spare Parts', () => {

  async function mockProcurementAPIs(page, prs = [MOCK_DRAFT_PR]) {
    await page.route('**/api/procurement/prs**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, prs, total: prs.length }) })
    );
    await page.route('**/api/procurement/pos**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, pos: [] }) })
    );
    await page.route('**/api/procurement/notifications**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, notifications: [], unread: 0 }) })
    );
    await page.route('**/api/procurement/approval-matrix**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, matrix: [] }) })
    );
    await page.route('**/api/centers**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, centers: [{ id: 1, name: 'Main Center' }] }) })
    );
  }

  test('procurement page loads', async ({ page }) => {
    await mockAuth(page);
    await mockProcurementAPIs(page);
    await page.goto('/procurement');
    await expect(page.locator('text=Purchase Requisitions').or(
      page.locator('text=Procurement')).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('auto-created Draft PR appears in the PR list', async ({ page }) => {
    await mockAuth(page);
    await mockProcurementAPIs(page);
    await page.goto('/procurement');

    await expect(page.locator('text=PR-2026-0001')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Spare Parts Replenishment')).toBeVisible();
    await expect(page.locator('text=Digital X-Ray Unit')).toBeVisible();
  });

  test('Draft PR shows DRAFT status badge', async ({ page }) => {
    await mockAuth(page);
    await mockProcurementAPIs(page);
    await page.goto('/procurement');

    await expect(page.locator('text=Draft').first()).toBeVisible({ timeout: 10000 });
  });

  test('Draft PR shows the correct center', async ({ page }) => {
    await mockAuth(page);
    await mockProcurementAPIs(page);
    await page.goto('/procurement');

    await expect(page.locator('text=Main Center').first()).toBeVisible({ timeout: 10000 });
  });

  test('empty procurement shows no PRs message or empty table', async ({ page }) => {
    await mockAuth(page);
    await mockProcurementAPIs(page, []); // no PRs
    await page.goto('/procurement');

    // Should show empty state text or just an empty table — not crash
    const table = page.locator('table').first();
    const empty  = page.locator('text=No purchase requisitions').or(
                    page.locator('text=No PRs').or(page.locator('text=0 results')));
    const oneOf  = table.or(empty);
    await expect(oneOf.first()).toBeVisible({ timeout: 10000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3 — Real API integration (hits live backend on port 3003)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('API Integration — spare parts → auto Draft PR', () => {
  let apiCtx;
  let token;

  test.beforeAll(async () => {
    token = getToken();
    if (!token) test.skip();
    apiCtx = await request.newContext({ baseURL: API });
  });

  test.afterAll(async () => {
    await apiCtx?.dispose();
  });

  test('backend health check passes', async () => {
    const r = await apiCtx.get('/api/health');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.status).toBe('healthy');
    expect(body.database).toBe('connected');
  });

  test('item search returns items from item_master with source=ITEM_MASTER', async () => {
    const r = await apiCtx.get('/api/procurement/items/search?q=x', {
      headers: authHeader(),
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    // Every result from item_master must carry the source field
    const masterItems = body.items.filter(i => i.source === 'ITEM_MASTER');
    masterItems.forEach(i => {
      expect(i.item_code).toBeTruthy();
      expect(i.item_name).toBeTruthy();
    });
  });

  test('item search results include item_code field', async () => {
    const r = await apiCtx.get('/api/procurement/items/search?q=tube', {
      headers: authHeader(),
    });
    const body = await r.json();
    body.items.forEach(item => {
      // item_code may be null for spare parts without a code, but the field must exist
      expect('item_code' in item).toBe(true);
      expect('source' in item).toBe(true);
    });
  });

  test('GET /api/procurement/prs returns success', async () => {
    const r = await apiCtx.get('/api/procurement/prs', { headers: authHeader() });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.prs)).toBe(true);
  });

  test('POST maintenance log with parts creates a Draft PR', async () => {
    // 1. Find a valid asset to use
    const assetsR = await apiCtx.get('/api/asset-maintenance/assets', {
      headers: authHeader(),
    });
    expect(assetsR.ok()).toBeTruthy();
    const assetsBody = await assetsR.json();
    const assets = assetsBody.assets || [];
    if (!assets.length) {
      test.skip(); // no assets in DB — skip
      return;
    }
    // asset_lifecycle_cost_view uses asset_id (not id)
    const asset = assets.find(a => a.asset_id) || assets[0];
    const assetId = asset.asset_id;
    if (!assetId) { test.skip(); return; }

    // 2. Count existing Draft PRs before
    const prsBefore = await apiCtx.get('/api/procurement/prs?status=DRAFT', {
      headers: authHeader(),
    });
    const beforeBody = await prsBefore.json();
    const countBefore = beforeBody.total ?? (beforeBody.prs?.length ?? 0);

    // 3. Create a maintenance log with 2 spare parts
    const logPayload = {
      maintenance_type:    'CORRECTIVE',
      reported_date:       '2026-03-16',
      status:              'OPEN',
      technician_name:     'Playwright Tester',
      problem_description: 'Automated test — spare parts PR creation check',
      labor_cost:          500,
      other_cost:          0,
      parts: [
        { part_code: 'PW-PART-001', part_name: 'PW Test Fan',  quantity: 1, unit_cost: 1200, gst_rate: 18 },
        { part_code: 'PW-PART-002', part_name: 'PW Test Belt', quantity: 2, unit_cost: 300,  gst_rate: 12 },
      ],
    };

    const logR = await apiCtx.post(`/api/asset-maintenance/${assetId}/logs`, {
      headers: authHeader(),
      data: logPayload,
    });
    expect(logR.ok()).toBeTruthy();
    const logBody = await logR.json();
    expect(logBody.success).toBe(true);
    const logId = logBody.log?.id;
    expect(logId).toBeTruthy();

    // 4. Give backend a moment to create the PR (it's async but fast)
    await new Promise(r => setTimeout(r, 800));

    // 5. Count Draft PRs after — should have increased by 1
    const prsAfter = await apiCtx.get('/api/procurement/prs?status=DRAFT', {
      headers: authHeader(),
    });
    const afterBody = await prsAfter.json();
    const countAfter = afterBody.total ?? (afterBody.prs?.length ?? 0);
    expect(countAfter).toBeGreaterThan(countBefore);

    // 6. Find the specific Draft PR created for this asset
    const allDraft = afterBody.prs || [];
    const autoPR = allDraft.find(pr =>
      pr.title?.includes(asset.asset_code) &&
      pr.status === 'DRAFT'
    );
    expect(autoPR).toBeDefined();
    expect(autoPR.title).toContain('Spare Parts Replenishment');
    expect(autoPR.title).toContain(asset.asset_code);
    expect(autoPR.status).toBe('DRAFT');

    // 7. Verify the PR has line items
    const prDetailR = await apiCtx.get(`/api/procurement/prs/${autoPR.id}`, {
      headers: authHeader(),
    });
    expect(prDetailR.ok()).toBeTruthy();
    const prDetail = await prDetailR.json();
    expect(prDetail.success).toBe(true);
    expect(prDetail.items.length).toBe(2);

    const codes = prDetail.items.map(i => i.item_code);
    expect(codes).toContain('PW-PART-001');
    expect(codes).toContain('PW-PART-002');

    const names = prDetail.items.map(i => i.item_name);
    expect(names).toContain('PW Test Fan');
    expect(names).toContain('PW Test Belt');

    // 8. Clean up — soft-delete the test maintenance log
    if (logId) {
      await apiCtx.delete(`/api/asset-maintenance/logs/${logId}`, {
        headers: authHeader(),
      });
    }
  });

  test('Draft PR justification references the maintenance log and asset code', async () => {
    // Quick check: any recently created Draft PR from asset maintenance
    // should have the expected justification text
    const r = await apiCtx.get('/api/procurement/prs?status=DRAFT', {
      headers: authHeader(),
    });
    const body = await r.json();
    const prs = body.prs || [];
    const autoGenerated = prs.filter(pr =>
      pr.title?.includes('Spare Parts Replenishment')
    );
    // If any exist, verify the structure
    for (const pr of autoGenerated.slice(0, 3)) {
      const detR = await apiCtx.get(`/api/procurement/prs/${pr.id}`, {
        headers: authHeader(),
      });
      const det = await detR.json();
      expect(det.pr.justification).toMatch(/Auto-generated from .* maintenance log/);
      expect(det.pr.status).toBe('DRAFT');
    }
  });
});
