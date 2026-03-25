import { useState, useEffect, useCallback } from 'react';
import { getPermissions } from '../utils/permissions';

const hasPermission = p => getPermissions().has(p);

const token = () => localStorage.getItem('token');
const api = (path, opts = {}) => fetch(path, {
  ...opts,
  headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...opts.headers },
});

const fmt = n => `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const calcAge = dob => {
  if (!dob) return '—';
  const y = new Date().getFullYear() - new Date(dob).getFullYear();
  return `${y} yrs`;
};

const STATUS_STYLE = {
  PAID:      { bg: '#dcfce7', color: '#166534', label: 'Paid' },
  BILLED:    { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b', label: 'Cancelled' },
  REFUNDED:  { bg: '#e0f2fe', color: '#075985', label: 'Refunded' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_STYLE[status] || { bg: '#f1f5f9', color: '#475569', label: status };
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-bold select-none" style={{ background: s.bg, color: s.color, userSelect: 'none' }}>
      {s.label}
    </span>
  );
};

// ── Print invoice ──────────────────────────────────────────────────────────────
const printInvoice = (bill, items) => {
  const co = (() => { try { return JSON.parse(localStorage.getItem('companyInfo')) || {}; } catch { return {}; } })();
  const logo = (() => { try { return JSON.parse(localStorage.getItem('logoConfig')) || {}; } catch { return {}; } })();
  const w = window.open('', '_blank');
  const html = `<!DOCTYPE html><html><head><title>Invoice ${bill.invoice_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#1e293b;background:#fff}
    .page{width:210mm;min-height:297mm;margin:auto;padding:18mm 14mm}
    .hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0d9488;padding-bottom:14px;margin-bottom:20px}
    .hdr-left{flex:1}
    .hdr-center{flex:0 0 auto;display:flex;justify-content:center;align-items:center;padding:0 16px}
    .hdr-right{flex:1;text-align:right}
    .co-name{font-size:20px}
    .co-name .brand-main{font-weight:900}
    .co-name .brand-suffix{font-weight:400}
    .co-sub{font-size:11px;color:#64748b;margin-top:2px}
    .inv-title{font-size:22px;font-weight:800;color:#0d9488;text-align:right}
    .inv-meta{font-size:12px;text-align:right;margin-top:4px;line-height:1.7}
    .pt-box{background:#f8fafc;border-radius:8px;padding:12px 16px;margin-bottom:18px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px 20px}
    .pt-label{font-size:9px;text-transform:uppercase;font-weight:700;color:#94a3b8;letter-spacing:.05em}
    .pt-val{font-size:13px;font-weight:600;margin-top:1px}
    table{width:100%;border-collapse:collapse;margin-bottom:18px}
    th{background:#0f766e;color:#fff;padding:9px 12px;text-align:left;font-size:12px}
    td{padding:9px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}
    td:last-child,th:last-child{text-align:right}
    .totals{margin-left:auto;width:270px}
    .tot-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #f1f5f9}
    .grand{display:flex;justify-content:space-between;font-size:17px;font-weight:800;color:#0d9488;border-top:2px solid #0d9488;padding-top:8px;margin-top:6px}
    .footer{margin-top:48px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:11px;color:#94a3b8;text-align:center}
    .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:#dcfce7;color:#166534}
    .badge.pending{background:#fef3c7;color:#92400e}
  </style></head><body><div class="page">
  <div class="hdr">
    <div class="hdr-left">
      <div class="co-name">${(() => { const n = co.company_name || 'ARIS Healthcare'; const i = n.toLowerCase().lastIndexOf('tech'); return i > 0 ? `<span class="brand-main">${n.slice(0,i)}</span><span class="brand-suffix">${n.slice(i)}</span>` : `<span class="brand-main">${n}</span>`; })()}</div>
      ${co.address_line1 ? `<div class="co-sub">${co.address_line1}${co.city ? ', ' + co.city : ''}</div>` : ''}
      ${co.phone ? `<div class="co-sub">Ph: ${co.phone}</div>` : ''}
      ${co.gstin ? `<div class="co-sub" style="font-weight:600;color:#475569">GSTIN: ${co.gstin}</div>` : ''}
    </div>
    <div class="hdr-center">
      ${logo.customLogo ? `<img src="${logo.customLogo}" alt="logo" style="max-height:64px;max-width:160px;object-fit:contain;"/>` : ''}
    </div>
    <div class="hdr-right">
      <div class="inv-title">INVOICE</div>
      <div class="inv-meta">
        <b>Bill #:</b> ${bill.invoice_number || '—'}<br>
        <b>Date:</b> ${fmtDate(bill.bill_date)}<br>
        ${bill.accession_number ? `<b>Accession:</b> ${bill.accession_number}<br>` : ''}
        <b>Status:</b> <span class="badge ${bill.payment_status !== 'PAID' ? 'pending' : ''}">${bill.payment_status}</span>
      </div>
    </div>
  </div>
  <div class="pt-box">
    ${[
      ['Patient', bill.patient_name],
      ['PID', bill.pid || '—'],
      ['Phone', bill.patient_phone || '—'],
      ['Gender', bill.gender || '—'],
      ['Age', calcAge(bill.date_of_birth)],
      ['Payment', bill.payment_mode + (bill.payment_reference ? ' · ' + bill.payment_reference : '')],
    ].map(([l, v]) => `<div><div class="pt-label">${l}</div><div class="pt-val">${v}</div></div>`).join('')}
  </div>
  <table>
    <thead><tr><th>#</th><th>Study / Service</th><th>Modality</th><th>Amount</th></tr></thead>
    <tbody>
      ${items.map((s, i) => `<tr><td>${i + 1}</td><td>${s.study_name}</td><td>${s.modality || '—'}</td><td>${fmt(s.amount)}</td></tr>`).join('')}
    </tbody>
  </table>
  <div class="totals">
    <div class="tot-row"><span>Subtotal</span><span>${fmt(bill.subtotal)}</span></div>
    ${bill.discount_amount > 0 ? `<div class="tot-row" style="color:#16a34a"><span>Discount</span><span>- ${fmt(bill.discount_amount)}</span></div>` : ''}
    ${bill.total_gst > 0 ? `<div class="tot-row"><span>GST</span><span>${fmt(bill.total_gst)}</span></div>` : ''}
    <div class="grand"><span>Total</span><span>${fmt(bill.total_amount)}</span></div>
  </div>
  ${bill.notes ? `<p style="margin-top:16px;font-size:12px;color:#64748b">Notes: ${bill.notes}</p>` : ''}
  <div class="footer">${co.bill_footer_text || 'Thank you for choosing our services. Wishing you good health!'}</div>
  </div></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => w.print(), 400);
};

// ── Update Payment Status Modal ────────────────────────────────────────────────
const UpdateStatusModal = ({ bill, onClose, onUpdated }) => {
  const [status, setStatus]       = useState(bill.payment_status);
  const [mode, setMode]           = useState(bill.payment_mode);
  const [ref, setRef]             = useState(bill.payment_reference || '');
  const [items, setItems]         = useState([]);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');
  const [voidAction, setVoidAction] = useState(null); // 'CANCELLED' | 'REFUNDED'
  const [voidReason, setVoidReason] = useState('');

  const isVoided = ['CANCELLED', 'REFUNDED'].includes(bill.payment_status);

  useEffect(() => {
    api(`/api/billing/${bill.id}/items`).then(r => r.json()).then(d => setItems(d.items || [])).catch(() => {});
  }, [bill.id]);

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const r = await api(`/api/billing/${bill.id}/payment`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_status: status, payment_mode: mode, payment_reference: ref }),
      });
      const d = await r.json();
      if (r.ok) { onUpdated(d.bill || { ...bill, payment_status: status, payment_mode: mode, payment_reference: ref }); }
      else setErr(d.errors?.[0]?.msg || d.error || 'Update failed');
    } catch { setErr('Network error'); }
    setSaving(false);
  };

  const saveVoid = async () => {
    if (!voidReason.trim() || voidReason.trim().length < 3) { setErr('Please enter a reason (min 3 characters)'); return; }
    setSaving(true); setErr('');
    try {
      const r = await api(`/api/billing/${bill.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ action: voidAction, reason: voidReason.trim() }),
      });
      const d = await r.json();
      if (r.ok) { onUpdated({ ...bill, payment_status: voidAction, accession_number: voidAction === 'CANCELLED' ? null : bill.accession_number }); }
      else setErr(d.errors?.[0]?.msg || d.error || 'Action failed');
    } catch { setErr('Network error'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-start justify-between flex-shrink-0" style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
          <div>
            <p className="text-white font-bold text-base">{bill.patient_name}</p>
            <p className="text-teal-200 text-xs mt-0.5">
              <span className="font-mono">{bill.patient_pid || '—'}</span>
              <span className="mx-1.5 opacity-50">·</span>
              <span className="font-mono">{bill.invoice_number}</span>
              {bill.accession_number && <><span className="mx-1.5 opacity-50">·</span><span className="font-mono">{bill.accession_number}</span></>}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Bill meta */}
          <div className="px-6 pt-4 pb-3 border-b border-slate-100">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bill Details</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Date', fmtDate(bill.bill_date)],
                ['Payment Mode', bill.payment_mode],
                ['Ref #', bill.payment_reference || '—'],
                ['Subtotal', fmt(bill.subtotal)],
                ['Discount', parseFloat(bill.discount_amount) > 0 ? fmt(bill.discount_amount) : '—'],
                ['GST', parseFloat(bill.total_gst) > 0 ? fmt(bill.total_gst) : '—'],
              ].map(([l, v]) => (
                <div key={l} className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{l}</p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between items-center px-3 py-2 rounded-lg" style={{ background: '#f0fdfa' }}>
              <span className="text-xs font-bold text-teal-800">Total Amount</span>
              <span className="text-base font-extrabold text-teal-700">{fmt(bill.total_amount)}</span>
            </div>
          </div>

          {/* Studies */}
          {items.length === 0 ? (
            <div className="px-6 py-3 border-b border-slate-100">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Services</p>
              <p className="text-xs text-slate-400 italic">No itemised details available for this bill.</p>
            </div>
          ) : (
            <div className="px-6 py-3 border-b border-slate-100">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Services</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-1.5 font-semibold text-slate-500">Study</th>
                    <th className="text-left pb-1.5 font-semibold text-slate-500">Modality</th>
                    <th className="text-right pb-1.5 font-semibold text-slate-500">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 text-slate-700 font-medium">{item.study_name}</td>
                      <td className="py-1.5 text-slate-500">{item.modality}</td>
                      <td className="py-1.5 text-right font-semibold text-slate-700">{fmt(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Void confirmation screen */}

          {voidAction ? (
            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl p-4 border" style={voidAction === 'CANCELLED' ? { background: '#fef2f2', borderColor: '#fca5a5' } : { background: '#eff6ff', borderColor: '#93c5fd' }}>
                <p className="text-sm font-bold mb-1" style={{ color: voidAction === 'CANCELLED' ? '#991b1b' : '#1e40af' }}>
                  {voidAction === 'CANCELLED' ? '✕ Cancel Bill' : '↩ Refund Bill'}
                </p>
                <ul className="text-xs space-y-1 mt-2" style={{ color: voidAction === 'CANCELLED' ? '#7f1d1d' : '#1e3a5f' }}>
                  {voidAction === 'CANCELLED' ? (
                    <>
                      <li>• Bill #{bill.invoice_number} will be marked <strong>Cancelled</strong></li>
                      <li>• Accession number will be <strong>cleared</strong> from this bill and the study</li>
                      <li>• This action is recorded in the audit trail</li>
                    </>
                  ) : (
                    <>
                      <li>• Bill #{bill.invoice_number} will be marked <strong>Refunded</strong></li>
                      <li>• Accession number <strong>will be retained</strong> for record</li>
                      <li>• This action is recorded in the audit trail</li>
                    </>
                  )}
                </ul>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  rows={3}
                  maxLength={200}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  placeholder="Enter reason for this action…"
                />
                <p className="text-[10px] text-slate-400 text-right mt-0.5">{voidReason.length}/200</p>
              </div>
              {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            </div>
          ) : (
            <>
              {/* Update payment form — only shown for active bills */}
              {!isVoided && (
                <div className="px-6 py-4 space-y-4 border-b border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Update Payment</p>
                  {/* Status — only PAID / BILLED */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Status</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[['PAID','✓ Paid','#0d9488'],['BILLED','⏳ Pending','#f59e0b']].map(([v, label, color]) => (
                        <button key={v} onClick={() => setStatus(v)}
                          className="py-2 rounded-xl text-xs font-bold border-2 transition-all select-none"
                          style={status === v ? { background: color, color: '#fff', borderColor: color } : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Mode */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Payment Mode</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[['CASH','💵','Cash'],['UPI','📱','UPI'],['CARD','💳','Card'],['BANK_TRANSFER','🏦','Bank'],['INSURANCE','🏥','Insur.'],['COMBINED','🔀','Split']].map(([m, icon, lbl]) => (
                        <button key={m} onClick={() => setMode(m)}
                          className="py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 transition-all select-none"
                          style={mode === m ? { background: '#0d9488', color: '#fff', borderColor: '#0d9488' } : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }}>
                          <span>{icon}</span><span>{lbl}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Ref */}
                  {mode !== 'CASH' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Reference #</label>
                      <input value={ref} onChange={e => setRef(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="UPI / Card / UTR reference…" />
                    </div>
                  )}
                  {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
                </div>
              )}

              {/* Void section */}
              {!isVoided ? (
                hasPermission('BILLING_REFUND') ? (
                <div className="px-6 py-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Void Bill</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { setVoidAction('CANCELLED'); setErr(''); }}
                      className="py-2.5 rounded-xl text-xs font-bold border-2 border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors select-none">
                      ✕ Cancel Bill
                      <span className="block text-[10px] font-normal text-red-400 mt-0.5">Clears ACC#</span>
                    </button>
                    <button onClick={() => { setVoidAction('REFUNDED'); setErr(''); }}
                      className="py-2.5 rounded-xl text-xs font-bold border-2 border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors select-none">
                      ↩ Refund Bill
                      <span className="block text-[10px] font-normal text-blue-400 mt-0.5">Retains ACC#</span>
                    </button>
                  </div>
                </div>
                ) : null
              ) : (
                <div className="px-6 py-4">
                  <div className="rounded-xl px-4 py-3 text-center" style={{ background: '#f1f5f9' }}>
                    <StatusBadge status={bill.payment_status} />
                    <p className="text-xs text-slate-400 mt-2">This bill has been {bill.payment_status.toLowerCase()}. No further changes can be made.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex-shrink-0 flex gap-3">
          {voidAction ? (
            <>
              <button onClick={() => { setVoidAction(null); setVoidReason(''); setErr(''); }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
                Back
              </button>
              <button onClick={saveVoid} disabled={saving || voidReason.trim().length < 3}
                className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-all"
                style={{ background: saving || voidReason.trim().length < 3 ? '#94a3b8' : voidAction === 'CANCELLED' ? '#dc2626' : '#2563eb' }}>
                {saving ? 'Processing…' : voidAction === 'CANCELLED' ? 'Confirm Cancel' : 'Confirm Refund'}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
                Close
              </button>
              {!isVoided && (
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-all"
                  style={{ background: saving ? '#94a3b8' : 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PatientHistory() {
  const [bills, setBills]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('');
  const [startDate, setStart]       = useState('');
  const [endDate, setEnd]           = useState('');
  const [page, setPage]             = useState(1);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected]     = useState(null);
  const LIMIT = 20;

  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; } })();
  const userCenterId = currentUser.center_id || currentUser.centerId || '';
  const [centerId, setCenterId] = useState(userCenterId);
  const [centers, setCenters] = useState([]);

  useEffect(() => {
    if (userCenterId) return; // center users don't need the list
    api('/api/centers').then(r => r.json()).then(d => {
      setCenters(Array.isArray(d) ? d : (d.centers || []));
    }).catch(() => {});
  }, [userCenterId]);

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: pg, limit: LIMIT,
      ...(search      && { search }),
      ...(statusFilter && { payment_status: statusFilter }),
      ...(startDate   && { start_date: startDate }),
      ...(endDate     && { end_date: endDate }),
      ...(centerId    && { center_id: centerId }),
    });
    try {
      const r = await api(`/api/billing/?${params}`);
      const d = await r.json();
      setBills(d.bills || []);
      setTotal(d.pagination?.total || 0);
      setTotalPages(d.pagination?.pages || 1);
      setPage(pg);
    } catch { setBills([]); }
    setLoading(false);
  }, [search, statusFilter, startDate, endDate, centerId]);

  useEffect(() => { load(1); }, [load]);

  const handleStatusUpdated = updated => {
    setBills(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
    if (selected?.id === updated.id) setSelected(prev => ({ ...prev, ...updated }));
  };

  // Summary stats
  const paid   = bills.filter(b => b.payment_status === 'PAID').length;
  const billed = bills.filter(b => b.payment_status === 'BILLED').length;
  const revenue = bills.filter(b => b.payment_status === 'PAID').reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Page Header */}
      <div className="px-6 pt-6 pb-5"
        style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f766e 60%,#0d9488 100%)' }}>
        <div className="max-w-screen-xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Patient History</h1>
              <p className="text-teal-200 text-sm mt-0.5">{total} billing record{total !== 1 ? 's' : ''} · Full visit &amp; payment history</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 border border-white/20">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              <span className="text-sm font-semibold text-white">{paid} Paid</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 border border-white/20">
              <span className="w-2 h-2 rounded-full bg-amber-300 inline-block" />
              <span className="text-sm font-semibold text-white">{billed} Pending</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 border border-white/20">
              <span className="text-sm font-semibold text-white">{fmt(revenue)} collected</span>
            </div>
            {!userCenterId && (
              <select
                value={centerId}
                onChange={e => setCenterId(e.target.value)}
                className="bg-white/15 text-white border border-white/30 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white/40 min-w-[180px] cursor-pointer">
                <option value="">All Centers</option>
                {centers.filter(c => c.active !== false).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-5 space-y-4">

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-56 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
              placeholder="Search name, phone, PID, bill #…" />
          </div>
          <select value={statusFilter} onChange={e => setStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">All Status</option>
            <option value="PAID">Paid</option>
            <option value="BILLED">Pending</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
          </select>
          <div className="flex items-center gap-2">
            <input type="date" value={startDate} onChange={e => setStart(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500" />
            <span className="text-slate-400 text-xs font-medium">to</span>
            <input type="date" value={endDate} onChange={e => setEnd(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          {(search || statusFilter || startDate || endDate) && (
            <button onClick={() => { setSearch(''); setStatus(''); setStart(''); setEnd(''); }}
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
              Clear
            </button>
          )}
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="text-sm border-collapse" style={{ minWidth: '960px', width: '100%' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }} className="border-b border-slate-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Patient</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">PID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Bill #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Acc #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Mode</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Ref #</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Amount</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-2.5">
                        <div className="h-3.5 bg-slate-100 rounded-md animate-pulse" style={{ width: j === 0 ? '80%' : '60%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-20">
                    <svg className="w-10 h-10 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <p className="text-sm font-semibold text-slate-500">No records found</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filters</p>
                  </td>
                </tr>
              ) : (
                bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className="text-sm font-semibold text-slate-800">{bill.patient_name}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-xs font-mono text-slate-500">{bill.patient_pid || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-xs font-mono text-slate-700">{bill.invoice_number}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {bill.accession_number
                        ? <span className="text-xs font-mono text-teal-600">{bill.accession_number}</span>
                        : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-xs text-slate-600">{fmtDate(bill.bill_date)}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-xs font-medium text-slate-600">{bill.payment_mode}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-xs font-mono text-slate-500">{bill.payment_reference || <span className="text-slate-300">—</span>}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className="text-sm font-bold text-slate-800">{fmt(bill.total_amount)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <StatusBadge status={bill.payment_status} />
                    </td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          title="Update"
                          onClick={() => setSelected(bill)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-teal-200 text-teal-700 hover:bg-teal-50 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                          Update
                        </button>
                        <button
                          title="Print Invoice"
                          onClick={async () => {
                            const r = await api(`/api/billing/${bill.id}/items`);
                            const d = await r.json();
                            printInvoice({ ...bill, pid: bill.patient_pid }, d.items || []);
                          }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-slate-100 text-slate-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200" style={{ background: '#f8fafc' }}>
              <p className="text-xs text-slate-500">
                Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => load(page - 1)} disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  ← Prev
                </button>
                <span className="px-3 py-1.5 text-xs font-semibold text-teal-700">{page} / {totalPages}</span>
                <button onClick={() => load(page + 1)} disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <UpdateStatusModal
          bill={selected}
          onClose={() => setSelected(null)}
          onUpdated={updated => { handleStatusUpdated(updated); setSelected(null); }}
        />
      )}
    </div>
  );
}
