import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const token = () => localStorage.getItem('token');

const fmtINR = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtNum = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Today / default date range helpers ────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };

// ── REPORT CATALOGUE ──────────────────────────────────────────────────────────
// techOnly: true  → visible to all roles
// techOnly: false → hidden from TECHNICIAN / LAB_TECHNICIAN
const REPORTS = [
  {
    group: 'Clinical',
    items: [
      { id: 'worklist', label: 'Completed Studies', desc: 'All patients with completed study & report', techOnly: true },
    ],
  },
  {
    group: 'Operations',
    items: [
      { id: 'dashboard',   label: 'Operations Dashboard',  desc: 'Studies, revenue & modality summary',   techOnly: false },
      { id: 'radiology',   label: 'Radiology Report',      desc: 'Radiologist performance & workload',    techOnly: false },
    ],
  },
  {
    group: 'Billing',
    items: [
      { id: 'billing',     label: 'Billing Summary',       desc: 'Collections, pending & payment modes',  techOnly: false },
    ],
  },
  {
    group: 'Finance',
    items: [
      { id: 'pl',          label: 'Profit & Loss',         desc: 'Revenue vs expenses by account',        techOnly: false },
      { id: 'trial',       label: 'Trial Balance',         desc: 'Debit / credit balances by account',    techOnly: false },
      { id: 'balsheet',    label: 'Balance Sheet',         desc: 'Assets, liabilities & equity',          techOnly: false },
      { id: 'ap-aging',    label: 'AP Aging',              desc: 'Outstanding vendor payables',            techOnly: false },
      { id: 'gst',         label: 'GST Reconciliation',    desc: 'GST collected vs input tax credit',      techOnly: false },
    ],
  },
];

// ── Shared UI pieces ───────────────────────────────────────────────────────────
const Card = ({ title, children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
    {title && <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-800">{title}</div>}
    <div className="p-5">{children}</div>
  </div>
);

const Stat = ({ label, value, sub, color = 'teal' }) => {
  const colors = {
    teal:   'text-teal-700',
    green:  'text-emerald-600',
    red:    'text-red-600',
    amber:  'text-amber-600',
    blue:   'text-blue-700',
    gray:   'text-gray-700',
  };
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${colors[color] || colors.teal}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
};

const Table = ({ cols, rows, empty = 'No data' }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-200">
          {cols.map(c => (
            <th key={c.key} className={`px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide ${c.right ? 'text-right' : 'text-left'}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.length === 0 ? (
          <tr><td colSpan={cols.length} className="px-4 py-8 text-center text-gray-400 text-sm">{empty}</td></tr>
        ) : rows.map((row, i) => (
          <tr key={i} className="hover:bg-gray-50">
            {cols.map(c => (
              <td key={c.key} className={`px-4 py-2.5 text-gray-700 ${c.right ? 'text-right tabular-nums' : ''} ${c.bold ? 'font-semibold' : ''} ${c.indent && row._indent ? 'pl-' + (4 + row._indent * 4) : ''}`}>
                {c.fmt ? c.fmt(row[c.key], row) : row[c.key] ?? '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── Report renderers ───────────────────────────────────────────────────────────

// 1. Operations Dashboard
const DashboardReport = ({ data }) => {
  const dd = data?.dashboard_data || {};
  const rev = dd.revenue_stats || {};
  const st  = dd.study_stats   || {};
  const pt  = dd.patient_stats || {};
  const mod = dd.modality_breakdown || [];
  const rad = dd.radiologist_workload || [];
  const trend = dd.monthly_trend || [];

  return (
    <div className="space-y-5">
      {/* Revenue */}
      <Card title="Revenue Summary">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Total Revenue"   value={fmtINR(rev.total_revenue)} color="teal" />
          <Stat label="Collected"       value={fmtINR(rev.paid_amount)}   color="green" />
          <Stat label="Pending"         value={fmtINR(rev.pending_amount)} color="amber" />
          <Stat label="Total Bills"     value={fmtNum(rev.total_bills)}   color="blue" />
          <Stat label="Paid Bills"      value={fmtNum(rev.paid_bills)}    color="green" />
          <Stat label="Pending Bills"   value={fmtNum(rev.pending_bills)} color="amber" />
        </div>
      </Card>

      {/* Studies */}
      <Card title="Study Statistics">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Total Studies"    value={fmtNum(st.total_studies)}       color="teal" />
          <Stat label="Today"            value={fmtNum(st.today_studies)}       color="blue" />
          <Stat label="This Week"        value={fmtNum(st.week_studies)}        color="blue" />
          <Stat label="This Month"       value={fmtNum(st.month_studies)}       color="blue" />
          <Stat label="Completed"        value={fmtNum(st.completed_studies)}   color="green" />
          <Stat label="Pending"          value={fmtNum(st.pending_studies)}     color="amber" />
        </div>
      </Card>

      {/* Patients */}
      {pt.total_patients && (
        <Card title="Patient Statistics">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Total Patients"  value={fmtNum(pt.total_patients)}  color="teal" />
            <Stat label="Today"           value={fmtNum(pt.today_patients)}  color="blue" />
            <Stat label="This Week"       value={fmtNum(pt.week_patients)}   color="blue" />
            <Stat label="This Month"      value={fmtNum(pt.month_patients)}  color="blue" />
            <Stat label="Insured"         value={fmtNum(pt.insured_patients)} color="green" />
            <Stat label="Self-Pay"        value={fmtNum(pt.uninsured_patients)} color="gray" />
          </div>
        </Card>
      )}

      {/* Modality breakdown */}
      {mod.length > 0 && (
        <Card title="Modality Breakdown">
          <Table
            cols={[
              { key: 'modality',     label: 'Modality' },
              { key: 'study_count',  label: 'Studies',  right: true, fmt: v => fmtNum(v) },
              { key: 'revenue',      label: 'Revenue',  right: true, fmt: v => fmtINR(v) },
            ]}
            rows={mod}
          />
        </Card>
      )}

      {/* Radiologist workload */}
      {rad.length > 0 && (
        <Card title="Radiologist Workload (Top 10)">
          <Table
            cols={[
              { key: 'radiologist_name', label: 'Radiologist' },
              { key: 'study_count',       label: 'Total',     right: true, fmt: v => fmtNum(v) },
              { key: 'completed_studies', label: 'Completed', right: true, fmt: v => fmtNum(v) },
              { key: 'pending_studies',   label: 'Pending',   right: true, fmt: v => fmtNum(v) },
              { key: 'total_earnings',    label: 'Earnings',  right: true, fmt: v => fmtINR(v) },
            ]}
            rows={rad}
          />
        </Card>
      )}

      {/* Monthly trend */}
      {trend.length > 0 && (
        <Card title="Monthly Revenue Trend">
          <Table
            cols={[
              { key: 'month',         label: 'Month',         fmt: v => new Date(v).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) },
              { key: 'study_count',   label: 'Studies',       right: true, fmt: v => fmtNum(v) },
              { key: 'patient_count', label: 'Patients',      right: true, fmt: v => fmtNum(v) },
              { key: 'revenue',       label: 'Revenue (₹)',   right: true, fmt: v => fmtINR(v) },
            ]}
            rows={trend}
          />
        </Card>
      )}
    </div>
  );
};

// 2. Radiology Report
const RadiologyReport = ({ data }) => {
  const s = data?.summary || {};
  const rad = data?.top_radiologists || [];
  const mod = data?.modality_breakdown || [];

  return (
    <div className="space-y-5">
      <Card title="Radiologist Summary">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Total Radiologists"  value={fmtNum(s.total_radiologists)}      color="teal" />
          <Stat label="Studies Reported"    value={fmtNum(s.total_studies_reported)}  color="blue" />
          <Stat label="Completed Reports"   value={fmtNum(s.completed_reports)}       color="green" />
          <Stat label="Partial / Review"    value={fmtNum((+s.partial_reports||0) + (+s.review_reports||0))} color="amber" />
          <Stat label="Total Fees"          value={fmtINR(s.total_reporting_amount)}  color="teal" />
          <Stat label="Fees Paid"           value={fmtINR(s.paid_amount)}             color="green" />
        </div>
      </Card>

      {rad.length > 0 && (
        <Card title="Top Radiologists by Studies">
          <Table
            cols={[
              { key: 'radiologist_name', label: 'Radiologist' },
              { key: 'radiologist_code', label: 'Code' },
              { key: 'studies_reported', label: 'Studies',   right: true, fmt: v => fmtNum(v) },
              { key: 'paid_amount',      label: 'Paid (₹)',  right: true, fmt: v => fmtINR(v) },
              { key: 'total_earnings',   label: 'Total Fees (₹)', right: true, fmt: v => fmtINR(v) },
            ]}
            rows={rad}
          />
        </Card>
      )}

      {mod.length > 0 && (
        <Card title="Modality Breakdown">
          <Table
            cols={[
              { key: 'modality',          label: 'Modality' },
              { key: 'studies_reported',  label: 'Studies',  right: true, fmt: v => fmtNum(v) },
              { key: 'radiologists_count',label: 'Radiologists', right: true, fmt: v => fmtNum(v) },
              { key: 'total_earnings',    label: 'Fees (₹)', right: true, fmt: v => fmtINR(v) },
            ]}
            rows={mod}
          />
        </Card>
      )}
    </div>
  );
};

// 3. Billing Summary (uses dashboard revenue data)
const BillingReport = ({ data }) => {
  const rev = data?.dashboard_data?.revenue_stats || {};
  const mod = data?.dashboard_data?.modality_breakdown || [];

  return (
    <div className="space-y-5">
      <Card title="Collection Summary">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Gross Revenue"      value={fmtINR(rev.total_revenue)}  color="teal" />
          <Stat label="Amount Collected"   value={fmtINR(rev.paid_amount)}    color="green" />
          <Stat label="Outstanding"        value={fmtINR(rev.pending_amount)} color="red" />
          <Stat label="Total Invoices"     value={fmtNum(rev.total_bills)}    color="blue" />
          <Stat label="Paid Invoices"      value={fmtNum(rev.paid_bills)}     color="green" />
          <Stat label="Pending Invoices"   value={fmtNum(rev.pending_bills)}  color="amber" />
        </div>
      </Card>
      {mod.length > 0 && (
        <Card title="Revenue by Modality">
          <Table
            cols={[
              { key: 'modality',    label: 'Modality' },
              { key: 'study_count', label: 'Studies', right: true, fmt: v => fmtNum(v) },
              { key: 'revenue',     label: 'Revenue', right: true, fmt: v => fmtINR(v) },
            ]}
            rows={mod}
          />
        </Card>
      )}
    </div>
  );
};

// 4. Profit & Loss
const PLReport = ({ data, dateFrom, dateTo }) => {
  const rows = data?.rows || [];
  const revenue  = rows.filter(r => r.account_category === 'REVENUE');
  const expense  = rows.filter(r => r.account_category === 'EXPENSE');
  const totalRev = revenue.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
  const totalExp = expense.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);

  const cols = [
    { key: 'account_code', label: 'Code' },
    { key: 'account_name', label: 'Account' },
    { key: 'total_debit',  label: 'Debit (₹)',   right: true, fmt: v => fmtINR(v) },
    { key: 'total_credit', label: 'Credit (₹)',  right: true, fmt: v => fmtINR(v) },
    { key: 'net_amount',   label: 'Net (₹)',      right: true, bold: true, fmt: v => fmtINR(Math.abs(v)) },
  ];

  return (
    <div className="space-y-5">
      <Card title={`Profit & Loss  ·  ${fmtDate(dateFrom)} to ${fmtDate(dateTo)}`}>
        <div className="grid grid-cols-3 gap-4 mb-5">
          <Stat label="Total Revenue"  value={fmtINR(totalRev)}              color="green" />
          <Stat label="Total Expenses" value={fmtINR(totalExp)}              color="red" />
          <Stat label="Net Profit"     value={fmtINR(totalRev - totalExp)}  color={totalRev >= totalExp ? 'green' : 'red'} />
        </div>
      </Card>
      <Card title="Revenue Accounts">
        <Table cols={cols} rows={revenue} empty="No revenue accounts" />
      </Card>
      <Card title="Expense Accounts">
        <Table cols={cols} rows={expense} empty="No expense accounts" />
      </Card>
    </div>
  );
};

// 5. Trial Balance
const TrialBalance = ({ data, dateTo }) => {
  const rows = data?.rows || [];
  const totalDr = rows.reduce((s, r) => s + parseFloat(r.period_debit || 0), 0);
  const totalCr = rows.reduce((s, r) => s + parseFloat(r.period_credit || 0), 0);

  return (
    <div className="space-y-5">
      <Card title={`Trial Balance  ·  As of ${fmtDate(dateTo)}`}>
        <div className="grid grid-cols-2 gap-4 mb-2">
          <Stat label="Total Debits"  value={fmtINR(totalDr)} color="blue" />
          <Stat label="Total Credits" value={fmtINR(totalCr)} color="teal" />
        </div>
      </Card>
      <Card>
        <Table
          cols={[
            { key: 'account_code',      label: 'Code' },
            { key: 'account_name',      label: 'Account Name' },
            { key: 'account_category',  label: 'Type' },
            { key: 'opening_balance',   label: 'Opening (₹)',  right: true, fmt: v => fmtINR(v) },
            { key: 'period_debit',      label: 'Debit (₹)',    right: true, fmt: v => fmtINR(v) },
            { key: 'period_credit',     label: 'Credit (₹)',   right: true, fmt: v => fmtINR(v) },
            { key: 'closing_balance',   label: 'Closing (₹)',  right: true, bold: true, fmt: v => fmtINR(Math.abs(v)) },
          ]}
          rows={rows}
          empty="No account data"
        />
      </Card>
    </div>
  );
};

// 6. Balance Sheet
const BalanceSheet = ({ data, dateTo }) => {
  const rows = data?.rows || [];
  const assets      = rows.filter(r => r.account_category === 'ASSET');
  const liabilities = rows.filter(r => r.account_category === 'LIABILITY');
  const equity      = rows.filter(r => r.account_category === 'EQUITY');
  const totalAssets = assets.reduce((s, r) => s + Math.abs(parseFloat(r.balance || 0)), 0);
  const totalLiab   = liabilities.reduce((s, r) => s + Math.abs(parseFloat(r.balance || 0)), 0);
  const totalEquity = equity.reduce((s, r) => s + Math.abs(parseFloat(r.balance || 0)), 0);

  const cols = [
    { key: 'account_code', label: 'Code' },
    { key: 'account_name', label: 'Account' },
    { key: 'total_debit',  label: 'Debit (₹)',  right: true, fmt: v => fmtINR(v) },
    { key: 'total_credit', label: 'Credit (₹)', right: true, fmt: v => fmtINR(v) },
    { key: 'balance',      label: 'Balance (₹)', right: true, bold: true, fmt: v => fmtINR(Math.abs(v)) },
  ];

  return (
    <div className="space-y-5">
      <Card title={`Balance Sheet  ·  As of ${fmtDate(dateTo)}`}>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Total Assets"      value={fmtINR(totalAssets)} color="teal" />
          <Stat label="Total Liabilities" value={fmtINR(totalLiab)}  color="red" />
          <Stat label="Total Equity"      value={fmtINR(totalEquity)} color="blue" />
        </div>
      </Card>
      <Card title="Assets">        <Table cols={cols} rows={assets}      empty="No asset accounts" /></Card>
      <Card title="Liabilities">   <Table cols={cols} rows={liabilities} empty="No liability accounts" /></Card>
      <Card title="Equity">        <Table cols={cols} rows={equity}      empty="No equity accounts" /></Card>
    </div>
  );
};

// 7. AP Aging
const APAging = ({ data }) => {
  const rows  = data?.rows  || [];
  const total = data?.total || {};

  return (
    <div className="space-y-5">
      <Card title={`AP Aging  ·  As of ${fmtDate(data?.as_of)}`}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Current (0–30)"  value={fmtINR(total.current)}   color="green" />
          <Stat label="31–60 days"       value={fmtINR(total.days_31_60)} color="amber" />
          <Stat label="61–90 days"       value={fmtINR(total.days_61_90)} color="orange" />
          <Stat label="90+ days"         value={fmtINR(total.days_90_plus)} color="red" />
          <Stat label="Total Outstanding" value={fmtINR(total.total_outstanding)} color="teal" />
        </div>
      </Card>
      <Card>
        <Table
          cols={[
            { key: 'vendor_name',        label: 'Vendor' },
            { key: 'vendor_code',        label: 'Code' },
            { key: 'current',            label: 'Current (₹)',  right: true, fmt: v => fmtINR(v) },
            { key: 'days_31_60',         label: '31–60 (₹)',    right: true, fmt: v => fmtINR(v) },
            { key: 'days_61_90',         label: '61–90 (₹)',    right: true, fmt: v => fmtINR(v) },
            { key: 'days_90_plus',       label: '90+ (₹)',      right: true, fmt: v => fmtINR(v) },
            { key: 'total_outstanding',  label: 'Total (₹)',    right: true, bold: true, fmt: v => fmtINR(v) },
          ]}
          rows={rows}
          empty="No outstanding payables"
        />
      </Card>
    </div>
  );
};

// 8. GST Reconciliation — Indian Standard Format
const GSTReport = ({ data, dateFrom, dateTo }) => {
  const out          = data?.output        || {};
  const itc          = data?.itc           || {};
  const net          = data?.net           || {};
  const rates        = data?.rate_breakup  || [];
  const monthly      = data?.monthly       || [];
  const itcByVendor  = data?.itc_by_vendor || [];

  return (
    <div className="space-y-5">

      {/* Header */}
      <Card title={`GST Reconciliation Statement  ·  ${fmtDate(dateFrom)} to ${fmtDate(dateTo)}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total Invoices"   value={fmtNum(out.invoice_count)}   color="blue" />
          <Stat label="Gross Revenue"    value={fmtINR(out.gross_value)}     color="gray" />
          <Stat label="Exempt (Healthcare)" value={fmtINR(out.exempt_amount)} color="gray" />
          <Stat label="Total Output GST" value={fmtINR(out.total_output_gst)} color="teal" />
        </div>
        <p className="text-xs text-amber-600 mt-3 bg-amber-50 rounded px-3 py-2">
          Note: Healthcare diagnostic services are GST-exempt under SAC 999311 / 999312. Output GST applies only to taxable supplies (e.g. consumables, equipment rental).
        </p>
      </Card>

      {/* Output Tax Liability */}
      <Card title="Part A — Output Tax Liability (GSTR-1)">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat label="Taxable Amount"   value={fmtINR(out.taxable_amount)}  color="gray" />
          <Stat label="Exempt Amount"    value={fmtINR(out.exempt_amount)}   color="gray" />
          <Stat label="CGST Collected"   value={fmtINR(out.cgst_amount)}     color="teal" />
          <Stat label="SGST Collected"   value={fmtINR(out.sgst_amount)}     color="teal" />
          <Stat label="IGST Collected"   value={fmtINR(out.igst_amount)}     color="teal" />
        </div>
      </Card>

      {/* Rate-wise breakup */}
      {rates.length > 0 && (
        <Card title="Part B — Rate-wise Breakup (HSN Summary)">
          <Table
            cols={[
              { key: 'gst_slab',      label: 'GST Slab' },
              { key: 'invoice_count', label: 'Invoices',       right: true, fmt: v => fmtNum(v) },
              { key: 'taxable_amount',label: 'Taxable (₹)',    right: true, fmt: v => fmtINR(v) },
              { key: 'cgst_amount',   label: 'CGST (₹)',       right: true, fmt: v => fmtINR(v) },
              { key: 'sgst_amount',   label: 'SGST (₹)',       right: true, fmt: v => fmtINR(v) },
              { key: 'igst_amount',   label: 'IGST (₹)',       right: true, fmt: v => fmtINR(v) },
              { key: 'total_gst',     label: 'Total GST (₹)',  right: true, bold: true, fmt: v => fmtINR(v) },
            ]}
            rows={rates}
            empty="No rate data"
          />
        </Card>
      )}

      {/* ITC */}
      <Card title="Part C — Input Tax Credit (ITC) Available">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Vendor Bills"  value={fmtNum(itc.bill_count)} color="blue" />
          <Stat label="CGST ITC"      value={fmtINR(itc.cgst_itc)}  color="blue" />
          <Stat label="SGST ITC"      value={fmtINR(itc.sgst_itc)}  color="blue" />
          <Stat label="IGST ITC"      value={fmtINR(itc.igst_itc)}  color="blue" />
        </div>
        <div className="mb-4 p-3 bg-blue-50 rounded-lg flex justify-between items-center">
          <span className="text-sm font-semibold text-blue-800">Total ITC Available</span>
          <span className="text-lg font-bold text-blue-700">{fmtINR(itc.total_itc)}</span>
        </div>
        {itcByVendor.length > 0 && (
          <Table
            cols={[
              { key: 'vendor_name',    label: 'Vendor' },
              { key: 'bill_count',     label: 'Bills',           right: true, fmt: v => fmtNum(v) },
              { key: 'purchase_value', label: 'Purchase Value',  right: true, fmt: v => fmtINR(v) },
              { key: 'cgst_itc',       label: 'CGST ITC (₹)',    right: true, fmt: v => fmtINR(v) },
              { key: 'sgst_itc',       label: 'SGST ITC (₹)',    right: true, fmt: v => fmtINR(v) },
              { key: 'igst_itc',       label: 'IGST ITC (₹)',    right: true, fmt: v => fmtINR(v) },
              { key: 'total_itc',      label: 'Total ITC (₹)',   right: true, bold: true, fmt: v => fmtINR(v) },
            ]}
            rows={itcByVendor}
            empty="No vendor ITC data"
          />
        )}
      </Card>

      {/* Net Payable */}
      <Card title="Part D — Net GST Payable (Output Tax − ITC)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Tax Head','Output Tax (₹)','ITC Available (₹)','Net Payable (₹)'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ['CGST', out.cgst_amount, itc.cgst_itc, net.cgst],
                ['SGST', out.sgst_amount, itc.sgst_itc, net.sgst],
                ['IGST', out.igst_amount, itc.igst_itc, net.igst],
              ].map(([head, output_tax, itc_amt, net_amt]) => (
                <tr key={head} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-700">{head}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtINR(output_tax)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-blue-600">{fmtINR(itc_amt)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${parseFloat(net_amt) > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmtINR(Math.abs(net_amt))}{parseFloat(net_amt) < 0 ? ' (Credit)' : ''}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 border-t-2 border-gray-300">
                <td className="px-4 py-2.5 font-bold text-gray-900">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-900">{fmtINR(out.total_output_gst)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-blue-700">{fmtINR(itc.total_itc)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-bold text-lg ${parseFloat(net.total) > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmtINR(Math.abs(net.total))}{parseFloat(net.total) < 0 ? ' (Credit)' : ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">* Negative net = excess ITC carried forward. Positive = tax payable to government.</p>
      </Card>

      {/* Monthly trend */}
      {monthly.length > 0 && (
        <Card title="Part E — Monthly GST Summary">
          <Table
            cols={[
              { key: 'month',     label: 'Month' },
              { key: 'invoices',  label: 'Invoices',      right: true, fmt: v => fmtNum(v) },
              { key: 'taxable',   label: 'Taxable (₹)',   right: true, fmt: v => fmtINR(v) },
              { key: 'cgst',      label: 'CGST (₹)',      right: true, fmt: v => fmtINR(v) },
              { key: 'sgst',      label: 'SGST (₹)',      right: true, fmt: v => fmtINR(v) },
              { key: 'igst',      label: 'IGST (₹)',      right: true, fmt: v => fmtINR(v) },
              { key: 'total_gst', label: 'Total GST (₹)', right: true, bold: true, fmt: v => fmtINR(v) },
            ]}
            rows={monthly}
            empty="No monthly data"
          />
        </Card>
      )}
    </div>
  );
};

// 9. Completed Studies Worklist
const WorklistReport = ({ data }) => {
  const rows  = data?.rows  || [];
  const total = data?.total_amount || 0;

  const calcAge = dob => {
    if (!dob) return '—';
    return `${new Date().getFullYear() - new Date(dob).getFullYear()} yrs`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Completed Studies" value={fmtNum(data?.total_studies)} color="teal" />
        <Stat label="Total Bill Amount" value={fmtINR(total)}               color="green" />
        <Stat label="Period"            value={`${fmtDate(data?.date_from)} – ${fmtDate(data?.date_to)}`} color="gray" />
      </div>
      <Card>
        <Table
          cols={[
            { key: 'study_date',   label: 'Date',         fmt: v => fmtDate(v) },
            { key: 'patient_name', label: 'Patient Name', bold: true },
            { key: 'pid',          label: 'PID' },
            { key: 'age',          label: 'Age',          fmt: (v, row) => v != null ? `${v} yrs` : calcAge(row.date_of_birth) },
            { key: 'study_name',   label: 'Study' },
            { key: 'bill_amount',  label: 'Bill Amount',  right: true, bold: true, fmt: v => fmtINR(v) },
          ]}
          rows={rows}
          empty="No completed studies for the selected period"
        />
        {rows.length > 0 && (
          <div className="flex justify-end pt-3 border-t border-gray-100 mt-2">
            <div className="text-sm font-bold text-teal-700">
              Total: {fmtINR(total)}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

// ── Main Reports Page ──────────────────────────────────────────────────────────
const getUserRole = () => {
  try { return (JSON.parse(localStorage.getItem('user')) || {}).role || ''; } catch { return ''; }
};

const TECH_ROLES = ['TECHNICIAN', 'LAB_TECHNICIAN'];

const visibleReports = (role) => {
  const isTech = TECH_ROLES.includes(role);
  return REPORTS.map(g => ({
    ...g,
    items: g.items.filter(i => !isTech || i.techOnly),
  })).filter(g => g.items.length > 0);
};

export default function Reports() {
  const userRole = getUserRole();
  const isTech   = TECH_ROLES.includes(userRole);
  const reports  = visibleReports(userRole);

  const [selected,  setSelected]  = useState(isTech ? 'worklist' : 'dashboard');
  const [dateFrom,  setDateFrom]  = useState(isTech ? today() : daysAgo(30));
  const [dateTo,    setDateTo]    = useState(today());
  const [centerId,  setCenterId]  = useState('');
  const [centers,   setCenters]   = useState([]);
  const [data,      setData]      = useState({});
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  // Load centers once
  useEffect(() => {
    fetch('/api/centers', { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setCenters(Array.isArray(d) ? d : (d.centers || d.data || [])))
      .catch(() => {});
  }, []);

  // Fetch logic per report type
  const fetchReport = useCallback(async (id, from, to, cid) => {
    setLoading(true);
    setError('');
    const T = token();
    const H = { Authorization: `Bearer ${T}` };
    const cq = cid ? `&center_id=${cid}` : '';
    try {
      let url;
      const period = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000));
      if (id === 'worklist') {
        url = `/api/reports/worklist?date_from=${from}&date_to=${to}${cq}`;
      } else if (id === 'dashboard' || id === 'billing') {
        url = `/api/dashboard-reports/dashboard?date_from=${from}&date_to=${to}&period=${period}${cq}`;
      } else if (id === 'radiology') {
        url = `/api/radiology-reporting/dashboard?period=${period}${cq}`;
      } else if (id === 'pl') {
        url = `/api/finance/reports/profit-loss?from=${from}&to=${to}${cq}`;
      } else if (id === 'trial') {
        url = `/api/finance/reports/trial-balance?from=${from}&to=${to}${cq}`;
      } else if (id === 'balsheet') {
        url = `/api/finance/reports/balance-sheet?as_of=${to}${cq}`;
      } else if (id === 'ap-aging') {
        url = `/api/finance/reports/ap-aging?as_of=${to}${cq}`;
      } else if (id === 'gst') {
        url = `/api/finance/reports/gst-reconciliation?from=${from}&to=${to}${cq}`;
      }
      const r = await fetch(url, { headers: H });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Failed to load report'); return; }
      setData(prev => ({ ...prev, [id]: d }));
    } catch { setError('Network error. Please try again.'); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { fetchReport(selected, dateFrom, dateTo, centerId); }, [selected, dateFrom, dateTo, centerId, fetchReport]);

  const [exportFormat, setExportFormat] = useState('pdf');

  // Build { headers, sections: [{ title, rows }] } for current report
  const buildExportData = useCallback(() => {
    const d = data[selected];
    if (!d) return null;
    const label = REPORTS.flatMap(g => g.items).find(i => i.id === selected)?.label || selected;
    const centerName = centerId ? (centers.find(c => String(c.id) === String(centerId))?.name || '') : 'All Centers';
    const subtitle = `Period: ${dateFrom} to ${dateTo}  |  Center: ${centerName}`;

    if (selected === 'worklist') {
      const calcAgeExport = (dob) => {
        if (!dob) return '—';
        return `${new Date().getFullYear() - new Date(dob).getFullYear()} yrs`;
      };
      return { label, subtitle, sections: [{
        title: 'Completed Studies',
        headers: ['Date', 'Patient Name', 'PID', 'Age', 'Study', 'Bill Amount (INR)'],
        rows: (d?.rows || []).map(r => [
          r.study_date ? new Date(r.study_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
          r.patient_name,
          r.pid,
          r.age != null ? `${r.age} yrs` : calcAgeExport(r.date_of_birth),
          r.study_name,
          parseFloat(r.bill_amount || 0),
        ]).concat([['', '', '', '', 'TOTAL', d?.total_amount || 0]]),
      }]};
    }

    if (selected === 'dashboard' || selected === 'billing') {
      const rev = d?.dashboard_data?.revenue_stats || {};
      const mod = d?.dashboard_data?.modality_breakdown || [];
      const sections = [
        {
          title: 'Revenue Summary',
          headers: ['Metric', 'Value (INR)'],
          rows: [
            ['Total Revenue',    rev.total_revenue  || 0],
            ['Amount Collected', rev.paid_amount    || 0],
            ['Outstanding',      rev.pending_amount || 0],
            ['Total Invoices',   rev.total_bills    || 0],
            ['Paid Invoices',    rev.paid_bills     || 0],
            ['Pending Invoices', rev.pending_bills  || 0],
          ],
        },
      ];
      if (mod.length) sections.push({
        title: 'Modality Breakdown',
        headers: ['Modality', 'Studies', 'Revenue (INR)'],
        rows: mod.map(r => [r.modality, r.study_count, r.revenue]),
      });
      return { label, subtitle, sections };
    }

    if (selected === 'radiology') {
      return { label, subtitle, sections: [{
        title: 'Radiologist Performance',
        headers: ['Radiologist', 'Code', 'Studies Reported', 'Paid (INR)', 'Total Fees (INR)'],
        rows: (d?.top_radiologists || []).map(r => [
          r.radiologist_name, r.radiologist_code, r.studies_reported, r.paid_amount, r.total_earnings,
        ]),
      }]};
    }

    if (selected === 'pl') {
      const rows = d?.rows || [];
      return { label, subtitle, sections: [
        {
          title: 'Revenue Accounts',
          headers: ['Code', 'Account Name', 'Type', 'Debit (INR)', 'Credit (INR)', 'Net (INR)'],
          rows: rows.filter(r => r.account_category === 'REVENUE').map(r => [
            r.account_code, r.account_name, r.account_category, r.total_debit, r.total_credit, r.net_amount,
          ]),
        },
        {
          title: 'Expense Accounts',
          headers: ['Code', 'Account Name', 'Type', 'Debit (INR)', 'Credit (INR)', 'Net (INR)'],
          rows: rows.filter(r => r.account_category === 'EXPENSE').map(r => [
            r.account_code, r.account_name, r.account_category, r.total_debit, r.total_credit, r.net_amount,
          ]),
        },
      ]};
    }

    if (selected === 'trial') {
      return { label, subtitle, sections: [{
        title: 'Trial Balance',
        headers: ['Code', 'Account Name', 'Type', 'Opening (INR)', 'Debit (INR)', 'Credit (INR)', 'Closing (INR)'],
        rows: (d?.rows || []).map(r => [
          r.account_code, r.account_name, r.account_category,
          r.opening_balance, r.period_debit, r.period_credit, r.closing_balance,
        ]),
      }]};
    }

    if (selected === 'balsheet') {
      const rows = d?.rows || [];
      const mkSection = (title, cat) => ({
        title,
        headers: ['Code', 'Account Name', 'Debit (INR)', 'Credit (INR)', 'Balance (INR)'],
        rows: rows.filter(r => r.account_category === cat).map(r => [
          r.account_code, r.account_name, r.total_debit, r.total_credit, r.balance,
        ]),
      });
      return { label, subtitle, sections: [mkSection('Assets','ASSET'), mkSection('Liabilities','LIABILITY'), mkSection('Equity','EQUITY')] };
    }

    if (selected === 'ap-aging') {
      const t = d?.total || {};
      const rows = (d?.rows || []).map(r => [
        r.vendor_name, r.vendor_code, r.current, r.days_31_60, r.days_61_90, r.days_90_plus, r.total_outstanding,
      ]);
      rows.push(['TOTAL', '', t.current, t.days_31_60, t.days_61_90, t.days_90_plus, t.total_outstanding]);
      return { label, subtitle, sections: [{
        title: 'AP Aging',
        headers: ['Vendor', 'Code', 'Current (INR)', '31-60 (INR)', '61-90 (INR)', '90+ (INR)', 'Total Outstanding (INR)'],
        rows,
      }]};
    }

    if (selected === 'gst') {
      const out = d?.output || {};
      const itc = d?.itc    || {};
      const net = d?.net    || {};
      return { label, subtitle, sections: [
        {
          title: 'Part A — Output Tax Liability',
          headers: ['Metric', 'Value (INR)'],
          rows: [
            ['Invoices',         out.invoice_count     || 0],
            ['Taxable Amount',   out.taxable_amount    || 0],
            ['Exempt / Nil',     (parseFloat(out.exempt_amount||0)+parseFloat(out.zero_rated_amount||0)).toFixed(2)],
            ['CGST Collected',   out.cgst_amount       || 0],
            ['SGST Collected',   out.sgst_amount       || 0],
            ['IGST Collected',   out.igst_amount       || 0],
            ['Cess',             out.cess_amount       || 0],
            ['Total Output GST', out.total_output_gst  || 0],
          ],
        },
        {
          title: 'Part B — Rate-wise Breakup',
          headers: ['GST Slab', 'Invoices', 'Taxable (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Total GST (INR)'],
          rows: (d?.rate_breakup || []).map(r => [
            r.gst_slab, r.invoice_count, r.taxable_amount, r.cgst_amount, r.sgst_amount, r.igst_amount, r.total_gst,
          ]),
        },
        {
          title: 'Part C — Input Tax Credit',
          headers: ['Metric', 'Value (INR)'],
          rows: [
            ['Vendor Bills',  itc.bill_count  || 0],
            ['CGST ITC',      itc.cgst_itc    || 0],
            ['SGST ITC',      itc.sgst_itc    || 0],
            ['IGST ITC',      itc.igst_itc    || 0],
            ['Total ITC',     itc.total_itc   || 0],
          ],
        },
        {
          title: 'Part D — Net GST Payable',
          headers: ['Tax Head', 'Output Tax (INR)', 'ITC (INR)', 'Net Payable (INR)'],
          rows: [
            ['CGST', out.cgst_amount, itc.cgst_itc, net.cgst],
            ['SGST', out.sgst_amount, itc.sgst_itc, net.sgst],
            ['IGST', out.igst_amount, itc.igst_itc, net.igst],
            ['Total', out.total_output_gst, itc.total_itc, net.total],
          ],
        },
        {
          title: 'Part E — Monthly Summary',
          headers: ['Month', 'Invoices', 'Taxable (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Total GST (INR)'],
          rows: (d?.monthly || []).map(r => [r.month, r.invoices, r.taxable, r.cgst, r.sgst, r.igst, r.total_gst]),
        },
      ]};
    }

    return null;
  }, [data, selected, dateFrom, dateTo]);

  const exportReport = useCallback(async (format, printMode = false) => {

    const ed = buildExportData();
    if (!ed) return;
    const filename = `${ed.label.replace(/\s+/g,'_')}_${dateFrom}_${dateTo}`;

    if (format === 'csv') {
      const escape = (v) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s; };
      const parts = ed.sections.map(sec => {
        const lines = [`# ${sec.title}`, sec.headers.map(escape).join(',')];
        sec.rows.forEach(r => lines.push(r.map(escape).join(',')));
        return lines.join('\n');
      });
      const blob = new Blob([parts.join('\n\n')], { type: 'text/csv' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename + '.csv' });
      a.click(); URL.revokeObjectURL(a.href);
    }

    if (format === 'excel') {
      const wb = XLSX.utils.book_new();
      ed.sections.forEach((sec, idx) => {
        const ws = XLSX.utils.aoa_to_sheet([sec.headers, ...sec.rows]);
        // Bold header row styling
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
          if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: '0F766E' } } };
        }
        // Auto column widths
        ws['!cols'] = sec.headers.map((h, ci) => ({
          wch: Math.max(h.length, ...sec.rows.map(r => String(r[ci] ?? '').length), 10),
        }));
        const sheetName = sec.title.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName + (idx > 0 && ed.sections.length > 1 ? '' : ''));
      });
      XLSX.writeFile(wb, filename + '.xlsx');
    }

    if (format === 'pdf') {
      // ── Fetch company info ──────────────────────────────────────────────────
      let co = {};
      let logoDataUrl = null;
      try {
        const res = await fetch('/api/settings/company', {
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (res.ok) {
          const json = await res.json();
          co = json.company || {};
        }
      } catch { /* proceed without company info */ }

      // Convert logo to base64 if available
      if (co.logo_path) {
        try {
          const imgRes = await fetch(co.logo_path);
          const blob   = await imgRes.blob();
          logoDataUrl  = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch { logoDataUrl = null; }
      }

      // ── Build PDF ───────────────────────────────────────────────────────────
      const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();   // 297 mm
      const MARGIN = 14;
      const TEAL   = [15, 118, 110];
      const TEAL_LIGHT = [240, 253, 250];

      // Helper: draw compact letterhead (header only — ~22 mm total)
      const drawLetterhead = () => {
        const LOGO_MAX_W = 36, LOGO_MAX_H = 14;
        const LOGO_X = MARGIN, LOGO_Y = 5;
        const rightX  = pageW - MARGIN;
        const midY    = LOGO_Y + LOGO_MAX_H / 2; // vertical centre of logo zone

        // Top teal accent bar
        doc.setFillColor(...TEAL);
        doc.rect(0, 0, pageW, 1.5, 'F');

        // Logo (left) — aspect-ratio safe
        if (logoDataUrl) {
          try {
            const props = doc.getImageProperties(logoDataUrl);
            const scale = Math.min(LOGO_MAX_W / (props.width || 200), LOGO_MAX_H / (props.height || 80));
            doc.addImage(logoDataUrl, LOGO_X, LOGO_Y, (props.width || 200) * scale, (props.height || 80) * scale, '', 'FAST');
          } catch { /* skip */ }
        }

        // Company name + tagline (top right, vertically centred)
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...TEAL);
        doc.text(co.company_name || 'ARIS Healthcare', rightX, midY - 1, { align: 'right' });

        if (co.tagline) {
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(110, 110, 110);
          doc.text(co.tagline, rightX, midY + 4, { align: 'right' });
        }

        // Teal divider
        const divY = LOGO_Y + LOGO_MAX_H + 3;
        doc.setDrawColor(...TEAL);
        doc.setLineWidth(0.4);
        doc.line(MARGIN, divY, pageW - MARGIN, divY);

        return divY + 5;
      };

      // Helper: draw footer with full company details on every page
      const drawFooter = (pageH) => {
        const footerY = pageH - 12;
        doc.setDrawColor(...TEAL);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, footerY - 2, pageW - MARGIN, footerY - 2);

        // Address + contacts in one line (or two if long)
        const addr = [
          co.address_line1,
          co.address_line2,
          [co.city, co.state, co.pincode].filter(Boolean).join(', '),
        ].filter(Boolean).join(', ');

        const contacts = [
          co.phone   && `Ph: ${co.phone}`,
          co.email   && `Email: ${co.email}`,
          co.website && co.website,
        ].filter(Boolean).join('  |  ');

        const regInfo = [
          co.gstin && `GSTIN: ${co.gstin}`,
          co.cin   && `CIN: ${co.cin}`,
          co.pan_number && `PAN: ${co.pan_number}`,
        ].filter(Boolean).join('  |  ');

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');

        doc.setTextColor(70, 70, 70);
        if (addr) doc.text(addr, pageW / 2, footerY + 2, { align: 'center' });
        if (contacts) doc.text(contacts, pageW / 2, footerY + 6, { align: 'center' });

        if (regInfo) {
          doc.setTextColor(120, 120, 120);
          doc.text(regInfo, pageW / 2, footerY + 10, { align: 'center' });
        }
      };

      let startY = drawLetterhead();

      // ── Report title & date range ────────────────────────────────────────
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(ed.label, MARGIN, startY);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(ed.subtitle, MARGIN, startY + 5);
      startY += 11;

      // ── Sections ─────────────────────────────────────────────────────────
      const pageH = doc.internal.pageSize.getHeight();
      ed.sections.forEach((sec) => {
        if (startY > pageH - 30) {
          doc.addPage();
          startY = drawLetterhead();
        }
        // Section title
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...TEAL);
        doc.text(sec.title, MARGIN, startY);
        startY += 4;

        autoTable(doc, {
          startY,
          head: [sec.headers],
          body: sec.rows.map(r => r.map(v => v ?? '')),
          styles:            { fontSize: 8, cellPadding: 2.5, font: 'helvetica' },
          headStyles:        { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
          alternateRowStyles:{ fillColor: TEAL_LIGHT },
          tableWidth: pageW - MARGIN * 2,
          margin: { left: MARGIN, right: MARGIN },
          // Re-draw letterhead on each new page created by autoTable
          didAddPage: () => { drawLetterhead(); },
        });

        startY = doc.lastAutoTable.finalY + 10;
      });

      // ── Footer on every page ─────────────────────────────────────────────
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawFooter(pageH);
        // Page number (bottom-right, above footer block)
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(160);
        doc.text(
          `Page ${p} of ${totalPages}  ·  ${new Date().toLocaleDateString('en-IN')}`,
          pageW - MARGIN, pageH - 14, { align: 'right' }
        );
      }

      if (printMode) {
        doc.autoPrint();
        const blobUrl = doc.output('bloburl');
        window.open(blobUrl, '_blank');
      } else {
        doc.save(filename + '.pdf');
      }
    }
  }, [buildExportData, dateFrom, dateTo]);

  const renderReport = () => {
    const d = data[selected];
    if (!d) return null;
    switch (selected) {
      case 'worklist':  return <WorklistReport  data={d} />;
      case 'dashboard': return <DashboardReport data={d} />;
      case 'billing':   return <BillingReport   data={d} />;
      case 'radiology': return <RadiologyReport data={d} />;
      case 'pl':        return <PLReport        data={d} dateFrom={dateFrom} dateTo={dateTo} />;
      case 'trial':     return <TrialBalance    data={d} dateTo={dateTo} />;
      case 'balsheet':  return <BalanceSheet    data={d} dateTo={dateTo} />;
      case 'ap-aging':  return <APAging         data={d} />;
      case 'gst':       return <GSTReport       data={d} dateFrom={dateFrom} dateTo={dateTo} />;
      default:          return null;
    }
  };

  const currentItem = reports.flatMap(g => g.items).find(i => i.id === selected);

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 py-4 hidden md:block">
        <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Reports</p>
        {reports.map(group => (
          <div key={group.group} className="mb-3">
            <p className="px-4 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.group}</p>
            {group.items.map(item => (
              <button
                key={item.id}
                onClick={() => setSelected(item.id)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  selected === item.id
                    ? 'bg-teal-50 text-teal-700 font-medium border-r-2 border-teal-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 p-6 space-y-5 overflow-x-hidden">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{currentItem?.label}</h1>
            <p className="text-sm text-gray-500">{currentItem?.desc}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Format selector */}
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
              {[['csv','CSV'],['excel','Excel'],['pdf','PDF']].map(([fmt, label]) => (
                <button
                  key={fmt}
                  onClick={() => setExportFormat(fmt)}
                  className={`px-3 py-2 font-medium transition-colors ${
                    exportFormat === fmt
                      ? 'bg-teal-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  } border-r border-gray-300 last:border-r-0`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Export button */}
            <button
              onClick={() => exportReport(exportFormat)}
              disabled={!data[selected]}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 text-gray-700 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              Export
            </button>
            {/* Print button */}
            <button
              onClick={() => exportReport('pdf', true)}
              disabled={!data[selected]}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 text-gray-700 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
              </svg>
              Print
            </button>
            <button
              onClick={() => fetchReport(selected, dateFrom, dateTo, centerId)}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Mobile report selector */}
        <div className="md:hidden">
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {reports.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
          {/* Center */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Center</label>
            <select
              value={centerId}
              onChange={e => setCenterId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[160px]"
            >
              <option value="">All Centers</option>
              {centers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {/* Date range */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input type="date" value={dateFrom} max={dateTo}
              onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input type="date" value={dateTo} min={dateFrom}
              onChange={e => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          {/* Quick range */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setDateFrom(today()); setDateTo(today()); }}
              className={`px-3 py-2 text-xs font-medium border rounded-lg transition-colors ${
                dateFrom === today() && dateTo === today()
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'border-gray-200 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 text-gray-600'
              }`}
            >Today</button>
            {[['7d','7 Days',7],['30d','30 Days',30],['90d','90 Days',90],['1y','1 Year',365]].map(([key,label,days]) => (
              <button key={key}
                onClick={() => { setDateFrom(daysAgo(days)); setDateTo(today()); }}
                className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 text-gray-600 transition-colors"
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-600 border-t-transparent" />
            <span className="ml-3 text-sm text-gray-500">Generating report…</span>
          </div>
        )}

        {/* Report output */}
        {!loading && renderReport()}
      </main>
    </div>
  );
}
