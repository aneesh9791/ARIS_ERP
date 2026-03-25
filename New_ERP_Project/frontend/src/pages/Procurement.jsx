import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import VendorModal from '../components/VendorModal';
import { today } from '../utils/serverDate';

import { getPermissions } from '../utils/permissions';
const token = () => localStorage.getItem('token');
const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (res.status === 401) {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    window.location.href = '/login';
  }
  return res;
};
const currentUser = () => { try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; } };
const fmt  = n => `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Status config ─────────────────────────────────────────────────────────────
const PR_STATUS = {
  DRAFT:       { label: 'Draft',        bg: '#f1f5f9', color: '#475569' },
  SUBMITTED:   { label: 'Pending L1',   bg: '#fef3c7', color: '#92400e' },
  L1_APPROVED: { label: 'Pending L2',   bg: '#e0f2fe', color: '#075985' },
  APPROVED:    { label: 'Approved',     bg: '#dcfce7', color: '#166534' },
  PO_PENDING:  { label: 'PO In Approval', bg: '#fef9c3', color: '#854d0e' },
  PO_CREATED:  { label: 'PO Created',   bg: '#eff6ff', color: '#1d4ed8' },
  REJECTED:    { label: 'Rejected',     bg: '#fee2e2', color: '#991b1b' },
  CANCELLED:   { label: 'Cancelled',    bg: '#f1f5f9', color: '#94a3b8' },
};
const PO_STATUS = {
  DRAFT:            { label: 'Draft',            bg: '#f1f5f9', color: '#475569' },
  PENDING_APPROVAL: { label: 'Pending Approval', bg: '#fef3c7', color: '#92400e' },
  ISSUED:           { label: 'Issued',           bg: '#dbeafe', color: '#1e40af' },
  ACKNOWLEDGED:     { label: 'Acknowledged',     bg: '#e0f2fe', color: '#075985' },
  COMPLETED:    { label: 'Completed',    bg: '#dcfce7', color: '#166534' },
  CANCELLED:    { label: 'Cancelled',    bg: '#fee2e2', color: '#991b1b' },
};
const PO_TRANSITIONS = {
  APPROVED:     ['ACKNOWLEDGED', 'CANCELLED'],
  ISSUED:       ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['COMPLETED',    'CANCELLED'],
};
const PRIORITY = {
  LOW:    { label: 'Low',    color: '#64748b' },
  NORMAL: { label: 'Normal', color: '#0d9488' },
  HIGH:   { label: 'High',   color: '#d97706' },
  URGENT: { label: 'Urgent', color: '#dc2626' },
};

const Badge = ({ cfg, text }) => {
  const s = cfg || { bg: '#f1f5f9', color: '#475569', label: text };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold select-none whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}>{s.label || text}</span>
  );
};

// ── Print PO ─────────────────────────────────────────────────────────────────
// Compare vendor GSTIN state code vs center state code to determine GST type
// centerStateCode comes from centers.state_code (e.g. '32' for Kerala)
const gstType = (vendorGstin, centerStateCode = '32') => {
  const vendorCode = (vendorGstin || '').replace(/\s/g, '').substring(0, 2);
  if (!vendorCode || vendorCode.length < 2 || !/^\d{2}$/.test(vendorCode)) return 'IGST';
  return vendorCode === (centerStateCode || '32') ? 'CGST_SGST' : 'IGST';
};

const printPO = async (po, items) => {
  // Fetch live company settings from API
  let co = {};
  try {
    const r = await fetch('/api/settings/company', { headers: { Authorization: `Bearer ${token()}` } });
    const d = await r.json();
    co = d.company || {};
  } catch { /* fallback to localStorage */ }
  // Fallback to localStorage if API fails
  if (!co.company_name) {
    try { co = { ...co, ...JSON.parse(localStorage.getItem('companyInfo') || '{}') }; } catch { /* ignore */ }
  }

  // Logo — prefer localStorage base64 (always fresh from logo upload)
  const lgc = (() => { try { return JSON.parse(localStorage.getItem('logoConfig')) || {}; } catch { return {}; } })();
  const logoSrc = lgc.customLogo || co.logo_path || null;

  // Company identity fields
  const coName    = co.company_name || 'ARIS Healthcare';
  const coAddr    = [co.address_line1, co.address_line2].filter(Boolean).join(', ');
  const coCityLine = [co.city, co.state, co.pincode].filter(Boolean).join(', ');
  const coTaxLine = [
    co.gstin  ? `GSTIN: ${co.gstin}`   : '',
    co.pan_number ? `PAN: ${co.pan_number}` : '',
    co.tan    ? `TAN: ${co.tan}`        : '',
  ].filter(Boolean).join('  |  ');
  const coContact = [co.phone ? `Ph: ${co.phone}` : '', co.email || ''].filter(Boolean).join('  |  ');

  // PO header / footer / T&C from settings (Settings → Purchase Order Print Settings)
  const billHeader = co.po_header_text || '';
  const billFooter = co.po_footer_text || 'This is a computer generated document.';
  const termsText  = co.po_terms_conditions || po.terms_conditions || 'Goods to be supplied as per specifications. Subject to quality inspection on receipt.';

  // Delivery = center address from PO (from centers JOIN)
  const delAddr = [po.center_address, po.center_city, po.center_state, po.center_postal_code].filter(Boolean).join(', ');

  const isDraft = po.status === 'DRAFT';
  const AC = '#1e40af';

  const w = window.open('', '_blank');
  const html = `<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <title>Purchase Order — ${po.po_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;font-size:12px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    .page{width:210mm;min-height:297mm;margin:0 auto;padding:0 0 24mm;position:relative}

    /* Draft watermark */
    ${isDraft ? `.page::before{content:"DRAFT";position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:110px;font-weight:900;color:rgba(100,116,139,.07);z-index:0;pointer-events:none;letter-spacing:12px}` : ''}

    /* ── PO Header band ── */
    .bill-hdr-band{background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 60%,#2563eb 100%);color:#fff;text-align:center;padding:7px 14mm;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;border-bottom:3px solid #1d4ed8}
    .bill-hdr-band span{opacity:.7;margin:0 8px;font-weight:300}


    /* ── Main header ── */
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:10px 14mm 10px;border-bottom:3px solid ${AC}}
    .hdr-left{display:flex;align-items:center;gap:12px}
    .co-info{display:flex;flex-direction:column;gap:2px}
    .co-name{font-size:16px;font-weight:800;color:#1e293b;line-height:1.2}
    .co-line{font-size:9px;color:#64748b;line-height:1.5}
    .co-tax{font-size:9px;color:#475569;font-weight:600}
    .hdr-right{text-align:right;flex-shrink:0}
    .po-label{font-size:26px;font-weight:900;color:${AC};letter-spacing:-1px;line-height:1}
    .po-meta{margin-top:6px;font-size:10px;line-height:1.9;color:#475569}
    .po-meta b{color:#1e293b}
    .badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:9px;font-weight:700;letter-spacing:.04em}
    .badge-draft{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
    .badge-issued{background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe}
    .badge-approved{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
    .badge-other{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0}

    /* ── Body padding ── */
    .body{padding:0 14mm}

    /* Info bar */
    .info-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
    .info-cell{background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;padding:6px 10px}
    .info-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:2px}
    .info-val{font-size:10px;font-weight:600;color:#1e293b}

    /* Address boxes */
    .addr-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
    .addr-box{border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
    .addr-box-hdr{padding:5px 10px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#fff;background:${AC}}
    .addr-box-body{padding:8px 10px;font-size:10px;line-height:1.7;color:#334155}
    .addr-box-body b{font-size:11px;color:#1e293b;display:block;margin-bottom:1px}
    .addr-box-body .muted{font-size:9.5px;color:#64748b;display:block}

    /* Items table */
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    thead tr{background:${AC}}
    th{padding:7px 9px;text-align:left;font-size:9.5px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
    th.r,td.r{text-align:right}
    th.c,td.c{text-align:center}
    tbody tr:nth-child(even){background:#f8fafc}
    td{padding:7px 9px;font-size:10.5px;color:#334155;border-bottom:1px solid #f1f5f9}
    td.iname{font-weight:600;color:#1e293b}
    td.idesc{font-size:9px;color:#64748b;margin-top:1px}

    /* Totals */
    .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:14px}
    .totals{width:230px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
    .tot-row{display:flex;justify-content:space-between;padding:5px 11px;font-size:10.5px;border-bottom:1px solid #f1f5f9;color:#475569}
    .grand{display:flex;justify-content:space-between;padding:7px 11px;background:${AC};color:#fff;font-size:13px;font-weight:800}

    /* Notes */
    .notes-box{background:#fffbeb;border:1px solid #fde68a;border-radius:5px;padding:7px 11px;margin-bottom:12px;font-size:10px;color:#92400e}

    /* Terms */
    .terms-box{border-top:1px solid #e2e8f0;padding-top:8px;margin-bottom:18px;font-size:9px;color:#94a3b8;line-height:1.6}
    .terms-box b{color:#64748b}

    /* Signatures */
    .sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-bottom:24px}
    .sig-box{padding-top:36px;border-top:1px solid #cbd5e1;text-align:center;font-size:9px;color:#64748b}
    .sig-box b{display:block;font-size:9.5px;color:#1e293b;margin-top:2px}

    /* ── PO Footer band ── */
    .bill-ftr-band{position:fixed;bottom:0;left:0;right:0;background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 60%,#2563eb 100%);border-top:3px solid #1d4ed8;padding:6px 14mm;display:flex;justify-content:space-between;align-items:center;font-size:8.5px;color:rgba(255,255,255,0.9)}
    .bill-ftr-text{font-style:italic;color:rgba(255,255,255,0.75);flex:1;text-align:center;padding:0 12px}
    .bill-ftr-pg{white-space:nowrap;color:rgba(255,255,255,0.7);font-size:8px}
  </style>
  </head><body>
  <div class="page">

    <!-- Bill Header Band (from Settings → Bill & Invoice Appearance) -->
    ${billHeader ? `<div class="bill-hdr-band">${billHeader}</div>` : ''}

    <!-- Company Header -->
    <div class="hdr">
      <div class="hdr-left">
        ${logoSrc ? `<img src="${logoSrc}" style="max-height:56px;max-width:140px;object-fit:contain;flex-shrink:0;" />` : ''}
        <div class="co-info">
          <div class="co-name">${coName}</div>
          ${coAddr    ? `<div class="co-line">${coAddr}</div>` : ''}
          ${coCityLine? `<div class="co-line">${coCityLine}</div>` : ''}
          ${coTaxLine ? `<div class="co-tax">${coTaxLine}</div>` : ''}
          ${coContact ? `<div class="co-line">${coContact}</div>` : ''}
        </div>
      </div>
      <div class="hdr-right">
        <div class="po-label">PURCHASE ORDER</div>
        <div class="po-meta">
          <b>PO No:</b> ${po.po_number}<br>
          <b>Date:</b> ${fmtD(po.created_at)}<br>
          ${po.pr_number ? `<b>PR Ref:</b> ${po.pr_number}<br>` : ''}
          <b>Status:</b>&nbsp;<span class="badge ${po.status === 'DRAFT' ? 'badge-draft' : po.status === 'ISSUED' ? 'badge-issued' : po.status === 'COMPLETED' ? 'badge-approved' : 'badge-other'}">${po.status}</span>
        </div>
      </div>
    </div>

    <div class="body">

      <!-- PO Info bar -->
      <div class="info-bar">
        <div class="info-cell"><div class="info-label">Payment Terms</div><div class="info-val">${po.payment_terms || 'Net 30'}</div></div>
        <div class="info-cell"><div class="info-label">Delivery Date</div><div class="info-val">${po.delivery_date ? fmtD(po.delivery_date) : '—'}</div></div>
        <div class="info-cell"><div class="info-label">Prepared By</div><div class="info-val">${po.creator_name || '—'}</div></div>
        <div class="info-cell"><div class="info-label">Center</div><div class="info-val">${po.center_name || '—'}</div></div>
      </div>
      <!-- Vendor + Ship To -->
      <div class="addr-grid">
        <div class="addr-box">
          <div class="addr-box-hdr">Vendor / Supplier</div>
          <div class="addr-box-body">
            <b>${po.vendor_name}</b>
            ${po.vendor_address ? `<span class="muted">${po.vendor_address}</span>` : ''}
            ${po.vendor_gstin    ? `<span class="muted">GSTIN: ${po.vendor_gstin}</span>` : ''}
            ${po.vendor_phone    ? `<span class="muted">Ph: ${po.vendor_phone}</span>` : ''}
            ${po.vendor_email    ? `<span class="muted">${po.vendor_email}</span>` : ''}
          </div>
        </div>
        <div class="addr-box">
          <div class="addr-box-hdr">Ship To / Delivery Address</div>
          <div class="addr-box-body">
            <b>${po.center_name}</b>
            ${delAddr           ? `<span class="muted">${delAddr}</span>` : ''}
            ${po.center_gstin   ? `<span class="muted">GSTIN: ${po.center_gstin}</span>` : ''}
            ${po.center_phone   ? `<span class="muted">Ph: ${po.center_phone}</span>` : ''}
            ${po.delivery_address ? `<span class="muted" style="font-style:italic">Note: ${po.delivery_address}</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Items -->
      <table>
        <thead>
          <tr>
            <th style="width:28px">#</th>
            <th>Item / Description</th>
            <th class="c" style="width:42px">UOM</th>
            <th class="r" style="width:42px">Qty</th>
            <th class="r" style="width:70px">Unit Rate</th>
            <th class="r" style="width:40px">GST%</th>
            ${gstType(po.vendor_gstin, po.center_state_code) === 'CGST_SGST'
              ? `<th class="r" style="width:60px">CGST</th><th class="r" style="width:60px">SGST</th>`
              : `<th class="r" style="width:68px">IGST</th>`}
            <th class="r" style="width:76px">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it, i) => {
            const amt     = parseFloat(it.quantity || 0) * parseFloat(it.unit_rate || 0);
            const gstAmt  = amt * (parseFloat(it.gst_rate || 0) / 100);
            const isIntra = gstType(po.vendor_gstin, po.center_state_code) === 'CGST_SGST';
            const half    = parseFloat((gstAmt / 2).toFixed(2));
            return `<tr>
              <td class="c" style="color:#94a3b8">${i + 1}</td>
              <td><span class="iname">${it.item_name}</span>${it.description ? `<div class="idesc">${it.description}</div>` : ''}${it.item_code ? `<div class="idesc">Code: ${it.item_code}</div>` : ''}</td>
              <td class="c">${it.uom || '—'}</td>
              <td class="r">${it.quantity}</td>
              <td class="r">${fmt(it.unit_rate)}</td>
              <td class="r">${isIntra ? `${(it.gst_rate||0)/2}%+${(it.gst_rate||0)/2}%` : `${it.gst_rate||0}%`}</td>
              ${isIntra
                ? `<td class="r">${fmt(half)}</td><td class="r">${fmt(gstAmt - half)}</td>`
                : `<td class="r">${fmt(gstAmt)}</td>`}
              <td class="r" style="font-weight:700">${fmt(it.amount ?? amt)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <!-- Totals -->
      <div class="totals-wrap">
        <div class="totals">
          <div class="tot-row"><span>Subtotal</span><span>${fmt(po.subtotal)}</span></div>
          ${po.gst_amount > 0 ? (() => {
            const isIntra = gstType(po.vendor_gstin, po.center_state_code) === 'CGST_SGST';
            const half = parseFloat((po.gst_amount / 2).toFixed(2));
            return isIntra
              ? `<div class="tot-row"><span>CGST</span><span>${fmt(half)}</span></div>
                 <div class="tot-row"><span>SGST</span><span>${fmt(po.gst_amount - half)}</span></div>`
              : `<div class="tot-row"><span>IGST</span><span>${fmt(po.gst_amount)}</span></div>`;
          })() : ''}
          <div class="grand"><span>Total Amount</span><span>${fmt(po.total_amount)}</span></div>
        </div>
      </div>

      ${po.notes ? `<div class="notes-box"><b>Notes / Special Instructions:</b> ${po.notes}</div>` : ''}

      ${po.advance_required ? `
      <div style="margin:12px 0 10px;padding:8px 14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:7px;font-size:12px;color:#92400e;">
        <b>Advance Payment Required:</b>
        ${po.advance_percentage ? `${po.advance_percentage}% of PO value` : ''}
        ${po.advance_amount ? ` — ₹${parseFloat(po.advance_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : ''}
        &nbsp;(payable before delivery)
      </div>` : ''}

      <!-- Terms & Conditions (from Settings → Bill & Invoice Appearance) -->
      <div class="terms-box">
        <b>Terms &amp; Conditions:</b><br>${termsText}
      </div>

      <!-- Signatures -->
      <div class="sig">
        <div class="sig-box"><b>Prepared By</b>${po.creator_name || ''}</div>
        <div class="sig-box"><b>Authorised Signatory</b></div>
        <div class="sig-box"><b>Vendor Acknowledgement</b></div>
      </div>

    </div><!-- /body -->

    <!-- Bill Footer Band (from Settings → Bill & Invoice Appearance) -->
    <div class="bill-ftr-band">
      <span style="white-space:nowrap">${coName} — ${po.po_number}</span>
      <span class="bill-ftr-text">${billFooter}</span>
      <span class="bill-ftr-pg">Printed: ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>
    </div>

  </div>
  </body></html>`;
  w.document.documentElement.innerHTML = html;
  setTimeout(() => w.print(), 700);
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── Item Search Dropdown ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── Item Browser (replaces old ItemSearch dropdown) ───────────────────────────
const UOM_PHYSICAL = ['PCS','BOX','BOTTLE','VIAL','ML','MG','GM','KG','LTR','ROLL','SHEET','PAIR','SET','PACKET','REAM','UNIT'];
const UOM_SERVICE  = ['HRS','SESSION','VISIT','MONTH','YEAR'];
const UOM_DIGITAL  = ['CREDITS','STUDIES','SCANS'];
const GST_RATES   = [0, 5, 12, 18, 28];

// item_master.item_type → item_categories.item_type key in tree
const ITEM_TYPE_TO_TREE_KEY = { STOCK: 'STOCK', EXPENSE: 'EXPENSE', FIXED_ASSET: 'FIXED_ASSET' };

// ── Category Select (same UX as Item Master) — single select with optgroups + COA preview ──
const ProcCategorySelect = ({ categoryTree, itemType, value, onChange, error }) => {
  const nodes = categoryTree[itemType] || [];

  const findNode = (id) => {
    for (const l1 of nodes) {
      if (l1.id === parseInt(id)) return l1;
      for (const l2 of (l1.children || [])) {
        if (l2.id === parseInt(id)) return l2;
      }
    }
    return null;
  };

  const selected = value ? findNode(value) : null;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        Category <span className="text-red-500">*</span>
      </label>
      <select
        value={value || ''}
        onChange={e => {
          const id = e.target.value ? parseInt(e.target.value) : null;
          onChange(id, id ? findNode(id) : null);
        }}
        style={{ border: error ? '1.5px solid #f87171' : '1.5px solid #94a3b8' }}
        className="w-full px-3 py-2 text-xs rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        <option value="">— Select Category —</option>
        {nodes.map(l1 => (l1.children || []).length === 0 ? (
          <option key={l1.id} value={l1.id}>{l1.name}</option>
        ) : (
          <optgroup key={l1.id} label={l1.name}>
            {(l1.children || []).map(l2 => (
              <option key={l2.id} value={l2.id}>{l2.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}

      {/* COA GL preview */}
      {selected && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GL Accounts linked to this category</p>
          {selected.asset_gl_code && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-emerald-600 w-24 flex-shrink-0">Asset / Stock</span>
              <span className="text-xs font-mono text-slate-700">{selected.asset_gl_code}</span>
              <span className="text-xs text-slate-500 truncate">· {selected.asset_gl_name}</span>
            </div>
          )}
          {selected.expense_gl_code && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-blue-600 w-24 flex-shrink-0">Expense</span>
              <span className="text-xs font-mono text-slate-700">{selected.expense_gl_code}</span>
              <span className="text-xs text-slate-500 truncate">· {selected.expense_gl_name}</span>
            </div>
          )}
          {!selected.asset_gl_code && !selected.expense_gl_code && (
            <p className="text-xs text-amber-600">⚠ No GL accounts mapped — configure in Category Settings</p>
          )}
          <div className="border-t border-slate-200 mt-1.5 pt-1.5 flex items-center gap-4">
            <span className="text-[10px] font-bold text-teal-700">
              GST: {selected.gst_rate ?? 0}%
            </span>
            {(selected.hsn_code || selected.sac_code) && (
              <span className="text-[10px] text-slate-500">
                {selected.hsn_code ? `HSN ${selected.hsn_code}` : `SAC ${selected.sac_code}`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const EMPTY_IM = {
  item_code: '', item_name: '', item_type: 'STOCK',
  category_id: null,
  uom: 'PCS', gst_rate: 0, standard_rate: '', description: '',
  consumption_uom: 'PCS', uom_conversion: 1,
};

const ItemBrowser = ({ onSelect }) => {
  const [items,        setItems]        = useState([]);
  const [categoryTree, setCategoryTree] = useState({});
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('ALL');
  const [catFilter,    setCatFilter]    = useState('ALL');
  const [showForm,     setShowForm]     = useState(false);
  const [form,         setForm]         = useState(EMPTY_IM);
  const [formErr,      setFormErr]      = useState({});
  const [saveErr,      setSaveErr]      = useState('');
  const [saving,       setSaving]       = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, treeRes] = await Promise.all([
        api('/api/item-master').then(r => r.json()),
        api('/api/item-categories/tree?item_master_only=true').then(r => r.json()),
      ]);
      setItems(itemsRes.items || []);
      setCategoryTree(treeRes.tree || {});
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Get L1 nodes for a given item_type
  const l1ForType = (itemType) => {
    const treeKey = ITEM_TYPE_TO_TREE_KEY[itemType] || itemType;
    return categoryTree[treeKey] || [];
  };


  const setField = (field) => (e) => {
    const val = e.target.value;
    setForm(f => {
      const next = { ...f, [field]: val };
      // Reset category when item type changes
      if (field === 'item_type') next.category_id = null;
      return next;
    });
    setFormErr(er => ({ ...er, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.item_code.trim())  e.item_code    = 'Required';
    if (!form.item_name.trim())  e.item_name    = 'Required';
    if (!form.category_id)       e.category     = 'Required';
    if (!form.uom)               e.uom          = 'Required';
    if (form.standard_rate === '' || isNaN(parseFloat(form.standard_rate)))
                                 e.standard_rate = 'Required';
    setFormErr(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true); setSaveErr('');
    try {
      const r = await api('/api/item-master', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          item_code:       form.item_code.trim().toUpperCase(),
          gst_rate:        parseFloat(form.gst_rate)      || 0,
          standard_rate:   parseFloat(form.standard_rate) || 0,
          category_id:     form.category_id,
          consumption_uom: form.consumption_uom || form.uom,
          uom_conversion:  parseFloat(form.uom_conversion) || 1,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.errors?.[0]?.msg || d.error || 'Save failed');
      setItems(prev => [...prev, d.item]);
      onSelect(d.item);
      setShowForm(false);
      setForm(EMPTY_IM);
    } catch (err) {
      setSaveErr(err.message);
    }
    setSaving(false);
  };

  // All L2 nodes flattened for display label lookup
  const allL2 = Object.values(categoryTree).flat().flatMap(l1 => l1.children || []);

  const displayed = items.filter(i => {
    if (typeFilter !== 'ALL' && i.item_type !== typeFilter) return false;
    if (catFilter  !== 'ALL' && String(i.category_id) !== String(catFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const catLabel = allL2.find(c => c.id === i.category_id)?.name || i.category || '';
      if (!(i.item_code?.toLowerCase().includes(q) ||
            i.item_name.toLowerCase().includes(q)   ||
            catLabel.toLowerCase().includes(q)))   return false;
    }
    return true;
  });

  return (
    <>
    {/* ── Add New Item Modal — rendered via portal to escape parent stacking context ── */}
    {showForm && createPortal(
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999, background: 'rgba(15,23,42,0.65)' }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

          {/* Modal header */}
          <div className="px-5 py-4 flex items-center justify-between rounded-t-2xl flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
            <div>
              <p className="text-white font-bold text-sm">Add New Item to Item Master</p>
              <p className="text-teal-200 text-xs mt-0.5">Saved permanently — available in all future PRs &amp; POs</p>
            </div>
            <button type="button" onClick={() => { setShowForm(false); setSaveErr(''); setFormErr({}); }}
              className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Modal form */}
          <form onSubmit={handleCreate} className="flex flex-col">
            <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
              {saveErr && (
                <div className="mx-5 mt-4">
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveErr}</p>
                </div>
              )}

              {/* ── Section: Basic Info ──────────────────────────────── */}
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3">Basic Information</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Item Code <span className="text-red-500">*</span></label>
                    <input value={form.item_code} onChange={setField('item_code')} autoFocus
                      style={{ border: formErr.item_code ? '1.5px solid #f87171' : '1.5px solid #94a3b8' }}
                      className={`w-full px-3 py-2 text-sm font-mono rounded-lg text-slate-800 uppercase bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:normal-case placeholder:text-slate-400 ${formErr.item_code ? 'bg-red-50' : ''}`}
                      placeholder="e.g. MC-001 or FILM-A4" />
                    {formErr.item_code && <p className="mt-1 text-[11px] text-red-500">{formErr.item_code}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Item Name <span className="text-red-500">*</span></label>
                    <input value={form.item_name} onChange={setField('item_name')}
                      style={{ border: formErr.item_name ? '1.5px solid #f87171' : '1.5px solid #94a3b8' }}
                      className={`w-full px-3 py-2 text-sm rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400 ${formErr.item_name ? 'bg-red-50' : ''}`}
                      placeholder="e.g. Omnipaque 350 (100ml), IV Cannula 18G" />
                    {formErr.item_name && <p className="mt-1 text-[11px] text-red-500">{formErr.item_name}</p>}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 mx-5" />

              {/* ── Section: Classification ──────────────────────────── */}
              <div className="px-5 py-3">
                <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3">Classification</p>
                {/* Item Type toggle */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Item Type <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    {[['STOCK','Stock Item'],['EXPENSE','Expense & Service'],['FIXED_ASSET','Fixed Asset']].map(([val, lbl]) => (
                      <button key={val} type="button"
                        onClick={() => setField('item_type')({ target: { value: val } })}
                        className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${form.item_type === val ? 'bg-teal-600 text-white border-teal-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400 hover:text-teal-700'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Single category select with COA preview */}
                <ProcCategorySelect
                  categoryTree={categoryTree}
                  itemType={form.item_type}
                  value={form.category_id}
                  onChange={(v, node) => {
                    setForm(f => ({
                      ...f,
                      category_id: v,
                      gst_rate: node?.gst_rate ?? f.gst_rate,
                    }));
                    setFormErr(er => ({ ...er, category: '' }));
                  }}
                  error={formErr.category}
                />
                {form.category_id && (
                  <p className="text-[10px] text-teal-600 mt-1">
                    GST auto-set from category. Change below only if this item differs.
                  </p>
                )}
              </div>

              <div className="border-t border-slate-100 mx-5" />

              {/* ── Section: Pricing ─────────────────────────────────── */}
              <div className="px-5 py-3">
                <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3">Pricing & Unit</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">UOM <span className="text-red-500">*</span></label>
                    <select value={form.uom} onChange={setField('uom')}
                      style={{ border: formErr.uom ? '1.5px solid #f87171' : '1.5px solid #94a3b8' }}
                      className="w-full px-3 py-2 text-xs rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                      <optgroup label="Physical">{UOM_PHYSICAL.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                      <optgroup label="Service / Time">{UOM_SERVICE.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                                <optgroup label="Digital / Credits">{UOM_DIGITAL.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">GST %</label>
                    <select value={form.gst_rate} onChange={setField('gst_rate')}
                      style={{ border: '1.5px solid #94a3b8' }}
                      className="w-full px-3 py-2 text-xs rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                      {GST_RATES.map(g => <option key={g} value={g}>{g}%</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Std. Rate (₹) <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs pointer-events-none">₹</span>
                      <input type="number" min="0" step="0.01" value={form.standard_rate} onChange={setField('standard_rate')}
                        style={{ border: formErr.standard_rate ? '1.5px solid #f87171' : '1.5px solid #94a3b8' }}
                        className={`w-full pl-6 pr-3 py-2 text-xs rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 ${formErr.standard_rate ? 'bg-red-50' : ''}`}
                        placeholder="0.00" />
                    </div>
                    {formErr.standard_rate && <p className="mt-1 text-[11px] text-red-500">{formErr.standard_rate}</p>}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 mx-5" />

              {/* ── Section: Consumption UOM (STOCK only) ─────────────── */}
              {form.item_type === 'STOCK' && (
                <>
                  <div className="px-5 py-3">
                    <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3">Consumption (Issue) UOM</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Consumption UOM</label>
                        <select value={form.consumption_uom || form.uom} onChange={setField('consumption_uom')}
                          style={{ border: '1.5px solid #94a3b8' }}
                          className="w-full px-3 py-2 text-xs rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                          <optgroup label="Physical">{UOM_PHYSICAL.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                          <optgroup label="Service / Time">{UOM_SERVICE.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                          <optgroup label="Digital / Credits">{UOM_DIGITAL.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                        </select>
                        <p className="text-[10px] text-slate-400 mt-1">Unit used when issuing to studies</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Conversion Factor</label>
                        <input type="number" min="1" step="0.001"
                          value={form.uom_conversion}
                          onChange={setField('uom_conversion')}
                          style={{ border: '1.5px solid #94a3b8' }}
                          className="w-full px-3 py-2 text-xs rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          placeholder="1" />
                        <p className="text-[10px] text-slate-400 mt-1">
                          {parseFloat(form.uom_conversion) > 1
                            ? `1 ${form.uom} = ${form.uom_conversion} ${form.consumption_uom || form.uom}`
                            : `How many ${form.consumption_uom || 'units'} per 1 ${form.uom}`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 mx-5" />
                </>
              )}

              {/* ── Section: Notes ───────────────────────────────────── */}
              <div className="px-5 py-3 pb-4">
                <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3">Notes</p>
                <input value={form.description} onChange={setField('description')}
                  style={{ border: '1.5px solid #94a3b8' }}
                  className="w-full px-3 py-2 text-xs rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400"
                  placeholder="Brand, model, size, specification…" />
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-2xl flex-shrink-0">
              <button type="button" onClick={() => { setShowForm(false); setSaveErr(''); setFormErr({}); }}
                className="px-4 py-2 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-5 py-2 text-xs text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-semibold transition-colors">
                {saving ? 'Saving…' : 'Save to Item Master & Add'}
              </button>
            </div>
          </form>
        </div>
      </div>
    , document.body)}

    <div className="border border-slate-200 rounded-xl bg-slate-50 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-white border-b border-slate-200">
        <div className="relative flex-1 min-w-[140px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search code, name, category…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-teal-400" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[['ALL','All'],['STOCK','Stock'],['EXPENSE','Expense & Service'],['FIXED_ASSET','Fixed Asset']].map(([val, lbl]) => (
            <button key={val} type="button"
              onClick={() => { setTypeFilter(val); setCatFilter('ALL'); }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                typeFilter === val ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {lbl}
            </button>
          ))}
        </div>
        {typeFilter !== 'ALL' && (
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-teal-400">
            <option value="ALL">All Groups</option>
            {l1ForType(typeFilter).map(l1 => (l1.children || []).length === 0
              ? <option key={l1.id} value={l1.id}>{l1.name}</option>
              : <optgroup key={l1.code} label={l1.name}>
                  {(l1.children || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
            )}
          </select>
        )}
        <button type="button" onClick={() => { setShowForm(true); setForm({ ...EMPTY_IM }); setFormErr({}); setSaveErr(''); }}
          className="ml-auto px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors flex items-center gap-1 flex-shrink-0">
          <span className="text-base leading-none">+</span> New Item
        </button>
      </div>

      {/* Items table */}
      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400 text-xs">Loading items…</div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-xs gap-1">
            <span>No items found</span>
            {search && <button type="button" onClick={() => setSearch('')} className="text-teal-600 hover:underline text-xs">Clear search</button>}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-100 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 w-24">Code</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Name</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 hidden sm:table-cell w-32">Category</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 w-14">UOM</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-500 w-20">Rate</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-500 w-14">GST%</th>
                <th className="w-14 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {displayed.map(item => (
                <tr key={item.id} className="hover:bg-teal-50 transition-colors">
                  <td className="px-3 py-2">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold border border-slate-200">
                      {item.item_code}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-slate-800 leading-tight">{item.item_name}</p>
                    {item.description && <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{item.description}</p>}
                  </td>
                  <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">
                    <div className="text-[10px] text-slate-400">{item.l1_category_name || item.l1_category || '—'}</div>
                    <div>{item.category_name || item.category || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{item.uom}</td>
                  <td className="px-3 py-2 text-right font-semibold text-teal-700">{fmt(item.standard_rate)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{item.gst_rate ?? 0}%</td>
                  <td className="px-2 py-2 text-center">
                    <button type="button" onClick={() => onSelect(item)}
                      className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-bold rounded-lg transition-colors whitespace-nowrap">
                      + Add
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400">
        {displayed.length} item{displayed.length !== 1 ? 's' : ''} shown
      </div>
    </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── PR Form (create / edit) ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const PRForm = ({ centers, onSaved, onCancel, editPR = null }) => {
  const user = currentUser();
  const [form, setForm]           = useState({
    justification: editPR?.justification || '',
    center_id: editPR?.center_id || (user.is_corporate_role ? '' : user.center_id || ''),
    priority: editPR?.priority || 'NORMAL',
    required_by: editPR?.required_by?.split('T')[0] || '',
  });
  const [items, setItems]         = useState(editPR ? [] : []);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');

  // Load items if editing
  useEffect(() => {
    if (editPR) {
      api(`/api/procurement/prs/${editPR.id}`).then(r => r.json()).then(d => setItems(d.items || []));
    }
  }, [editPR]);

  const addItem = (item = null) => {
    setItems(prev => [...prev, {
      item_master_id: item?.id || null,
      item_code: item?.item_code || '',
      item_name: item?.item_name || '',
      category: item?.category_name || item?.l1_category_name || item?.category || '',
      uom: item?.uom || 'PCS',
      consumption_uom: item?.consumption_uom || item?.uom || 'PCS',
      uom_conversion: parseFloat(item?.uom_conversion || 1),
      quantity: 1,
      estimated_rate: item?.standard_rate || 0,
      notes: item?.description || '',
      gst_rate: item?.gst_rate || 0,
    }]);
  };

  const updateItem = (i, field, val) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  };

  const removeItem = i => setItems(prev => prev.filter((_, idx) => idx !== i));

  const total = items.reduce((s, it) => s + (parseFloat(it.quantity || 0) * parseFloat(it.estimated_rate || 0)), 0);

  const save = async (asDraft) => {
    if (!form.justification.trim()) { setErr('Justification is required'); return; }
    if (!items.length)              { setErr('Add at least one item'); return; }
    setSaving(true); setErr('');
    try {
      const method = editPR ? 'PATCH' : 'POST';
      const url    = editPR ? `/api/procurement/prs/${editPR.id}` : '/api/procurement/prs';
      const payload = { ...form, center_id: form.center_id ? parseInt(form.center_id) : undefined, items };
      const r = await api(url, { method, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) {
        const detail = d.errors?.map(e => `[${e.path ?? e.param}] ${e.msg}`).join(' · ') || d.error || 'Save failed';
        setErr(detail); setSaving(false); return;
      }
      if (!asDraft && !editPR) {
        // Submit immediately
        await api(`/api/procurement/prs/${d.pr.id}/submit`, { method: 'POST', body: '{}' });
      }
      onSaved();
    } catch { setErr('Network error'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="flex min-h-full items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col my-auto">

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl"
          style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
          <div>
            <p className="text-white font-bold text-base">{editPR ? 'Edit PR' : 'New Purchase Requisition'}</p>
            <p className="text-teal-200 text-xs mt-0.5">Fill in the details and add items required</p>
          </div>
          <button onClick={onCancel} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Basic Info */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
            <span className="font-semibold text-slate-600">Requested by:</span>
            <span className="font-bold text-slate-700">{user.name || user.username || '—'}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Center <span className="text-red-500">*</span></label>
              <select value={form.center_id} onChange={e => setForm(f => ({ ...f, center_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">Select center…</option>
                {centers.filter(c => c.active !== false && c.code === 'CORP').map(c => <option key={c.id} value={c.id}>🏢 {c.name}</option>)}
                {centers.filter(c => c.active !== false && c.code === 'CORP').length > 0 && <option disabled>──────────────</option>}
                {centers.filter(c => c.active !== false && c.code !== 'CORP').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Required By</label>
              <input type="date" value={form.required_by} onChange={e => setForm(f => ({ ...f, required_by: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Items Required <span className="text-red-500">*</span></label>
              <button type="button" onClick={() => addItem()}
                className="text-xs px-3 py-1 rounded-lg bg-teal-50 text-teal-700 font-semibold hover:bg-teal-100 transition-colors">
                + Add Row
              </button>
            </div>

            {/* Item browser */}
            <div className="mb-3">
              <ItemBrowser onSelect={addItem} />
            </div>

            {items.length > 0 && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                      <th className="border border-teal-600 px-2 py-2.5 text-center text-white font-semibold w-8">#</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-left text-white font-semibold w-24">Code</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-left text-white font-semibold">Item Name</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-left text-white font-semibold w-16">UOM</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-right text-white font-semibold w-20">Qty</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-right text-white font-semibold w-28">Est. Rate (₹)</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-right text-white font-semibold w-28">Amount (₹)</th>
                      <th className="border border-teal-600 px-2 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => {
                      const amount = parseFloat(it.quantity || 0) * parseFloat(it.estimated_rate || 0);
                      return (
                        <React.Fragment key={i}>
                          <tr className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="border border-slate-200 px-2 py-2 text-center text-slate-400 font-semibold">{i + 1}</td>
                            <td className="border border-slate-200 px-1 py-1">
                              <input value={it.item_code} onChange={e => updateItem(i, 'item_code', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs font-mono text-slate-700 uppercase bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded"
                                placeholder="Code" />
                            </td>
                            <td className="border border-slate-200 px-1 py-1">
                              <input value={it.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs font-medium text-slate-800 bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded"
                                placeholder="Item name *" />
                            </td>
                            <td className="border border-slate-200 px-1 py-1">
                              {it.item_master_id ? (
                                <div className="px-2 py-1.5">
                                  <span className="text-xs font-semibold text-teal-700">{it.uom}</span>
                                  {it.uom_conversion > 1 && (
                                    <div className="text-[9px] text-slate-400 leading-tight mt-0.5">1 {it.uom} = {it.uom_conversion} {it.consumption_uom}</div>
                                  )}
                                </div>
                              ) : (
                                <select value={it.uom} onChange={e => updateItem(i, 'uom', e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs text-slate-700 bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded">
                                  <optgroup label="Physical">{UOM_PHYSICAL.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                                  <optgroup label="Service / Time">{UOM_SERVICE.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                                  <optgroup label="Digital / Credits">{UOM_DIGITAL.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                                </select>
                              )}
                            </td>
                            <td className="border border-slate-200 px-1 py-1">
                              <input type="number" min="0.01" step="0.01" value={it.quantity}
                                onChange={e => updateItem(i, 'quantity', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs text-right text-slate-700 bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded" />
                            </td>
                            <td className="border border-slate-200 px-1 py-1">
                              <input type="number" min="0" step="0.01" value={it.estimated_rate}
                                onChange={e => updateItem(i, 'estimated_rate', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs text-right text-slate-700 bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded" />
                            </td>
                            <td className="border border-slate-200 px-3 py-2 text-right font-bold text-teal-700 whitespace-nowrap">{fmt(amount)}</td>
                            <td className="border border-slate-200 px-2 py-2 text-center">
                              <button type="button" onClick={() => removeItem(i)}
                                className="w-5 h-5 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 font-bold text-sm transition-colors mx-auto">×</button>
                            </td>
                          </tr>
                          <tr className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="border border-slate-200 px-2 py-1 text-center text-slate-300 text-[10px]">↳</td>
                            <td colSpan={7} className="border border-slate-200 px-1 py-1">
                              <input value={it.notes} onChange={e => updateItem(i, 'notes', e.target.value)}
                                className="w-full px-2 py-1 text-[11px] text-slate-500 italic bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded placeholder:text-slate-300 placeholder:not-italic"
                                placeholder="Notes / brand / specification (optional)" />
                            </td>
                            <td className="border border-slate-200"></td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="border border-slate-200 px-3 py-2 text-right text-xs font-semibold text-slate-500">Estimated Total</td>
                      <td className="border border-slate-200 px-3 py-2 text-right text-sm font-extrabold text-teal-700">{fmt(total)}</td>
                      <td className="border border-slate-200"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Justification */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Justification / Business Reason <span className="text-red-500">*</span>
            </label>
            <textarea value={form.justification} onChange={e => setForm(f => ({ ...f, justification: e.target.value }))}
              rows={3} maxLength={2000}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              placeholder="Explain why this purchase is needed, how it supports operations, and any urgency…" />
            <p className="text-[10px] text-slate-400 text-right mt-0.5">{form.justification.length}/2000</p>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex-shrink-0 flex gap-3">
          <button onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
            Cancel
          </button>
          {!editPR && (
            <button onClick={() => save(true)} disabled={saving}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-teal-200 text-teal-700 hover:bg-teal-50 transition-colors">
              Save as Draft
            </button>
          )}
          <button onClick={() => save(false)} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-all"
            style={{ background: saving ? '#94a3b8' : 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
            {saving ? 'Saving…' : editPR ? 'Save Changes' : 'Submit for Approval →'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── PR Detail / Approval Modal ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const PRDetail = ({ prId, onClose, onUpdated }) => {
  const user = currentUser();
  const { has: hasPerm } = getPermissions();
  const [data, setData]       = useState(null);
  const [action, setAction]   = useState(null); // 'approve'|'reject'
  const [comments, setComm]   = useState('');
  const [reason, setReason]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const load = useCallback(() => {
    api(`/api/procurement/prs/${prId}`).then(r => r.json()).then(d => setData(d));
  }, [prId]);
  useEffect(() => { load(); }, [load]);

  const doApprove = async () => {
    setSaving(true); setErr('');
    const r = await api(`/api/procurement/prs/${prId}/approve`, { method: 'POST', body: JSON.stringify({ comments }) });
    const d = await r.json();
    if (r.ok) { onUpdated(); onClose(); }
    else setErr(d.error || 'Failed');
    setSaving(false);
  };

  const doReject = async () => {
    if (!reason.trim() || reason.trim().length < 5) { setErr('Enter a reason (min 5 chars)'); return; }
    setSaving(true); setErr('');
    const r = await api(`/api/procurement/prs/${prId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
    const d = await r.json();
    if (r.ok) { onUpdated(); onClose(); }
    else setErr(d.error || 'Failed');
    setSaving(false);
  };

  const doSubmit = async () => {
    setSaving(true);
    await api(`/api/procurement/prs/${prId}/submit`, { method: 'POST', body: '{}' });
    onUpdated(); onClose();
    setSaving(false);
  };

  if (!data) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const { pr, items = [], approvals = [] } = data;
  const st = PR_STATUS[pr.status] || {};
  const canApprove = ['SUBMITTED', 'L1_APPROVED'].includes(pr.status) && hasPerm('PR_APPROVE');
  const canSubmit  = pr.status === 'DRAFT' && pr.requested_by === parseInt(user.id) && hasPerm('PR_WRITE');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-start justify-between flex-shrink-0 rounded-t-2xl"
          style={{ background: 'linear-gradient(135deg,#1e293b,#334155)' }}>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-white font-bold text-base">{pr.pr_number}</p>
              <Badge cfg={st} text={pr.status} />
              <Badge cfg={{ bg: 'transparent', color: PRIORITY[pr.priority]?.color || '#64748b', label: PRIORITY[pr.priority]?.label }} text={pr.priority} />
            </div>
            <p className="text-slate-300 text-sm mt-0.5">{pr.title}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Meta grid */}
          <div className="px-6 pt-4 pb-3 border-b border-slate-100">
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Requested By', pr.requester_name],
                ['Center', pr.center_name],
                ['Department', pr.department || '—'],
                ['Date', fmtD(pr.created_at)],
                ['Required By', fmtD(pr.required_by)],
                ['Est. Total', fmt(pr.total_estimated)],
              ].map(([l, v]) => (
                <div key={l} className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{l}</p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Justification */}
          <div className="px-6 py-3 border-b border-slate-100">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Justification</p>
            <p className="text-sm text-slate-700 leading-relaxed">{pr.justification}</p>
            {pr.notes && <p className="text-xs text-slate-400 mt-1 italic">{pr.notes}</p>}
          </div>

          {/* Items */}
          <div className="px-6 py-3 border-b border-slate-100">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Items Requested</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left pb-1.5 font-semibold text-slate-500">Item</th>
                  <th className="text-left pb-1.5 font-semibold text-slate-500">Category</th>
                  <th className="text-center pb-1.5 font-semibold text-slate-500">Qty</th>
                  <th className="text-right pb-1.5 font-semibold text-slate-500">Est. Rate</th>
                  <th className="text-right pb-1.5 font-semibold text-slate-500">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-1.5 font-medium text-slate-700">{it.item_name}
                      {it.notes && <span className="block text-[10px] text-slate-400">{it.notes}</span>}
                    </td>
                    <td className="py-1.5 text-slate-500">{it.category || '—'}</td>
                    <td className="py-1.5 text-center">{it.quantity} {it.uom}</td>
                    <td className="py-1.5 text-right">{fmt(it.estimated_rate)}</td>
                    <td className="py-1.5 text-right font-bold text-teal-700">{fmt(it.estimated_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={4} className="py-2 text-right text-xs font-bold text-slate-600">Estimated Total</td>
                  <td className="py-2 text-right font-extrabold text-teal-700">{fmt(pr.total_estimated)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Approval trail */}
          {approvals.length > 0 && (
            <div className="px-6 py-3 border-b border-slate-100">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Approval Trail</p>
              <div className="space-y-2">
                {approvals.map((a, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: a.action === 'APPROVED' ? '#dcfce7' : '#fee2e2' }}>
                      <span className="text-xs">{a.action === 'APPROVED' ? '✓' : '✕'}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700">
                        Level {a.level} — {a.approver_name}
                        <span className="ml-2 font-normal text-slate-400">{fmtD(a.acted_at)}</span>
                      </p>
                      {a.comments && <p className="text-xs text-slate-500 italic mt-0.5">"{a.comments}"</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rejection info */}
          {pr.status === 'REJECTED' && (
            <div className="px-6 py-3">
              <div className="rounded-xl p-3 bg-red-50 border border-red-200">
                <p className="text-xs font-bold text-red-700 mb-1">Rejection Reason</p>
                <p className="text-xs text-red-600">{pr.rejection_reason}</p>
              </div>
            </div>
          )}

          {/* Action area */}
          {(canApprove || canSubmit) && !action && (
            <div className="px-6 py-4">
              {canSubmit && (
                <button onClick={doSubmit} disabled={saving}
                  className="w-full py-2.5 rounded-xl text-white font-bold text-sm"
                  style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                  Submit for Approval →
                </button>
              )}
              {canApprove && (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setAction('reject')}
                    className="py-2.5 rounded-xl text-sm font-bold border-2 border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                    ✕ Reject
                  </button>
                  <button onClick={() => setAction('approve')}
                    className="py-2.5 rounded-xl text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                    ✓ Approve
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Approve confirmation */}
          {action === 'approve' && (
            <div className="px-6 py-4 space-y-3">
              <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-200">
                <p className="text-xs font-bold text-emerald-700">Approving PR: {pr.pr_number}</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {pr.status === 'SUBMITTED' ? 'This will send the PR to the Director for final approval.' : 'This will fully approve the PR — the requester can create a PO.'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Comments (optional)</label>
                <textarea value={comments} onChange={e => setComm(e.target.value)} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  placeholder="Add any approval notes…" />
              </div>
              {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
              <div className="flex gap-3">
                <button onClick={() => { setAction(null); setErr(''); }} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100">Back</button>
                <button onClick={doApprove} disabled={saving}
                  className="flex-1 py-2 rounded-xl text-white font-bold text-sm"
                  style={{ background: saving ? '#94a3b8' : '#059669' }}>
                  {saving ? 'Processing…' : 'Confirm Approval'}
                </button>
              </div>
            </div>
          )}

          {/* Reject confirmation */}
          {action === 'reject' && (
            <div className="px-6 py-4 space-y-3">
              <div className="rounded-xl p-3 bg-red-50 border border-red-200">
                <p className="text-xs font-bold text-red-700">Rejecting PR: {pr.pr_number}</p>
                <p className="text-xs text-red-600 mt-0.5">The requester will be notified with your reason.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Reason <span className="text-red-500">*</span></label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  placeholder="Explain why this PR is being rejected…" />
              </div>
              {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
              <div className="flex gap-3">
                <button onClick={() => { setAction(null); setErr(''); }} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100">Back</button>
                <button onClick={doReject} disabled={saving || reason.trim().length < 5}
                  className="flex-1 py-2 rounded-xl text-white font-bold text-sm"
                  style={{ background: saving || reason.trim().length < 5 ? '#94a3b8' : '#dc2626' }}>
                  {saving ? 'Processing…' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 flex-shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200">Close</button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── Vendor Search ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const VendorSearch = ({ onSelect }) => {
  const [q, setQ]               = useState('');
  const [results, setResults]   = useState([]);
  const [allVendors, setAll]    = useState([]);
  const [open, setOpen]         = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    api('/api/vendors').then(r => r.json()).then(d => setAll(d.vendors || []));
  }, []);

  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = (v) => {
    setQ(v);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    const lq = v.toLowerCase();
    const filtered = allVendors.filter(vn =>
      vn.vendor_name?.toLowerCase().includes(lq) ||
      vn.vendor_code?.toLowerCase().includes(lq) ||
      vn.vendor_type?.toLowerCase().includes(lq) ||
      vn.phone?.toLowerCase().includes(lq) ||
      vn.email?.toLowerCase().includes(lq) ||
      vn.gst_number?.toLowerCase().includes(lq) ||
      vn.contact_person?.toLowerCase().includes(lq)
    ).slice(0, 10);
    setResults(filtered);
    setOpen(true);
  };

  const pick = (vendor) => {
    setSelected(vendor);
    setQ(vendor.vendor_name);
    setOpen(false);
    onSelect(vendor);
  };

  const clear = () => { setSelected(null); setQ(''); setResults([]); setOpen(false); onSelect(null); };

  return (
    <>
    {/* New Vendor Modal — portal so it always appears on top */}
    {showForm && createPortal(
      <VendorModal
        vendor={null}
        onClose={() => setShowForm(false)}
        onSaved={(v) => { setAll(prev => [...prev, v]); pick(v); setShowForm(false); }}
      />,
      document.body
    )}

    {/* Search box */}
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <input value={q} onChange={e => search(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          className="w-full border border-slate-200 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
          placeholder="Search vendor by name, code or GSTIN…" />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        {selected && (
          <button type="button" onClick={clear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-base leading-none">×</button>
        )}
      </div>

      {selected && (
        <div className="mt-1.5 flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg">
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 font-bold border border-teal-200">{selected.vendor_code}</span>
          <span className="text-sm font-semibold text-slate-800">{selected.vendor_name}</span>
          <span className="text-[10px] text-slate-400 ml-1">{selected.vendor_type}</span>
          {selected.phone && <span className="text-[10px] text-slate-400 ml-auto">{selected.phone}</span>}
        </div>
      )}

      {open && !selected && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {results.length > 0 ? (
            results.map(v => (
              <button key={v.id} type="button" onClick={() => pick(v)}
                className="w-full text-left px-4 py-2.5 hover:bg-teal-50 flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold border border-slate-200 flex-shrink-0">{v.vendor_code}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{v.vendor_name}</p>
                  <p className="text-[10px] text-slate-400">{v.vendor_type}{v.phone ? ' · ' + v.phone : ''}{v.gst_number ? ' · ' + v.gst_number : ''}</p>
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-xs text-slate-500">No vendor found for "<b>{q}</b>"</div>
          )}
          <button type="button" onClick={() => { setOpen(false); setShowForm(true); }}
            className="w-full text-left px-4 py-2.5 text-xs text-teal-600 font-semibold hover:bg-teal-50 flex items-center gap-2 border-t border-slate-100 transition-colors">
            <span className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm flex-shrink-0">+</span>
            {q ? <>Add "<b className="mx-0.5">{q}</b>" as new vendor</> : 'Add new vendor'}
          </button>
        </div>
      )}
    </div>
    </>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// ── PO Form ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const POForm = ({ centers = [], prId = null, editPO = null, onSaved, onCancel }) => {
  const user = currentUser();
  const [form, setForm] = useState({
    vendor_name: '', vendor_address: '', vendor_gstin: '', vendor_email: '',
    vendor_phone: '', vendor_is_taxpayer: true,
    center_id: user.is_corporate_role ? '' : (user.center_id || ''), delivery_address: '',
    delivery_date: '', payment_terms: 'Net 30', notes: '',
    terms_conditions: 'Goods to be supplied as per specifications. Subject to quality inspection on receipt.',
    advance_required: false, advance_percentage: '', advance_amount: '',
    quotation_ref: '',
  });
  const [items, setItems] = useState([]);
  const [prItems, setPrItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (editPO) {
      // Pre-populate form with existing PO data
      api(`/api/procurement/pos/${editPO}`).then(r => r.json()).then(d => {
        if (!d.po) return;
        const po = d.po;
        setForm({
          vendor_name: po.vendor_name || '', vendor_address: po.vendor_address || '',
          vendor_gstin: po.vendor_gstin || '', vendor_email: po.vendor_email || '',
          vendor_phone: po.vendor_phone || '', vendor_is_taxpayer: !!(po.vendor_gstin),
          center_id: po.center_id || '',
          delivery_address: po.delivery_address || '', delivery_date: po.delivery_date?.slice(0,10) || '',
          payment_terms: po.payment_terms || 'Net 30', notes: po.notes || '',
          terms_conditions: po.terms_conditions || '',
          advance_required: po.advance_required || false,
          advance_percentage: po.advance_percentage || '', advance_amount: po.advance_amount || '',
          quotation_ref: po.quotation_ref || '',
        });
        setItems((d.items || []).map(it => ({
          item_master_id: it.item_master_id, item_code: it.item_code,
          item_name: it.item_name, description: it.description || '',
          uom: it.uom, quantity: it.quantity,
          unit_rate: it.unit_rate, gst_rate: it.gst_rate || 0,
        })));
      });
    } else if (prId) {
      api(`/api/procurement/prs/${prId}`).then(r => r.json()).then(d => {
        setPrItems(d.items || []);
        setItems((d.items || []).map(it => ({
          item_master_id: it.item_master_id, item_code: it.item_code,
          item_name: it.item_name, description: it.notes || '',
          uom: it.uom, quantity: it.quantity,
          unit_rate: it.estimated_rate, gst_rate: it.gst_rate || 0,
        })));
        if (d.pr) setForm(f => ({ ...f, center_id: d.pr.center_id }));
      });
    }
  }, [prId, editPO]);

  const addItem = (item = null) => {
    setItems(prev => [...prev, {
      item_master_id: item?.id || null, item_code: item?.item_code || '',
      item_name: item?.item_name || '', description: '',
      category_name: item?.category_name || item?.l1_category_name || '',
      uom: item?.uom || 'PCS',
      consumption_uom: item?.consumption_uom || item?.uom || 'PCS',
      uom_conversion: parseFloat(item?.uom_conversion || 1),
      quantity: 1,
      unit_rate: item?.standard_rate || 0,
      gst_rate: item?.gst_rate || item?.effective_category_gst_rate || 0,
    }]);
  };
  const updItem = (i, f, v) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [f]: v } : it));
  const remItem = i => setItems(prev => prev.filter((_, idx) => idx !== i));

  const isIntraState = gstType(form.vendor_gstin) === 'CGST_SGST';
  const vendorIsTaxpayer = form.vendor_is_taxpayer !== false;
  const subtotal = items.reduce((s, it) => s + parseFloat(it.quantity || 0) * parseFloat(it.unit_rate || 0), 0);
  const gstAmt   = items.reduce((s, it) => { const a = parseFloat(it.quantity || 0) * parseFloat(it.unit_rate || 0); return s + a * (parseFloat(it.gst_rate || 0) / 100); }, 0);

  const save = async () => {
    if (!form.vendor_name.trim()) { setErr('Please search and select a vendor'); return; }
    const center_id = parseInt(form.center_id || user.center_id);
    if (!center_id) { setErr('Please select a center'); return; }
    if (!items.length) { setErr('Add at least one item'); return; }
    setSaving(true); setErr('');
    try {
      const url    = editPO ? `/api/procurement/pos/${editPO}` : '/api/procurement/pos';
      const method = editPO ? 'PATCH' : 'POST';
      const r = await api(url, {
        method,
        body: JSON.stringify({ ...form, center_id, pr_id: prId || null, items }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.errors?.[0]?.msg || d.error || 'Save failed'); setSaving(false); return; }
      onSaved(d.po || { id: editPO ? parseInt(editPO) : null });
    } catch { setErr('Network error'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl"
          style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
          <div>
            <p className="text-white font-bold text-base">{editPO ? 'Edit Purchase Order' : 'Create Purchase Order'}</p>
            <p className="text-teal-200 text-xs mt-0.5">{editPO ? 'Revise and resubmit for approval' : prId ? `From PR — ${prItems.length} items pre-filled` : 'Manual PO'}</p>
          </div>
          <button onClick={onCancel} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Vendor */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Vendor <span className="text-red-500">*</span></label>
            <VendorSearch onSelect={v => {
              const isTaxpayer = v?.is_taxpayer ?? true;
              setForm(f => ({
                ...f,
                vendor_name:         v?.vendor_name    || '',
                vendor_address:      [v?.address, v?.city, v?.state].filter(Boolean).join(', '),
                vendor_gstin:        v?.gst_number     || '',
                vendor_email:        v?.email          || '',
                vendor_phone:        v?.phone          || '',
                vendor_is_taxpayer:  isTaxpayer,
              }));
              // Zero out GST on all items if vendor is not a taxpayer
              if (!isTaxpayer) {
                setItems(prev => prev.map(it => ({ ...it, gst_rate: 0 })));
              }
            }} />
          </div>

          {/* Center */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Center <span className="text-red-500">*</span></label>
            <select value={form.center_id} onChange={e => setForm(f => ({ ...f, center_id: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">Select center…</option>
              {centers.filter(c => c.active !== false && c.code === 'CORP').map(c => <option key={c.id} value={c.id}>🏢 {c.name}</option>)}
              {centers.filter(c => c.active !== false && c.code === 'CORP').length > 0 && <option disabled>──────────────</option>}
              {centers.filter(c => c.active !== false && c.code !== 'CORP').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Delivery & PO details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Delivery Date</label>
              <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Payment Terms</label>
              <select value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                {['Immediate','Net 7','Net 15','Net 30','Net 45','Net 60'].map(t =>
                  <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Supplier Quotation Ref <span className="text-red-500">*</span></label>
              <input value={form.quotation_ref} onChange={e => setForm(f => ({ ...f, quotation_ref: e.target.value }))}
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="e.g. QT-2026-0042" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Delivery Address</label>
              <input value={form.delivery_address} onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Full delivery address" />
            </div>
          </div>

          {/* Advance Payment */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="adv_req" checked={form.advance_required}
                onChange={e => setForm(f => ({ ...f, advance_required: e.target.checked, advance_percentage: '', advance_amount: '' }))}
                className="w-4 h-4 accent-amber-600" />
              <label htmlFor="adv_req" className="text-sm font-semibold text-amber-800 cursor-pointer">
                Advance Payment Required
              </label>
              <span className="text-xs text-amber-600">— creates an AP bill immediately on PO issue</span>
            </div>
            {form.advance_required && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Advance %</label>
                  <div className="relative">
                    <input type="number" min="1" max="100" placeholder="e.g. 50"
                      value={form.advance_percentage}
                      onChange={e => {
                        const pct = e.target.value;
                        const advAmt = pct && subtotal + gstAmt > 0
                          ? ((subtotal + gstAmt) * parseFloat(pct) / 100).toFixed(2) : '';
                        setForm(f => ({ ...f, advance_percentage: pct, advance_amount: advAmt }));
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                    <span className="absolute right-3 inset-y-0 flex items-center text-slate-400 text-xs">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Advance Amount ₹</label>
                  <div className="relative">
                    <span className="absolute left-3 inset-y-0 flex items-center text-slate-400 text-sm">₹</span>
                    <input type="number" min="0" placeholder="Auto-calculated"
                      value={form.advance_amount}
                      onChange={e => setForm(f => ({ ...f, advance_amount: e.target.value, advance_percentage: '' }))}
                      className="w-full border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Line Items <span className="text-red-500">*</span></label>
              <button type="button" onClick={() => addItem()}
                className="text-xs px-3 py-1 rounded-lg bg-teal-50 text-teal-700 font-semibold hover:bg-teal-100 transition-colors">
                + Add Row
              </button>
            </div>
            <div className="mb-2">
              <ItemBrowser onSelect={addItem} />
            </div>
            {items.length > 0 && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                      <th className="border border-teal-600 px-2 py-2.5 text-center text-white font-semibold w-8">#</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-left text-white font-semibold w-24">Code</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-left text-white font-semibold">Item Name</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-left text-white font-semibold w-16">UOM</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-right text-white font-semibold w-20">Qty</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-right text-white font-semibold w-28">Rate (₹)</th>
                      <th className="border border-teal-600 px-3 py-2.5 text-right text-white font-semibold w-20">
                        {isIntraState ? 'CGST+SGST' : 'IGST'}
                      </th>
                      <th className="border border-teal-600 px-3 py-2.5 text-right text-white font-semibold w-28">Amount (₹)</th>
                      <th className="border border-teal-600 px-2 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <React.Fragment key={i}>
                        <tr className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="border border-slate-200 px-2 py-2 text-center text-slate-400 font-semibold">{i + 1}</td>
                          <td className="border border-slate-200 px-1 py-1">
                            <span className="block px-2 py-1.5 font-mono text-xs text-slate-600 font-bold">{it.item_code || '—'}</span>
                          </td>
                          <td className="border border-slate-200 px-1 py-1">
                            <input value={it.item_name} onChange={e => updItem(i, 'item_name', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs font-medium text-slate-800 bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded" />
                          </td>
                          <td className="border border-slate-200 px-1 py-1">
                            {it.item_master_id ? (
                              <div className="px-2 py-1.5">
                                <span className="text-xs font-semibold text-teal-700">{it.uom}</span>
                                {it.uom_conversion > 1 && (
                                  <div className="text-[9px] text-slate-400 leading-tight mt-0.5">1 {it.uom} = {it.uom_conversion} {it.consumption_uom}</div>
                                )}
                              </div>
                            ) : (
                              <select value={it.uom} onChange={e => updItem(i, 'uom', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs text-slate-700 bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded">
                                <optgroup label="Physical">{UOM_PHYSICAL.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                                <optgroup label="Service / Time">{UOM_SERVICE.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                                <optgroup label="Digital / Credits">{UOM_DIGITAL.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>
                              </select>
                            )}
                          </td>
                          <td className="border border-slate-200 px-1 py-1">
                            <input type="number" min="0.01" value={it.quantity} onChange={e => updItem(i, 'quantity', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs text-right text-slate-700 bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded" />
                          </td>
                          <td className="border border-slate-200 px-1 py-1">
                            <input type="number" min="0" value={it.unit_rate} onChange={e => updItem(i, 'unit_rate', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs text-right text-slate-700 bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded" />
                          </td>
                          <td className="border border-slate-200 px-1 py-1">
                            {vendorIsTaxpayer ? (
                              <>
                                <input type="number" min="0" max="28" value={it.gst_rate} onChange={e => updItem(i, 'gst_rate', e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs text-right text-slate-700 bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded" />
                                {parseFloat(it.gst_rate) > 0 && (
                                  <div className="text-center text-[9px] text-slate-400 mt-0.5 leading-tight">
                                    {isIntraState
                                      ? `${parseFloat(it.gst_rate)/2}%+${parseFloat(it.gst_rate)/2}%`
                                      : `IGST`}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-center text-[10px] text-amber-600 font-medium py-1.5">0%</div>
                            )}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right font-bold text-teal-700 whitespace-nowrap">
                            {fmt(parseFloat(it.quantity || 0) * parseFloat(it.unit_rate || 0))}
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <button type="button" onClick={() => remItem(i)}
                              className="w-5 h-5 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 font-bold text-sm transition-colors mx-auto">×</button>
                          </td>
                        </tr>
                        <tr className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="border border-slate-200 px-2 py-1 text-center text-slate-300 text-[10px]">↳</td>
                          <td colSpan={7} className="border border-slate-200 px-1 py-1">
                            <input value={it.description || ''} onChange={e => updItem(i, 'description', e.target.value)}
                              className="w-full px-2 py-1 text-[11px] text-slate-500 italic bg-transparent focus:outline-none focus:bg-teal-50 focus:ring-1 focus:ring-teal-400 rounded placeholder:text-slate-300 placeholder:not-italic"
                              placeholder="Notes / brand / specification (optional)" />
                          </td>
                          <td className="border border-slate-200"></td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50">
                      <td colSpan={8} className="border border-slate-200 px-3 py-2 text-right text-xs font-semibold text-slate-500">Subtotal</td>
                      <td className="border border-slate-200 px-3 py-2 text-right text-xs font-bold text-slate-700">{fmt(subtotal)}</td>
                      <td className="border border-slate-200"></td>
                    </tr>
                    {gstAmt > 0 && isIntraState && (() => {
                      const half = parseFloat((gstAmt / 2).toFixed(2));
                      return (<>
                        <tr className="bg-slate-50">
                          <td colSpan={8} className="border border-slate-200 px-3 py-2 text-right text-xs font-semibold text-slate-500">CGST</td>
                          <td className="border border-slate-200 px-3 py-2 text-right text-xs font-bold text-slate-700">{fmt(half)}</td>
                          <td className="border border-slate-200"></td>
                        </tr>
                        <tr className="bg-slate-50">
                          <td colSpan={8} className="border border-slate-200 px-3 py-2 text-right text-xs font-semibold text-slate-500">SGST</td>
                          <td className="border border-slate-200 px-3 py-2 text-right text-xs font-bold text-slate-700">{fmt(gstAmt - half)}</td>
                          <td className="border border-slate-200"></td>
                        </tr>
                      </>);
                    })()}
                    {gstAmt > 0 && !isIntraState && (
                      <tr className="bg-slate-50">
                        <td colSpan={8} className="border border-slate-200 px-3 py-2 text-right text-xs font-semibold text-slate-500">IGST</td>
                        <td className="border border-slate-200 px-3 py-2 text-right text-xs font-bold text-slate-700">{fmt(gstAmt)}</td>
                        <td className="border border-slate-200"></td>
                      </tr>
                    )}
                    <tr className="bg-teal-50">
                      <td colSpan={8} className="border border-slate-200 px-3 py-2.5 text-right text-xs font-bold text-teal-800">Total</td>
                      <td className="border border-slate-200 px-3 py-2.5 text-right text-sm font-extrabold text-teal-700">{fmt(subtotal + gstAmt)}</td>
                      <td className="border border-slate-200"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Terms & Conditions</label>
              <textarea value={form.terms_conditions} onChange={e => setForm(f => ({ ...f, terms_conditions: e.target.value }))}
                rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
            </div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex-shrink-0 flex gap-3">
          <button onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-all"
            style={{ background: saving ? '#94a3b8' : 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
            {saving ? 'Creating PO…' : 'Create Purchase Order'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── Main Procurement Page ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';
const CorpBadge = ({ code }) => code === 'CORP'
  ? <span className="ml-1 px-1.5 py-0.5 text-[9px] font-black tracking-wide bg-indigo-100 text-indigo-700 rounded-full border border-indigo-200 uppercase">Corp</span>
  : null;

export default function Procurement() {
  const { has } = getPermissions();
  const [tab, setTab]         = useState('prs');
  const [prs, setPrs]         = useState([]);
  const [pos, setPos]         = useState([]);
  const [matrix, setMatrix]   = useState([]);
  const [allUsers, setUsers]  = useState([]);
  const [centers, setCenters] = useState([]);
  const [notifs, setNotifs]   = useState([]);
  const [unread, setUnread]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNotifs, setShowNotifs] = useState(false);

  // Filters
  const [prStatus, setPrStatus]   = useState('');
  const [poStatus, setPoStatus]   = useState('');
  const [myApprovals, setMyAppr]  = useState(false);

  // Modals
  const [showPRForm, setShowPRForm] = useState(false);
  const [showPRDetail, setDetail]   = useState(null);
  const [showPOForm, setShowPOForm] = useState(null); // null | prId
  const [showPODetail, setPODetail] = useState(null);

  // Approval matrix form
  const [matrixForm, setMForm] = useState({ user_id: '', level: '1', center_id: '' });
  const [matSaving, setMatSav] = useState(false);
  const [matMsg, setMatMsg]    = useState(null); // { type: 'success'|'error', text }

  // GRN state
  const [grns, setGrns] = useState([]);
  const [grnLoading, setGrnLoading] = useState(false);
  const [grnModal, setGrnModal] = useState(null); // null | { po: poObject }
  const [, setPendingItems] = useState([]);
  const [grnForm, setGrnForm] = useState({ receipt_date: today(), notes: '', items: [] });
  const [grnSaving, setGrnSaving] = useState(false);
  const [grnMsg, setGrnMsg] = useState('');
  const [grnPostErr, setGrnPostErr] = useState('');
  const [grnApproveModal, setGrnApproveModal] = useState(null); // kept for backward compat (unused)
  const [editPOId, setEditPOId] = useState(null); // PO id to edit

  const loadPRs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (prStatus)  params.set('status', prStatus);
    if (myApprovals) params.set('my_approvals', 'true');
    const r = await api(`/api/procurement/prs?${params}&limit=50`);
    const d = await r.json();
    setPrs(d.prs || []);
    setLoading(false);
  }, [prStatus, myApprovals]);

  const loadPOs = useCallback(async () => {
    const params = new URLSearchParams();
    if (poStatus) params.set('status', poStatus);
    const r = await api(`/api/procurement/pos?${params}&limit=50`);
    const d = await r.json();
    setPos(d.pos || []);
  }, [poStatus]);

  const loadMatrix = useCallback(async () => {
    const r = await api('/api/procurement/approval-matrix');
    const d = await r.json();
    setMatrix(d.matrix || []);
  }, []);

  const loadGRNs = useCallback(async () => {
    setGrnLoading(true);
    const r = await api('/api/grn');
    const d = await r.json();
    setGrns(d.receipts || []);
    setGrnLoading(false);
  }, []);

  const loadNotifs = useCallback(async () => {
    const r = await api('/api/procurement/notifications');
    const d = await r.json();
    setNotifs(d.notifications || []);
    setUnread(d.unread || 0);
  }, []);

  useEffect(() => {
    Promise.all([
      api('/api/centers').then(r => r.json()).then(d => setCenters(d.centers || d || [])),
      api('/api/users').then(r => r.json()).then(d => setUsers(d.users || d || [])).catch(() => {}),
    ]);
    loadNotifs();
  }, [loadNotifs]);

  useEffect(() => { if (tab === 'prs') loadPRs(); }, [tab, loadPRs]);
  useEffect(() => { if (tab === 'pos') loadPOs(); }, [tab, loadPOs]);
  useEffect(() => { if (tab === 'matrix') loadMatrix(); }, [tab, loadMatrix]);
  useEffect(() => { if (tab === 'grn') loadGRNs(); }, [tab, loadGRNs]);

  const markAllRead = async () => {
    await api('/api/procurement/notifications/read-all', { method: 'PATCH', body: '{}' });
    loadNotifs();
  };

  const addMatrixEntry = async () => {
    if (!matrixForm.user_id) return;
    setMatSav(true);
    setMatMsg(null);
    try {
      const r = await api('/api/procurement/approval-matrix', {
        method: 'POST',
        body: JSON.stringify({
          user_id:   parseInt(matrixForm.user_id, 10),
          level:     parseInt(matrixForm.level, 10),
          center_id: matrixForm.center_id ? parseInt(matrixForm.center_id, 10) : null,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.errors || d.success === false) {
        const msg = d.errors ? d.errors.map(e => e.msg).join(', ') : (d.error || 'Failed to add approver');
        setMatMsg({ type: 'error', text: msg });
      } else {
        setMatMsg({ type: 'success', text: 'Approver added successfully' });
        setMForm({ user_id: '', level: '1', center_id: '' });
        loadMatrix();
      }
    } catch {
      setMatMsg({ type: 'error', text: 'Network error — could not add approver' });
    }
    setMatSav(false);
  };

  const removeMatrixEntry = async (id) => {
    setMatMsg(null);
    try {
      const r = await api(`/api/procurement/approval-matrix/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok || d.success === false) {
        setMatMsg({ type: 'error', text: d.error || 'Failed to remove approver' });
      } else {
        setMatMsg({ type: 'success', text: 'Approver removed' });
        loadMatrix();
      }
    } catch {
      setMatMsg({ type: 'error', text: 'Network error — could not remove approver' });
    }
  };

  const openReceiveModal = async (po) => {
    // Check pending items — block if nothing left to receive
    const r = await api(`/api/grn/po/${po.id}/pending-items`);
    const d = await r.json();
    if (!d.items?.length) {
      setGrnPostErr('All items for this PO have already been received.');
      return;
    }
    const items = (d.items || []).map(i => ({
      po_item_id: i.id,
      item_name: i.item_name,
      uom: i.uom,
      ordered_qty: parseFloat(i.quantity),
      received_so_far: parseFloat(i.received_qty || 0),
      pending_qty: parseFloat(i.pending_qty),
      unit_rate: parseFloat(i.unit_rate),
      received_qty: parseFloat(i.pending_qty), // default to full pending
      batch_number: '',
      expiry_date: '',
    }));
    setPendingItems(items);
    setGrnForm({ receipt_date: today(), notes: '', items });
    setGrnModal({ po });
  };

  const createGRN = async () => {
    if (!grnModal) return;
    const items = grnForm.items.filter(i => parseFloat(i.received_qty) > 0);
    if (!items.length) return setGrnMsg('Enter received qty for at least one item');
    setGrnSaving(true);
    setGrnMsg('');
    try {
      const body = {
        po_id: grnModal.po.id,
        receipt_date: grnForm.receipt_date,
        notes: grnForm.notes,
        items: items.map(i => ({
          po_item_id: i.po_item_id,
          received_qty: parseFloat(i.received_qty),
          batch_number: i.batch_number || undefined,
          expiry_date: i.expiry_date || undefined,
        })),
      };
      const r = await api('/api/grn', { method: 'POST', body: JSON.stringify(body) });
      const d = await r.json();
      if (d.success) {
        setGrnModal(null);
        setGrnMsg('');
        loadGRNs();
        if (d.po_completed) {
          setPos(prev => prev.map(p => p.id === grnModal.po.id ? { ...p, status: 'COMPLETED' } : p));
        }
        loadPOs(); // full refresh
      } else {
        setGrnMsg(d.error || d.errors?.[0]?.msg || 'Failed to create GRN');
      }
    } catch (_) { setGrnMsg('Network error'); }
    setGrnSaving(false);
  };


  const postGRN = async (id) => {
    if (!window.confirm('Post this GRN? Stock quantities will be updated.')) return;
    setGrnPostErr('');
    try {
      const r = await api(`/api/grn/${id}/post`, { method: 'POST', body: '{}' });
      const d = await r.json();
      if (d.success) {
        loadGRNs(); loadPOs();
        if (d.warnings?.length) setGrnPostErr(`Posted with warnings: ${d.warnings.join(' | ')}`);
      } else {
        setGrnPostErr(d.error || 'Failed to post GRN');
      }
    } catch { setGrnPostErr('Network error — GRN not posted'); }
  };

  const openApproveModal = async (id) => {
    try {
      const r = await api(`/api/grn/${id}`);
      const d = await r.json();
      if (d.success) setGrnApproveModal({ receipt: d.receipt, items: d.items });
      else setGrnPostErr(d.error || 'Failed to load GRN details');
    } catch { setGrnPostErr('Network error'); }
  };

  const confirmApproveGRN = async () => {
    if (!grnApproveModal) return;
    setGrnPostErr('');
    try {
      const r = await api(`/api/grn/${grnApproveModal.receipt.id}/approve`, { method: 'POST', body: '{}' });
      const d = await r.json();
      if (d.success) { setGrnApproveModal(null); loadGRNs(); }
      else setGrnPostErr(d.error || 'Failed to approve GRN');
    } catch { setGrnPostErr('Network error — GRN not approved'); }
  };

  const handlePOCreated = async (po) => {
    setShowPOForm(null);
    await Promise.all([loadPRs(), loadPOs()]);
    setPODetail(po.id);
  };

  const prCounts = {
    all: prs.length,
    pending: prs.filter(p => ['SUBMITTED','L1_APPROVED'].includes(p.status)).length,
    approved: prs.filter(p => p.status === 'APPROVED').length,
    pending_po: prs.filter(p => p.status === 'PO_PENDING').length,
    ordered: prs.filter(p => p.status === 'PO_CREATED').length,
  };

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Page Header */}
      <div style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }} className="px-6 py-5 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center text-2xl shadow-inner">🛒</div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-tight">Procurement</h1>
              <p className="text-teal-200 text-xs mt-0.5">Purchase Requisitions · Purchase Orders · Approvals</p>
            </div>
          </div>
          {/* Notification bell */}
          <div className="relative">
            <button onClick={() => setShowNotifs(s => !s)}
              className="relative w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-bold text-slate-700">Notifications</p>
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-xs text-teal-600 font-semibold hover:text-teal-700">Mark all read</button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {notifs.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No notifications</p>
                  ) : notifs.map(n => (
                    <div key={n.id} className={`px-4 py-3 ${!n.is_read ? 'bg-teal-50' : ''}`}>
                      <p className="text-xs font-semibold text-slate-700">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{fmtD(n.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Workflow banner */}
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 overflow-x-auto whitespace-nowrap pb-1">
          {[
            { icon: '📝', label: 'Create PR', sub: 'Requester' },
            { icon: '→' },
            { icon: '✅', label: 'L1 Approval', sub: 'Center Admin' },
            { icon: '→' },
            { icon: '✅', label: 'L2 Approval', sub: 'Director' },
            { icon: '→' },
            { icon: '📄', label: 'Create PO', sub: 'Procurement' },
            { icon: '→' },
            { icon: '📦', label: 'Issue & Deliver', sub: 'Vendor' },
          ].map((s, i) => s.icon === '→' ? (
            <span key={i} className="text-slate-300 font-bold text-base">›</span>
          ) : (
            <div key={i} className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-1.5 border border-slate-200 shadow-sm flex-shrink-0">
              <span>{s.icon}</span>
              <div>
                <p className="font-semibold text-slate-700">{s.label}</p>
                <p className="text-[10px] text-slate-400">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs + Actions */}
      <div className="max-w-7xl mx-auto px-6 pb-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
            {[
              { key: 'prs', label: 'Purchase Requisitions' },
              { key: 'pos', label: 'Purchase Orders' },
              { key: 'grn', label: 'Goods Receipts' },
              { key: 'matrix', label: 'Approval Matrix' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={tab === t.key
                  ? { background: 'linear-gradient(135deg,#0f766e,#0d9488)', color: '#fff' }
                  : { color: '#64748b' }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {tab === 'prs' && has('PR_WRITE') && (
              <button onClick={() => setShowPRForm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold shadow-sm"
                style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                <span>+</span> New PR
              </button>
            )}
            {tab === 'pos' && has('PO_WRITE') && (
              <button onClick={() => setShowPOForm('manual')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold shadow-sm"
                style={{ background: 'linear-gradient(135deg,#1e3a5f,#2563eb)' }}>
                <span>+</span> New PO
              </button>
            )}
          </div>
        </div>

        {/* ── PR Tab ── */}
        {tab === 'prs' && (
          <div className="space-y-3">
            {/* Summary chips + filters */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-3">
              <div className="flex gap-2">
                {[
                  { label: `All (${prCounts.all})`, val: '' },
                  { label: `⏳ Pending (${prCounts.pending})`, val: 'SUBMITTED' },
                  { label: `✓ Approved (${prCounts.approved})`, val: 'APPROVED' },
                  { label: `🕐 PO In Approval (${prCounts.pending_po})`, val: 'PO_PENDING' },
                  { label: `📦 Ordered (${prCounts.ordered})`, val: 'PO_CREATED' },
                  { label: 'Rejected', val: 'REJECTED' },
                  { label: 'Draft', val: 'DRAFT' },
                ].map(f => (
                  <button key={f.val} onClick={() => setPrStatus(f.val)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold transition-all border"
                    style={prStatus === f.val
                      ? { background: '#0d9488', color: '#fff', borderColor: '#0d9488' }
                      : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }}>
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer ml-auto">
                <input type="checkbox" checked={myApprovals} onChange={e => setMyAppr(e.target.checked)}
                  className="rounded border-slate-300 text-teal-500 focus:ring-teal-500" />
                Pending My Approval
              </label>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 gap-3 text-slate-400">
                <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                Loading…
              </div>
            ) : prs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 text-center">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-slate-500 font-medium">No purchase requisitions found</p>
                <p className="text-slate-400 text-sm mt-1">Create a new PR to get started</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table style={{ minWidth: 900 }} className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                        <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">PR #</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Title</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Center</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Requested By</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Priority</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Est. Amount</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Status</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Date</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {prs.map(pr => (
                        <tr key={pr.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs font-bold text-teal-700">{pr.pr_number}</td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-800 text-sm">{pr.title}</p>
                            {pr.department && <p className="text-xs text-slate-400">{pr.department}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{pr.center_name}<CorpBadge code={pr.center_code} /></td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{pr.requester_name}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="text-xs font-bold" style={{ color: PRIORITY[pr.priority]?.color || '#64748b' }}>
                              {PRIORITY[pr.priority]?.label || pr.priority}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-700 text-xs">{fmt(pr.total_estimated)}</td>
                          <td className="px-4 py-2.5 text-center"><Badge cfg={PR_STATUS[pr.status]} text={pr.status} /></td>
                          <td className="px-4 py-2.5 text-center text-xs text-slate-500">{fmtD(pr.created_at)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => setDetail(pr.id)}
                                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-teal-50 hover:text-teal-700 font-semibold transition-colors">
                                View
                              </button>
                              {pr.status === 'APPROVED' && has('PO_WRITE') && (
                                <button onClick={() => setShowPOForm(pr.id)}
                                  className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold transition-colors whitespace-nowrap">
                                  + PO
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PO Tab ── */}
        {tab === 'pos' && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2">
              {[
                { label: 'All', val: '' },
                { label: '📄 Draft', val: 'DRAFT' },
                { label: '⏳ Pending Approval', val: 'PENDING_APPROVAL' },
                { label: '✉ Issued', val: 'ISSUED' },
                { label: '✓ Completed', val: 'COMPLETED' },
                { label: '✕ Cancelled', val: 'CANCELLED' },
              ].map(f => (
                <button key={f.val} onClick={() => setPoStatus(f.val)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all border"
                  style={poStatus === f.val
                    ? { background: '#2563eb', color: '#fff', borderColor: '#2563eb' }
                    : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }}>
                  {f.label}
                </button>
              ))}
            </div>

            {pos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 text-center">
                <div className="text-4xl mb-3">📦</div>
                <p className="text-slate-500 font-medium">No purchase orders yet</p>
                <p className="text-slate-400 text-sm mt-1">Create a PO from an approved PR or manually</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table style={{ minWidth: 860 }} className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                        <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">PO #</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Vendor</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">PR Ref</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Center</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Total</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Status</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Date</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pos.map(po => (
                        <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs font-bold text-blue-700">{po.po_number}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-800 text-xs">{po.vendor_name}</td>
                          <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{po.pr_number || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{po.center_name}<CorpBadge code={po.center_code} /></td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-700 text-xs">{fmt(po.total_amount)}</td>
                          <td className="px-4 py-2.5 text-center"><Badge cfg={PO_STATUS[po.status]} text={po.status} /></td>
                          <td className="px-4 py-2.5 text-center text-xs text-slate-500">{fmtD(po.created_at)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => setPODetail(po.id)}
                                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700 font-semibold transition-colors">
                                View
                              </button>
                              {['ISSUED','ACKNOWLEDGED'].includes(po.status) && (
                                <button onClick={() => openReceiveModal(po)}
                                  className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-semibold transition-colors">
                                  Receive
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── GRN Tab ── */}
        {tab === 'grn' && (
          <div className="space-y-3">
            {grnPostErr && (
              <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                <span>{grnPostErr}</span>
                <button onClick={() => setGrnPostErr('')} className="ml-auto text-red-400 hover:text-red-600 font-bold">×</button>
              </div>
            )}
            {grnLoading ? (
              <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : grns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 text-center">
                <div className="text-4xl mb-3">📥</div>
                <p className="text-slate-500 font-medium">No goods receipts yet</p>
                <p className="text-slate-400 text-sm mt-1">Go to Purchase Orders and click "Receive" on an issued PO</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table style={{ minWidth: 820 }} className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                        {['GRN #','PO #','Vendor','Center','Date','Qty','Value','Status','Actions'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {grns.map(g => (
                        <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs font-bold text-teal-700">{g.grn_number}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-blue-700">{g.po_number}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-700">{g.vendor_name}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{g.center_name}<CorpBadge code={g.center_code} /></td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{fmtD(g.receipt_date)}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-medium text-slate-700">{parseFloat(g.total_qty).toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-slate-700">{fmt(g.total_value)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              g.status === 'APPROVED'  ? 'bg-amber-100 text-amber-700' :
                              g.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                              g.status === 'POSTED'    ? 'bg-amber-100 text-amber-700' :
                              g.status === 'DRAFT'     ? 'bg-slate-100 text-slate-500' :
                              g.status === 'CANCELLED' ? 'bg-red-100 text-red-600' :
                              'bg-slate-100 text-slate-500'}`}>
                              {g.status === 'APPROVED' ? 'Posted' : g.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5"></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Approval Matrix Tab ── */}
        {tab === 'matrix' && (
          <div className="space-y-4">
            {matMsg && (
              <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${matMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                {matMsg.text}
              </div>
            )}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-700 mb-3">Add Approver</p>
              <div className="grid grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">User</label>
                  <select value={matrixForm.user_id} onChange={e => setMForm(f => ({ ...f, user_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">Select user…</option>
                    {allUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Level</label>
                  <select value={matrixForm.level} onChange={e => setMForm(f => ({ ...f, level: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="1">Level 1 — Center Admin</option>
                    <option value="2">Level 2 — Director</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Center (blank = all)</label>
                  <select value={matrixForm.center_id} onChange={e => setMForm(f => ({ ...f, center_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">All Centers</option>
                    {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <button onClick={addMatrixEntry} disabled={!matrixForm.user_id || matSaving}
                  className="py-2 px-4 rounded-xl text-white font-bold text-sm"
                  style={{ background: matSaving || !matrixForm.user_id ? '#94a3b8' : 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                  {matSaving ? 'Adding…' : '+ Add'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Approver</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Level</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Center Scope</th>
                    <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matrix.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">No approvers configured yet</td></tr>
                  ) : matrix.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-800">{m.name}</p>
                        <p className="text-xs text-slate-400">{m.email}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{m.role}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${m.level === 1 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          L{m.level} — {m.level === 1 ? 'Center Admin' : 'Director'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{m.center_name || 'All Centers'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => removeMatrixEntry(m.id)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-semibold transition-colors">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PO Detail Modal */}
      {showPODetail && <PODetailModal poId={showPODetail} onClose={() => { setPODetail(null); loadPOs(); }} onUpdated={loadPOs}
        onEdit={id => { setPODetail(null); setEditPOId(id); }}
        onReceive={po => { setPODetail(null); openReceiveModal(po); }} />}

      {/* Modals */}
      {showPRForm && <PRForm centers={centers} onSaved={() => { setShowPRForm(false); loadPRs(); }} onCancel={() => setShowPRForm(false)} />}
      {showPRDetail && <PRDetail prId={showPRDetail} onClose={() => setDetail(null)} onUpdated={() => { setDetail(null); loadPRs(); }} />}
      {showPOForm && <POForm centers={centers} prId={showPOForm === 'manual' ? null : showPOForm} onSaved={handlePOCreated} onCancel={() => setShowPOForm(null)} />}
      {editPOId && <POForm centers={centers} editPO={editPOId} onSaved={po => { setEditPOId(null); loadPOs(); setPODetail(po.id); }} onCancel={() => setEditPOId(null)} />}

      {/* ── GRN Create Modal ── */}
      {grnModal && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Goods Receipt — {grnModal.po.po_number}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{grnModal.po.vendor_name} · {grnModal.po.center_name}</p>
              </div>
              <button onClick={() => setGrnModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">×</button>
            </div>
            <div className="px-6 py-5">
              {grnMsg && <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">{grnMsg}</div>}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelCls}>Receipt Date *</label>
                  <input type="date" value={grnForm.receipt_date}
                    onChange={e => setGrnForm(f => ({ ...f, receipt_date: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <input type="text" value={grnForm.notes}
                    onChange={e => setGrnForm(f => ({ ...f, notes: e.target.value }))}
                    className={inputCls} placeholder="Optional delivery note / reference" />
                </div>
              </div>
              <table className="w-full text-sm border-collapse mb-4">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase">Item</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 uppercase">Ordered</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 uppercase">Pending</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 uppercase">Receiving</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase">Batch</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grnForm.items.map((item, idx) => (
                    <tr key={item.po_item_id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800 text-xs">{item.item_name}</div>
                        <div className="text-slate-400 text-xs">{item.uom} · {fmt(item.unit_rate)}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-slate-500">{item.ordered_qty}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-amber-600">{item.pending_qty}</td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" max={item.pending_qty} step="0.01"
                          value={item.received_qty}
                          onChange={e => {
                            const items = [...grnForm.items];
                            items[idx] = { ...items[idx], received_qty: e.target.value };
                            setGrnForm(f => ({ ...f, items }));
                          }}
                          className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-teal-400" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={item.batch_number}
                          onChange={e => {
                            const items = [...grnForm.items];
                            items[idx] = { ...items[idx], batch_number: e.target.value };
                            setGrnForm(f => ({ ...f, items }));
                          }}
                          placeholder="Batch #"
                          className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="date" value={item.expiry_date}
                          onChange={e => {
                            const items = [...grnForm.items];
                            items[idx] = { ...items[idx], expiry_date: e.target.value };
                            setGrnForm(f => ({ ...f, items }));
                          }}
                          className="w-32 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button onClick={() => setGrnModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm font-semibold">Cancel</button>
                {has('GRN_WRITE') && (
                <button onClick={createGRN} disabled={grnSaving}
                  className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                  {grnSaving ? 'Saving…' : 'Create GRN (Draft)'}
                </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PO Detail Modal ────────────────────────────────────────────────────────────
function PODetailModal({ poId, onClose, onUpdated, onEdit, onReceive }) {
  const user    = currentUser();
  const { has: hasPerm } = getPermissions();
  const [data, setData]         = useState(null);
  const [saving, setSaving]     = useState(false);
  const [actionMode, setAction] = useState(null); // 'reject'
  const [reason, setReason]     = useState('');
  const [comments, setComments] = useState('');
  const [msg, setMsg]           = useState(null);

  const load = () => api(`/api/procurement/pos/${poId}`).then(r => r.json()).then(d => setData(d));
  useEffect(() => { load(); }, [poId]);

  const updateStatus = async (status) => {
    setSaving(true);
    await api(`/api/procurement/pos/${poId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
    setSaving(false);
    if (onUpdated) onUpdated();
  };

  const submitForApproval = async () => {
    setSaving(true); setMsg(null);
    const r = await api(`/api/procurement/pos/${poId}/submit`, { method: 'POST', body: '{}' });
    const d = await r.json();
    if (r.ok) { setMsg({ type: 'success', text: 'PO submitted for approval — approvers notified' }); await load(); if (onUpdated) onUpdated(); }
    else setMsg({ type: 'error', text: d.error || 'Failed to submit' });
    setSaving(false);
  };

  const approvePO = async () => {
    setSaving(true); setMsg(null);
    const r = await api(`/api/procurement/pos/${poId}/approve`, { method: 'POST', body: JSON.stringify({ comments }) });
    const d = await r.json();
    if (r.ok) { setMsg({ type: 'success', text: 'PO approved and issued' }); await load(); if (onUpdated) onUpdated(); }
    else setMsg({ type: 'error', text: d.error || 'Failed to approve' });
    setSaving(false);
  };

  const rejectPO = async () => {
    if (!reason.trim() || reason.trim().length < 5) { setMsg({ type: 'error', text: 'Enter a reason (min 5 chars)' }); return; }
    setSaving(true); setMsg(null);
    const r = await api(`/api/procurement/pos/${poId}/reject-approval`, { method: 'POST', body: JSON.stringify({ reason }) });
    const d = await r.json();
    if (r.ok) { setMsg({ type: 'success', text: 'PO sent back for revision' }); setAction(null); await load(); if (onUpdated) onUpdated(); }
    else setMsg({ type: 'error', text: d.error || 'Failed to reject' });
    setSaving(false);
  };

  if (!data) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const { po, items = [] } = data;
  const poSt = PO_STATUS[po.status] || {};
  const role  = (user.role || '').toUpperCase();

  const isCreator   = parseInt(user.id) === parseInt(po.created_by);
  const isL2        = ['SUPER_ADMIN','CENTER_MANAGER','PROCUREMENT_L2','PROCUREMENT_MANAGER'].includes(role);
  const canSubmit   = po.status === 'DRAFT' && (isCreator || ['SUPER_ADMIN','CENTER_MANAGER'].includes(role)) && hasPerm('PO_WRITE');
  const canApprove  = po.status === 'PENDING_APPROVAL' && isL2 && hasPerm('PO_APPROVE');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="px-6 py-4 flex items-start justify-between flex-shrink-0 rounded-t-2xl"
          style={{ background: 'linear-gradient(135deg,#1e3a5f,#1e40af)' }}>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-white font-bold text-base">{po.po_number}</p>
              <Badge cfg={poSt} text={po.status === 'PENDING_APPROVAL' ? 'Pending Approval' : po.status} />
            </div>
            <p className="text-blue-200 text-xs mt-0.5">{po.vendor_name}{po.pr_number ? ` · PR: ${po.pr_number}` : ''}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {msg && (
            <div className={`mx-6 mt-4 px-4 py-2.5 rounded-xl text-sm font-medium border ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
              {msg.text}
            </div>
          )}

          <div className="px-6 pt-4 pb-3 border-b border-slate-100">
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Center', po.center_name], ['Date', fmtD(po.created_at)],
                ['Delivery Date', fmtD(po.delivery_date)], ['Payment Terms', po.payment_terms],
                ['Vendor GSTIN', po.vendor_gstin || '—'], ['Created By', po.creator_name],
              ].map(([l, v]) => (
                <div key={l} className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{l}</p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">{v}</p>
                </div>
              ))}
            </div>
            {po.vendor_address && <p className="text-xs text-slate-500 mt-2"><b>Address:</b> {po.vendor_address}</p>}
            {po.rejection_reason && (
              <div className="mt-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs font-semibold text-red-700">Sent back for revision:</p>
                <p className="text-xs text-red-600 mt-0.5">{po.rejection_reason}</p>
              </div>
            )}
          </div>

          <div className="px-6 py-3 border-b border-slate-100">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Line Items</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left pb-1.5 font-semibold text-slate-500">Item</th>
                  <th className="text-center pb-1.5 font-semibold text-slate-500">Qty / UOM</th>
                  <th className="text-right pb-1.5 font-semibold text-slate-500">Rate</th>
                  <th className="text-right pb-1.5 font-semibold text-slate-500">GST</th>
                  <th className="text-right pb-1.5 font-semibold text-slate-500">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-1.5 font-medium text-slate-700">{it.item_name}
                      {it.description && <span className="block text-[10px] text-slate-400">{it.description}</span>}
                    </td>
                    <td className="py-1.5 text-center">{it.quantity} {it.uom}</td>
                    <td className="py-1.5 text-right">{fmt(it.unit_rate)}</td>
                    <td className="py-1.5 text-right">{it.gst_rate}%</td>
                    <td className="py-1.5 text-right font-bold text-blue-700">{fmt(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={4} className="py-1 text-right text-xs text-slate-500">Subtotal</td><td className="py-1 text-right font-semibold">{fmt(po.subtotal)}</td></tr>
                {po.gst_amount > 0 && (() => {
                  const intra = gstType(po.vendor_gstin, po.center_state_code) === 'CGST_SGST';
                  const half  = parseFloat((po.gst_amount / 2).toFixed(2));
                  return intra ? (<>
                    <tr><td colSpan={4} className="py-1 text-right text-xs text-slate-500">CGST</td><td className="py-1 text-right font-semibold">{fmt(half)}</td></tr>
                    <tr><td colSpan={4} className="py-1 text-right text-xs text-slate-500">SGST</td><td className="py-1 text-right font-semibold">{fmt(po.gst_amount - half)}</td></tr>
                  </>) : (
                    <tr><td colSpan={4} className="py-1 text-right text-xs text-slate-500">IGST</td><td className="py-1 text-right font-semibold">{fmt(po.gst_amount)}</td></tr>
                  );
                })()}
                <tr className="border-t border-slate-200">
                  <td colSpan={4} className="py-2 text-right text-xs font-bold text-slate-700">Total</td>
                  <td className="py-2 text-right text-sm font-extrabold text-blue-700">{fmt(po.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {po.notes && (
            <div className="px-6 py-3 border-b border-slate-100">
              <p className="text-xs text-slate-500"><b>Notes:</b> {po.notes}</p>
            </div>
          )}

          {/* ── Submit for Approval ── */}
          {canSubmit && (
            <div className="px-6 py-4 border-b border-slate-100 bg-amber-50">
              <p className="text-xs font-bold text-amber-800 mb-2">This PO is in draft — submit it for approval to issue to the vendor.</p>
              <button onClick={submitForApproval} disabled={saving}
                className="px-5 py-2 rounded-xl text-white text-sm font-bold"
                style={{ background: saving ? '#94a3b8' : '#d97706' }}>
                {saving ? 'Submitting…' : '▶ Submit for Approval'}
              </button>
            </div>
          )}

          {canApprove && actionMode !== 'reject' && (
            <div className="px-6 py-4 border-b border-slate-100 bg-blue-50">
              <p className="text-xs font-bold text-blue-800 mb-2">This PO is awaiting your approval.</p>
              <div className="flex items-center gap-2 mb-2">
                <input value={comments} onChange={e => setComments(e.target.value)}
                  placeholder="Optional comments…"
                  className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
              </div>
              <div className="flex gap-2">
                <button onClick={approvePO} disabled={saving}
                  className="px-5 py-2 rounded-xl text-white text-sm font-bold"
                  style={{ background: saving ? '#94a3b8' : '#16a34a' }}>
                  {saving ? 'Processing…' : '✓ Approve & Issue'}
                </button>
                <button onClick={() => setAction('reject')} disabled={saving}
                  className="px-5 py-2 rounded-xl text-white text-sm font-bold bg-red-500 hover:bg-red-600">
                  ✕ Send Back
                </button>
              </div>
            </div>
          )}

          {canApprove && actionMode === 'reject' && (
            <div className="px-6 py-4 border-b border-slate-100 bg-red-50">
              <p className="text-xs font-bold text-red-800 mb-2">Send back for revision — provide reason:</p>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                placeholder="Enter reason for sending back (min 5 chars)…"
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400 bg-white resize-none mb-2" />
              <div className="flex gap-2">
                <button onClick={rejectPO} disabled={saving}
                  className="px-5 py-2 rounded-xl text-white text-sm font-bold bg-red-600 hover:bg-red-700">
                  {saving ? 'Sending…' : 'Confirm Send Back'}
                </button>
                <button onClick={() => setAction(null)}
                  className="px-4 py-2 rounded-xl text-sm text-slate-600 bg-slate-100 hover:bg-slate-200">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Status Transitions (ISSUED and beyond) ── */}
          {!['DRAFT','PENDING_APPROVAL','COMPLETED','CANCELLED'].includes(po.status) && (
            <div className="px-6 py-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Update Status</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { s: 'ACKNOWLEDGED', label: '✓ Acknowledged', bg: '#0891b2' },
                  { s: 'COMPLETED',    label: '📦 Receive Goods', bg: '#16a34a' },
                  { s: 'CANCELLED',    label: '✕ Cancel',         bg: '#dc2626' },
                ].filter(b => PO_TRANSITIONS[po.status]?.includes(b.s)).map(b => (
                  <button key={b.s}
                    onClick={() => b.s === 'COMPLETED' && onReceive ? onReceive(po) : updateStatus(b.s)}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl text-white text-xs font-bold"
                    style={{ background: saving ? '#94a3b8' : b.bg }}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 flex-shrink-0 flex justify-between items-center">
          <div className="flex gap-2">
            <button onClick={() => printPO(po, items)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              Print PO
            </button>
            {po.status === 'DRAFT' && onEdit && (
              <button onClick={() => onEdit(po.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
                Edit PO
              </button>
            )}
          </div>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200">Close</button>
        </div>
      </div>
    </div>
  );
}
