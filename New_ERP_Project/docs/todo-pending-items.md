# Pending Items — Feenixtech Ventures LLP ERP

## 1. Solution Financial Consultancy — Vendor Bills
**Priority: MEDIUM**

Solution Financial Consultancy Services (`VEN-SOLNFIN-001`) charges need to be entered as vendor bills. Total paid across 8 invoices: ₹39,010 (pre-GST).

**Action required:**
- Charges must be **split between the 3 partner companies** before bills are raised
- Each bill should have the correct GST breakdown (18% professional services)
- Bills are recurring monthly — enter per invoice, not as a bulk entry
- Charges are pre-operative expenses (COA 1285) at Feenixtech Corporate level

**Details from Excel:**
| Date | Amount |
|---|---|
| 12-Jun-2025 | ₹9,000 |
| 09-Jul-2025 | ₹9,000 |
| 19-Jul-2025 | ₹750 |
| 20-Aug-2025 | ₹5,900 |
| 07-Nov-2025 | ₹2,500 |
| 02-Jan-2026 | ₹3,540 |
| 28-Jan-2026 | ₹7,140 |
| 03-Mar-2026 | ₹1,180 |
| **Total** | **₹39,010** |

---

## 2. Pending Vendor Invoices — CAPEX Vendors
**Priority: HIGH — create vendor bills when invoices arrive**

| Vendor | Amount Paid | Pending Balance | Notes |
|---|---|---|---|
| Sequoia Healthcare (`VEN-SEQUOIA-001`) | ₹1,01,50,186 | Unknown — partial payments | MRI unit, NS Hospital |
| Numed Systems (`VEN-NUMED-001`) | ₹7,00,000 | Balance pending | RF Cage ongoing work, NS Hospital |
| Mohanan Electrical (`VEN-MOHAN-001`) | ₹3,00,006 | Balance pending | Electrical works, NS Hospital |
| Air Mech (`VEN-AIRMECH-001`) | ₹3,00,000 | Unclear | HVAC, NS Hospital |
| Medingers (`VEN-MEDING-001`) | ₹9,81,080 | Unclear | UPS + Lead Glass + CT service |

When invoices arrive: raise vendor bill with correct GST, separate ITC from asset cost.

---

## 3. Update Vendor GST Details
**Priority: MEDIUM**

| Vendor | Status |
|---|---|
| Sequoia Healthcare | GSTIN not yet updated |
| Mohanan Electrical | GSTIN not yet updated (may not be GST registered) |
| Air Mech | GSTIN not yet updated |
| Medingers | GSTIN not yet updated |

---

## 4. Transfer CWIP to Fixed Assets — NS Hospital
**Priority: HIGH — do when installation is complete**

When MRI and RF Cage installation at NS Hospital is complete:
- Transfer from 1280 CWIP to 1210 Medical & Radiology Equipment
- Update asset status from `INACTIVE` to `ACTIVE` (AST-MED-003, AST-MED-004, AST-ELE-003, AST-ELE-004)
- Run first depreciation from commissioning date

---

## 5. Stock Adjustments — Medical Consumables
**Priority: LOW — defer until quantities confirmed**

Clinical consumables (contrast agents, syringes, etc.) need stock count and price verification before adjustments.

---

## 6. Hostinger — Foreign Vendor Bills
**Priority: LOW**

Hostinger PTE Singapore (`VEN-HSTING-001`) invoices total ₹14,914.95 (domain + email hosting).
- Foreign vendor — **reverse charge IGST** applies
- Raise 3 bills: Domain ₹7,722 + Email ₹3,596 x2
- Mark as paid (Aneesh personal account)

---

## 7. Petty Cash — Separation of Duties
See: [todo-petty-cash-separation-of-duties.md](todo-petty-cash-separation-of-duties.md)

---

## 8. HRMS Module
Build after Finance integration is complete. Partners agreed to implement after current setup is stable.
