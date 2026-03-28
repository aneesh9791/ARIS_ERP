# ARIS ERP — TODO List

## Pending Features

---

### TDS (Tax Deducted at Source)
**Priority:** High — Statutory compliance requirement
**Affects:** Teleradiologists (194J, 10%) and Teleradiology companies (194C, 2%)

**Database:**
- [ ] Add `tds_applicable`, `tds_section`, `tds_rate` to `vendor_master`
- [ ] Create `tds_deductions` table (vendor, bill, payment, FY, gross, rate, tds_amount, net_paid, deposited)
- [ ] Add `TDS Payable` GL account (Liability)

**TDS Logic (confirmed):**
- TDS is deducted **at payment time** (real-time check, not a scheduled batch)
- At each payment: sum all FY payments to that vendor → if ≥ ₹30,000 → deduct TDS on current + all future payments
- The **7th of the month** = deadline to **deposit already-deducted TDS** to govt (not a calculation date)
- FY = April 1 to March 31; threshold resets every new FY

**Backend:**
- [ ] Update vendor master API (GET/PUT/POST) to include TDS fields
- [ ] Modify direct bill payment JE (`vendors.js`) — at payment: check cumulative FY total, if ≥ ₹30,000 split CR into Bank (net) + TDS Payable
- [ ] Modify RAD/telerad payment JE (`payments.js`) — same logic
- [ ] New `/api/tds` routes — register, pending deposits, mark deposited

**Frontend:**
- [ ] Vendor master form — TDS toggle, section (194J/194C), rate fields
- [ ] Payment confirmation modal — show gross / TDS deducted / net payable breakdown
- [ ] Finance page — new **TDS** tab with register, pending deposits, mark deposited

---

### Stock Issue / Consumption Workflow
**Priority:** Medium
**Note:** Reminded for 2026-03-19 (overdue — schedule implementation)
- [ ] Stock issue/consumption flow (details in memory: project_stock_issue_reminder.md)

---

### HRMS Module
**Priority:** Low — after Finance integration complete
- [ ] Full HRMS module (details in memory: project_hrms_plan.md)

---

## Completed ✓

- [x] Direct Bill creation, approval (JE posting), payment — all working
- [x] Teleradiology bills correctly use `RAD_BATCH` (excluded from Direct Bills tab)
- [x] GST rate schema fix (`numeric(5,2)`)
- [x] `FOR UPDATE OF vb` fix for payment query
- [x] Master Data and Settings nav icons updated
- [x] Petty Cash — full security, permissions, GL posting
- [x] Bank account number lock on edit
