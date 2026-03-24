# ARIS Diagnostic Centre – Chart of Accounts

> **196 ledger accounts** across 4 levels, covering Balance Sheet and Income Statement.
> Normal balance rule: **Debit** = Assets, Expenses, Contra-Revenue, Drawings | **Credit** = Liabilities, Equity, Revenue

---

## Quick Reference — Normal Balance Rules

| Category | Normal Balance | Increases with | Decreases with |
|----------|---------------|----------------|----------------|
| Assets (1xxx) | **DEBIT** | DR | CR |
| Liabilities (2xxx) | **CREDIT** | CR | DR |
| Equity (3xxx) | **CREDIT** | CR | DR |
| Drawings (3500) | **DEBIT** | DR | CR |
| Revenue (4xxx) | **CREDIT** | CR | DR |
| Contra Revenue (4900) | **DEBIT** | DR | CR |
| Expenses (5xxx) | **DEBIT** | DR | CR |
| Contra Assets (1125, 1291–1295) | **CREDIT** | CR | DR |

---

## 1000 – ASSETS *(Normal Balance: DEBIT)*

### 1100 – Current Assets

#### 1110 – Cash & Bank
| Code | Account Name | Balance |
|------|-------------|---------|
| 1111 | Cash in Hand | DR |
| 1112 | Bank – Primary Current Account | DR |
| 1113 | Bank – Secondary / Savings Account | DR |
| 1114 | Petty Cash – Centre Operations | DR |

#### 1120 – Accounts Receivable
| Code | Account Name | Balance |
|------|-------------|---------|
| 1121 | AR – Self-Pay Patients | DR |
| 1122 | AR – Insurance Companies | DR |
| 1123 | AR – Corporate Clients | DR |
| 1124 | AR – CGHS / Government | DR |
| 1125 | Provision for Doubtful Debts | **CR** *(contra-asset)* |

#### 1130 – Advances & Deposits
| Code | Account Name | Balance |
|------|-------------|---------|
| 1131 | Advance to Suppliers | DR |
| 1132 | Staff Advances & Loans | DR |
| 1133 | Security Deposits Paid | DR |
| 1134 | GST Input Credit (ITC) | DR |

#### 1140 – Prepaid Expenses
| Code | Account Name | Balance |
|------|-------------|---------|
| 1141 | Prepaid Insurance | DR |
| 1142 | Prepaid Rent | DR |
| 1143 | Prepaid AMC / Service Contracts | DR |

#### 1150 – Inventory – Medical Supplies
| Code | Account Name | Balance |
|------|-------------|---------|
| 1151 | Stock – Medical Consumables | DR |
| 1152 | Stock – Contrast Media | DR |
| 1153 | Stock – Film & Digital Media | DR |
| 1154 | Stock – Stationery | DR |
| 1155 | Stock – Drugs & Pharmaceuticals | DR |

---

### 1200 – Fixed Assets
| Code | Account Name | Balance |
|------|-------------|---------|
| 1210 | Medical & Radiology Equipment | DR |
| 1220 | IT Equipment & Computers | DR |
| 1230 | Furniture & Fixtures | DR |
| 1240 | Vehicles | DR |
| 1250 | Leasehold Improvements | DR |
| 1260 | Office Equipment | DR |

#### 1290 – Less: Accumulated Depreciation *(contra-asset, CR balance)*
| Code | Account Name | Balance |
|------|-------------|---------|
| 1291 | Accum. Depr. – Medical Equipment | **CR** |
| 1292 | Accum. Depr. – IT Equipment | **CR** |
| 1293 | Accum. Depr. – Furniture & Fixtures | **CR** |
| 1294 | Accum. Depr. – Vehicles | **CR** |
| 1295 | Accum. Depr. – Leasehold Improvements | **CR** |

---

### 1300 – Intangible Assets
| Code | Account Name | Balance |
|------|-------------|---------|
| 1310 | Software & Licences | DR |
| 1320 | Goodwill | DR |

---

## 2000 – LIABILITIES *(Normal Balance: CREDIT)*

### 2100 – Current Liabilities

#### 2110 – Accounts Payable
| Code | Account Name | Balance | Used For |
|------|-------------|---------|----------|
| 2111 | AP – Medical & Drug Suppliers | CR | Pharma, consumable vendor bills |
| 2112 | AP – Equipment & IT Vendors | CR | Scanner, IT purchase payables |
| 2113 | AP – Service Providers | CR | **Radiologist / teleradiology payables (RAD-BILL-)** |
| 2114 | AP – Utilities (Electricity, Water) | CR | BESCOM, water board bills |

#### 2120 – Tax Payable
| Code | Account Name | Balance |
|------|-------------|---------|
| 2121 | CGST Payable | CR |
| 2122 | SGST Payable | CR |
| 2123 | IGST Payable | CR |
| 2124 | TDS Payable | CR |
| 2124A | TDS Payable – 194J (Professional Fees) | CR |
| 2124B | TDS Payable – 194C (Contractors) | CR |
| 2124C | TDS Payable – 194I (Rent) | CR |
| 2125 | Professional Tax Payable | CR |
| 2126 | Income Tax Payable | CR |

#### 2130 – Payroll Liabilities
| Code | Account Name | Balance |
|------|-------------|---------|
| 2131 | Salaries & Wages Payable | CR |
| 2132 | Provident Fund Payable | CR |
| 2133 | ESI Payable | CR |
| 2134 | Bonus Payable | CR |

#### Other Current Liabilities
| Code | Account Name | Balance | Notes |
|------|-------------|---------|-------|
| 2140 | Patient Advance Deposits | CR | Advances received before services |
| 2150 | Security Deposits Received | CR | |
| 2160 | Accrued Expenses | CR | Expenses incurred but not yet billed |
| 2170 | Deferred Revenue | CR | Health packages sold but not utilised |

---

### 2200 – Long-term Liabilities
| Code | Account Name | Balance |
|------|-------------|---------|
| 2210 | Bank Term Loans | CR |
| 2220 | Equipment Finance / Hire Purchase | CR |
| 2230 | Partner / Director Loans | CR |

---

## 3000 – EQUITY *(Normal Balance: CREDIT)*

| Code | Account Name | Balance |
|------|-------------|---------|
| 3100 | Partners' Capital / Share Capital | CR |
| 3200 | Retained Earnings | CR |
| 3300 | Current Year Profit / (Loss) | CR |
| 3400 | Capital Reserve | CR |
| 3500 | Drawings / Distributions | **DR** *(contra-equity)* |

---

## 4000 – REVENUE *(Normal Balance: CREDIT)*

### 4100 – Radiology Services Revenue
| Code | Account Name |
|------|-------------|
| 4110 | CT Scan Revenue |
| 4120 | MRI Revenue |
| 4130 | Digital X-Ray / DR Revenue |
| 4140 | Ultrasound & Doppler Revenue |
| 4150 | Mammography Revenue |
| 4160 | PET-CT Revenue |
| 4170 | Fluoroscopy & Interventional Revenue |
| 4180 | DEXA / Bone Density Revenue |
| 4190 | Nuclear Medicine Revenue |

### 4200 – Other Medical Revenue
| Code | Account Name |
|------|-------------|
| 4210 | Consultation & Reporting Fees |
| 4220 | Health Package Revenue |
| 4230 | Emergency & After-Hours Surcharge |
| 4240 | Report Delivery & CD Charges |
| 4250 | Tele-Radiology Reading Fees |

### 4300 – Insurance & Corporate Revenue
| Code | Account Name |
|------|-------------|
| 4310 | Insurance Reimbursements – General |
| 4320 | CGHS / ESI Revenue |
| 4330 | Corporate Health Plan Revenue |
| 4340 | TPA Settlements |

### 4400 – Sundry & Other Income
| Code | Account Name |
|------|-------------|
| 4410 | Bank & Investment Interest |
| 4420 | Asset Disposal Gain |
| 4430 | Rental & Subletting Income |
| 4440 | Miscellaneous Income |

### 4900 – Contra Revenue *(Normal Balance: DEBIT — reduces gross revenue)*
| Code | Account Name |
|------|-------------|
| 4910 | Discounts Granted to Patients |
| 4920 | Patient Refunds Issued |
| 4930 | Insurance Writebacks & Adjustments |

---

## 5000 – EXPENSES *(Normal Balance: DEBIT)*

### 5100 – Direct Costs (Cost of Services)

#### 5110 – Medical Consumables Used
| Code | Account Name | Stock Account |
|------|-------------|--------------|
| 5111 | Contrast Media Consumed | ← 1152 |
| 5112 | Syringes, Gloves & Disposables | ← 1151 |
| 5113 | Film & Digital Media Consumed | ← 1153 |
| 5114 | Drugs & Pharmaceuticals Used | ← 1155 |
| 5115 | Other Clinical Materials | ← 1151 |

> **GL at Exam Complete:** DR 5111–5115 / CR 1151–1155

#### 5120 – Outsourced Professional Fees
| Code | Account Name | AP Account |
|------|-------------|-----------|
| 5121 | Radiologist Reading Fees | → 2113 |
| 5122 | Visiting Consultant Fees | → 2113 |
| 5123 | Tele-Radiology Service Costs | → 2113 |

> **GL at Report Complete:** DR 5121/5123 / CR 2113

#### Other Direct Costs
| Code | Account Name |
|------|-------------|
| 5124 | Revenue Share – Facility / Hospital Partner |
| 5125 | Minimum Guarantee – Facility Partner |
| 5131 | Equipment AMC & Service Contracts |
| 5132 | Equipment Repairs (Unplanned) |
| 5133 | Radiation Safety & QA Costs |
| 5134 | Equipment Operating Lease Charges |

---

### 5200 – Staff & Payroll Costs
| Code | Account Name |
|------|-------------|
| 5210 | Salaries – Medical & Technical Staff |
| 5220 | Salaries – Administrative Staff |
| 5230 | Salaries – Support & Housekeeping Staff |
| 5240 | Employer PF & ESI Contributions |
| 5250 | Staff Medical & Insurance Benefits |
| 5260 | Staff Bonus & Incentives |
| 5270 | Staff Training & Development |
| 5280 | Recruitment & Onboarding Costs |

---

### 5300 – Premises & Infrastructure
| Code | Account Name |
|------|-------------|
| 5310 | Rent & Lease Charges |
| 5320 | Electricity & Power |
| 5330 | Water & Sanitation |
| 5340 | Housekeeping & Facility Cleaning |
| 5350 | Security Services |
| 5360 | Facility Maintenance & Repairs |
| 5370 | Medical Waste Disposal |
| 5380 | Generator & UPS Maintenance |

---

### 5400 – Administrative Expenses
| Code | Account Name |
|------|-------------|
| 5410 | Stationery & Office Supplies |
| 5420 | Printing & Documentation |
| 5430 | Postage & Courier |
| 5440 | Telephone & Internet |
| 5450 | Travel & Conveyance |
| 5460 | Vehicle Running & Fuel |
| 5470 | Business Meals & Entertainment |

---

### 5500 – Marketing & Business Development
| Code | Account Name |
|------|-------------|
| 5510 | Advertising & Digital Marketing |
| 5520 | Referral Fees & Commissions |
| 5521 | Patient Acquisition Agent Fees |
| 5522 | Doctor & Clinic Referral Incentives |
| 5530 | Patient Relations & Hospitality |
| 5540 | Branding, Signage & Collateral |
| 5550 | Exhibitions & Healthcare Events |

---

### 5600 – Professional & Compliance
| Code | Account Name | Notes |
|------|-------------|-------|
| 5610 | Legal Fees | |
| 5620 | Audit & Accounting Fees | |
| 5630 | Regulatory & Licensing Fees | AERB, PCPNDT, HPC |
| 5640 | Radiation Safety & Compliance | |
| 5650 | Professional Memberships & Subscriptions | |
| 5660 | Business Insurance Premiums | |

---

### 5700 – IT & Technology
| Code | Account Name |
|------|-------------|
| 5710 | ERP / Software Subscriptions (SaaS) |
| 5720 | PACS / RIS Maintenance |
| 5730 | IT Hardware Maintenance |
| 5740 | Cybersecurity & Data Backup |
| 5750 | IT Consumables & Accessories |

---

### 5800 – Finance Costs
| Code | Account Name |
|------|-------------|
| 5810 | Bank Charges & Transaction Fees |
| 5820 | Loan Interest – Term Loans |
| 5830 | Equipment Finance Interest |
| 5840 | Late Payment Penalties |
| 5850 | Bad Debts Written Off |

---

### 5900 – Depreciation & Amortisation
| Code | Account Name | Contra Asset |
|------|-------------|-------------|
| 5910 | Depreciation – Medical Equipment | → 1291 |
| 5920 | Depreciation – IT Equipment | → 1292 |
| 5930 | Depreciation – Furniture & Fixtures | → 1293 |
| 5940 | Depreciation – Vehicles | → 1294 |
| 5950 | Amortisation – Leasehold Improvements | → 1295 |
| 5960 | Amortisation – Software & Licences | → 1295 |

---

### 5990 – Tax & Miscellaneous Expenses
| Code | Account Name |
|------|-------------|
| 5991 | Income Tax & Advance Tax |
| 5992 | GST Expense (Non-recoverable) |
| 5993 | Donations & CSR Expenses |
| 5994 | Miscellaneous Expenses |
| 5995 | Prior Period Adjustments |

---

## Key Journal Entry Flows

### 1. Patient Billing (Cash / UPI)
```
DR  1112  Bank – Primary Current Account       ₹X
  CR  4110–4190  Radiology Revenue              ₹X
```

### 2. Consumables Issued at Exam Complete
```
DR  5111–5115  Consumables Expense             ₹X
  CR  1151–1155  Stock Account                  ₹X
```

### 3. Reporter Payable at Report Complete
```
DR  5121 / 5123  Radiologist / Tele-rad Fees   ₹X
  CR  2113  AP – Service Providers (RAD-BILL-)  ₹X
```

### 4. Pay Reporter (Settlement)
```
DR  2113  AP – Service Providers               ₹X
  CR  1112  Bank                                ₹X
```

### 5. Purchase Consumables from Supplier
```
DR  1151–1155  Stock Account                   ₹X
  CR  2111  AP – Medical & Drug Suppliers       ₹X
```

### 6. Pay Salary
```
DR  5210–5230  Salary Expense                  ₹X
  CR  2131  Salaries & Wages Payable            ₹X

DR  2131  Salaries & Wages Payable             ₹X
  CR  1112  Bank                                ₹X
```

### 7. GST Collected on Billing
```
DR  1112  Bank                                 ₹X (gross)
  CR  4xxx  Revenue                             ₹X (net)
  CR  2121  CGST Payable                        ₹X
  CR  2122  SGST Payable                        ₹X
```

### 8. Depreciation (Monthly)
```
DR  5910–5960  Depreciation Expense            ₹X
  CR  1291–1295  Accumulated Depreciation       ₹X
```

---

## Account Code Numbering Convention

```
1xxx  →  Assets
  11xx  →  Current Assets
  12xx  →  Fixed Assets
  13xx  →  Intangible Assets

2xxx  →  Liabilities
  21xx  →  Current Liabilities
  22xx  →  Long-term Liabilities

3xxx  →  Equity

4xxx  →  Revenue
  41xx  →  Radiology Services
  42xx  →  Other Medical
  43xx  →  Insurance & Corporate
  44xx  →  Other Income
  49xx  →  Contra Revenue (debit-normal)

5xxx  →  Expenses
  51xx  →  Direct / Cost of Services
  52xx  →  Payroll
  53xx  →  Premises
  54xx  →  Admin
  55xx  →  Marketing
  56xx  →  Professional & Compliance
  57xx  →  IT & Technology
  58xx  →  Finance Costs
  59xx  →  Depreciation & Misc
```

---

*Last updated: 2026-03-20 | Database: aris_erpdb | Table: chart_of_accounts (196 rows)*
