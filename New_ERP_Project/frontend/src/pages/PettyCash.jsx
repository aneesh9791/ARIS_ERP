import React, { useState, useEffect, useCallback } from 'react';
import { getPermissions } from '../utils/permissions';
import { createPortal } from 'react-dom';
import { today as serverToday } from '../utils/serverDate';

const api = (url, opts = {}) => fetch(url, {
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
  ...opts,
});

const fmt  = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

const GST_RATES = [0, 5, 12, 18, 28];

const STATUS_STYLE = {
  SUBMITTED: 'bg-amber-100 text-amber-700 border border-amber-200',
  APPROVED:  'bg-emerald-100 text-emerald-700 border border-emerald-200',
  REJECTED:  'bg-red-100 text-red-700 border border-red-200',
};
const STATUS_LABEL = { SUBMITTED: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' };

// ─── Input styles ─────────────────────────────────────────────
const inp = 'w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';
const sel = inp;

// ═══════════════════════════════════════════════════════════════
// VOUCHER FORM MODAL
// ═══════════════════════════════════════════════════════════════
const VoucherModal = ({ user, centers, expenseAccounts, cashAccounts, onClose, onSaved }) => {
  const today = serverToday();
  const isCorporate = !!user?.is_corporate_role;
  const [form, setForm] = useState({
    expense_date: today,
    center_id: isCorporate ? (centers[0]?.id || '') : (user?.center_id || ''),
    debit_account_id: '', credit_account_id: cashAccounts.find(a => a.account_code === '1114')?.id || cashAccounts[0]?.id || '',
    amount: '', gst_rate: 0, cgst_amount: 0, sgst_amount: 0, gst_amount: 0, total_amount: '',
    itc_claimable: true, paid_to: '', receipt_number: '', description: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  // Backfill dropdowns if data wasn't ready when modal mounted
  useEffect(() => {
    if (!form.credit_account_id && cashAccounts.length) {
      const def = cashAccounts.find(a => a.account_code === '1114') || cashAccounts[0];
      setForm(f => ({ ...f, credit_account_id: def.id }));
    }
  }, [cashAccounts, form.credit_account_id]);

  useEffect(() => {
    if (!form.center_id && isCorporate && centers.length) {
      setForm(f => ({ ...f, center_id: centers[0].id }));
    }
  }, [centers, form.center_id, isCorporate]);

  const set = (k, v) => setForm(f => {
    const next = { ...f, [k]: v };
    // Recalculate GST whenever amount or rate changes
    if (k === 'amount' || k === 'gst_rate') {
      const base = parseFloat(k === 'amount' ? v : next.amount) || 0;
      const rate = parseFloat(k === 'gst_rate' ? v : next.gst_rate) || 0;
      const gst  = parseFloat((base * rate / 100).toFixed(2));
      const half = parseFloat((gst / 2).toFixed(2));
      next.gst_amount   = gst;
      next.cgst_amount  = half;
      next.sgst_amount  = parseFloat((gst - half).toFixed(2));
      next.total_amount = parseFloat((base + gst).toFixed(2));
    }
    return next;
  });

  const submit = async () => {
    setErr('');
    if (!form.expense_date)      return setErr('Date is required');
    if (!form.center_id)         return setErr('Center is required');
    if (!form.debit_account_id)  return setErr('Expense account is required');
    if (!form.credit_account_id) return setErr('Payment source is required');
    if (!form.amount || parseFloat(form.amount) <= 0) return setErr('Amount must be greater than 0');
    if (!form.description.trim()) return setErr('Description is required');

    setSaving(true);
    try {
      const r = await api('/api/petty-cash', { method: 'POST', body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { setErr(d.errors?.[0]?.msg || d.error || 'Save failed'); return; }
      onSaved();
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999, background: 'rgba(15,23,42,0.65)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between rounded-t-2xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
          <div>
            <p className="text-white font-bold text-sm">New Petty Cash Voucher</p>
            <p className="text-teal-200 text-xs mt-0.5">Will be sent for Finance approval</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

          {/* Date + Center */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Center <span className="text-red-500">*</span></label>
              {isCorporate ? (
                <select value={form.center_id} onChange={e => set('center_id', e.target.value)} className={sel}>
                  <option value="">— Select —</option>
                  {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <input
                  value={centers.find(c => String(c.id) === String(user?.center_id))?.name || '—'}
                  disabled
                  className={inp + ' bg-slate-100 cursor-not-allowed text-slate-500'}
                />
              )}
            </div>
          </div>

          {/* Paid To + Receipt */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Paid To</label>
              <input value={form.paid_to} onChange={e => set('paid_to', e.target.value)} className={inp} placeholder="Vendor / person name" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Receipt / Bill No.</label>
              <input value={form.receipt_number} onChange={e => set('receipt_number', e.target.value)} className={inp} placeholder="Receipt no." />
            </div>
          </div>

          {/* Expense Account */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Expense Account <span className="text-red-500">*</span></label>
            <select value={form.debit_account_id} onChange={e => set('debit_account_id', e.target.value)} className={sel}>
              <option value="">— Select GL Account —</option>
              {expenseAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.account_code} – {a.account_name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description <span className="text-red-500">*</span></label>
            <input value={form.description} onChange={e => set('description', e.target.value)} className={inp}
              placeholder="e.g. Tea & snacks for staff, Courier charges, etc." />
          </div>

          {/* Amount + GST */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-3 bg-slate-50">
            <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest">Amount & GST</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Net Amount (₹) <span className="text-red-500">*</span></label>
                <input type="number" min="0.01" step="0.01" value={form.amount}
                  onChange={e => set('amount', e.target.value)} className={inp} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">GST Rate %</label>
                <select value={form.gst_rate} onChange={e => set('gst_rate', e.target.value)} className={sel}>
                  {GST_RATES.map(r => <option key={r} value={r}>{r === 0 ? 'No GST' : `${r}%`}</option>)}
                </select>
              </div>
            </div>

            {parseFloat(form.gst_rate) > 0 && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 text-center">
                  <p className="text-slate-500 text-[10px] mb-0.5">CGST</p>
                  <p className="font-semibold text-slate-700">{fmt(form.cgst_amount)}</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 text-center">
                  <p className="text-slate-500 text-[10px] mb-0.5">SGST</p>
                  <p className="font-semibold text-slate-700">{fmt(form.sgst_amount)}</p>
                </div>
                <div className="bg-teal-50 rounded-lg border border-teal-200 px-3 py-2 text-center">
                  <p className="text-teal-600 text-[10px] mb-0.5">Total</p>
                  <p className="font-bold text-teal-700">{fmt(form.total_amount)}</p>
                </div>
              </div>
            )}

            {parseFloat(form.gst_rate) > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.itc_claimable}
                  onChange={e => set('itc_claimable', e.target.checked)}
                  className="w-4 h-4 rounded accent-teal-600" />
                <span className="text-xs text-slate-600">Claim GST as Input Tax Credit (ITC)</span>
              </label>
            )}

            {parseFloat(form.gst_rate) === 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Total Amount</span>
                <span className="font-bold text-slate-800">{fmt(form.amount)}</span>
              </div>
            )}
          </div>

          {/* Payment source */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pay from <span className="text-red-500">*</span></label>
            <select value={form.credit_account_id} onChange={e => set('credit_account_id', e.target.value)} className={sel}>
              {cashAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.account_code} – {a.account_name}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} className={inp} placeholder="Optional additional notes" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ═══════════════════════════════════════════════════════════════
// REJECT MODAL
// ═══════════════════════════════════════════════════════════════
const RejectModal = ({ voucher, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const submit = async () => {
    if (!reason.trim()) return setErr('Reason is required');
    setSaving(true);
    try {
      const r = await api(`/api/petty-cash/${voucher.id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed'); setSaving(false); return; }
      onDone();
    } catch { setErr('Network error'); setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999, background: 'rgba(15,23,42,0.65)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-800">Reject Voucher</h3>
        <p className="text-xs text-slate-500">{voucher.expense_number} — {voucher.description}</p>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reason for rejection <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-400"
            placeholder="Explain why this voucher is being rejected…" />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ═══════════════════════════════════════════════════════════════
// VOUCHER DETAIL PANEL (slide-in)
// ═══════════════════════════════════════════════════════════════
const VoucherDetail = ({ v, onClose }) => (
  <div className="fixed inset-0 flex items-center justify-end" style={{ zIndex: 9000, background: 'rgba(15,23,42,0.4)' }} onClick={onClose}>
    <div className="bg-white w-full max-w-sm h-full shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800">{v.expense_number}</p>
          <p className="text-xs text-slate-500">{fmtD(v.expense_date)}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div className="p-5 space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${STATUS_STYLE[v.status]}`}>
            {STATUS_LABEL[v.status]}
          </span>
          {v.status === 'APPROVED' && v.journal_entry_id && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-100 text-teal-700 border border-teal-200">JE Posted</span>
          )}
        </div>

        {[
          ['Center',        v.center_name],
          ['Paid To',       v.paid_to],
          ['Description',   v.description],
          ['Receipt No.',   v.receipt_number],
          ['Expense GL',    v.debit_gl_code ? `${v.debit_gl_code} – ${v.debit_gl_name}` : '—'],
          ['Pay From',      v.credit_gl_code ? `${v.credit_gl_code} – ${v.credit_gl_name}` : '—'],
        ].map(([label, val]) => val ? (
          <div key={label}>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-slate-800">{val}</p>
          </div>
        ) : null)}

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-500">Net Amount</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmt(v.amount)}</td>
              </tr>
              {parseFloat(v.gst_rate) > 0 && <>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-500">GST Rate</td>
                  <td className="px-3 py-2 text-right text-slate-700">{v.gst_rate}%</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-500">CGST / SGST</td>
                  <td className="px-3 py-2 text-right text-slate-700">{fmt(v.cgst_amount)} / {fmt(v.sgst_amount)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-500">ITC Claimable</td>
                  <td className="px-3 py-2 text-right text-slate-700">{v.itc_claimable ? 'Yes' : 'No'}</td>
                </tr>
              </>}
              <tr className="bg-teal-50">
                <td className="px-3 py-2 font-bold text-teal-700">Total Paid</td>
                <td className="px-3 py-2 text-right font-bold text-teal-700">{fmt(v.total_amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {v.status === 'APPROVED' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Approved</p>
            <p className="text-slate-700">By: {v.approved_by_name}</p>
            <p className="text-slate-500">{fmtD(v.approved_at)}</p>
          </div>
        )}

        {v.status === 'REJECTED' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
            <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Rejected</p>
            <p className="text-slate-700">By: {v.rejected_by_name}</p>
            <p className="text-slate-500">{fmtD(v.rejected_at)}</p>
            <p className="text-red-700 mt-1">{v.rejection_reason}</p>
          </div>
        )}

        {v.notes && (
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Notes</p>
            <p className="text-slate-700">{v.notes}</p>
          </div>
        )}
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Submitted By</p>
          <p className="text-slate-700">{v.created_by_name} — {fmtD(v.submitted_at)}</p>
        </div>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
const PettyCash = () => {
  const { has } = getPermissions();
  const user = (() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return {}; } })();
  const [tab,            setTab]            = useState('vouchers');   // 'vouchers' | 'pending'
  const [vouchers,       setVouchers]       = useState([]);
  const [pending,        setPending]        = useState([]);
  const [centers,        setCenters]        = useState([]);
  const [expenseAccts,   setExpenseAccts]   = useState([]);
  const [cashAccts,      setCashAccts]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [pendingCount,   setPendingCount]   = useState(0);
  const [showForm,       setShowForm]       = useState(false);
  const [detail,         setDetail]         = useState(null);
  const [rejectTarget,   setRejectTarget]   = useState(null);
  const [approving,      setApproving]      = useState(null);
  // filters
  const [filterStatus,   setFilterStatus]   = useState('ALL');
  const [filterCenter,   setFilterCenter]   = useState('ALL');
  const [filterFrom,     setFilterFrom]     = useState('');
  const [filterTo,       setFilterTo]       = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 200 });
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      if (filterCenter !== 'ALL') params.set('center_id', filterCenter);
      if (filterFrom)  params.set('from', filterFrom);
      if (filterTo)    params.set('to', filterTo);

      const [vRes, pRes, cRes, glRes, pcRes] = await Promise.all([
        api(`/api/petty-cash?${params}`).then(r => r.json()),
        api('/api/petty-cash?status=SUBMITTED&limit=200').then(r => r.json()),
        api('/api/centers').then(r => r.json()),
        api('/api/petty-cash/gl-accounts').then(r => r.json()),
        api('/api/petty-cash/pending-count').then(r => r.json()),
      ]);
      setVouchers(vRes.vouchers || []);
      setPending(pRes.vouchers || []);
      setCenters(cRes.centers || cRes.data || []);
      setExpenseAccts(glRes.expense_accounts || []);
      setCashAccts(glRes.cash_accounts || []);
      setPendingCount(pcRes.count || 0);
    } catch (e) {
      console.error('Petty cash fetch failed:', e);
    }
    setLoading(false);
  }, [filterStatus, filterCenter, filterFrom, filterTo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const approve = async (v) => {
    setApproving(v.id);
    try {
      const r = await api(`/api/petty-cash/${v.id}/approve`, { method: 'PUT' });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Approval failed'); }
      else { fetchAll(); }
    } catch { alert('Network error'); }
    setApproving(null);
  };

  const deleteVoucher = async (v) => {
    if (!window.confirm(`Delete voucher ${v.expense_number}?`)) return;
    await api(`/api/petty-cash/${v.id}`, { method: 'DELETE' });
    fetchAll();
  };

  // Stats
  const todayStr = serverToday();
  const todayVouchers = vouchers.filter(v => v.expense_date?.slice(0,10) === todayStr && v.status === 'APPROVED');
  const todayTotal    = todayVouchers.reduce((s, v) => s + parseFloat(v.total_amount || 0), 0);
  const monthVouchers = vouchers.filter(v => v.expense_date?.slice(0,7) === todayStr.slice(0,7) && v.status === 'APPROVED');
  const monthTotal    = monthVouchers.reduce((s, v) => s + parseFloat(v.total_amount || 0), 0);

  const statCard = (label, value, sub, color) => (
    <div className={`bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm`}>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );

  const VoucherRow = ({ v, showActions }) => (
    <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetail(v)}>
      <td className="px-4 py-3 text-xs font-mono text-teal-700 font-semibold">{v.expense_number}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{fmtD(v.expense_date)}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{v.center_name || '—'}</td>
      <td className="px-4 py-3 text-xs text-slate-800 max-w-[160px] truncate">{v.description}</td>
      <td className="px-4 py-3 text-xs text-slate-500">{v.paid_to || '—'}</td>
      <td className="px-4 py-3 text-xs font-semibold text-slate-700 text-right">{fmt(v.total_amount)}</td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[v.status]}`}>
          {STATUS_LABEL[v.status]}
        </span>
      </td>
      {showActions && has('PETTY_CASH_APPROVE') && (
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex gap-1">
            <button onClick={() => approve(v)} disabled={approving === v.id}
              className="px-2.5 py-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
              {approving === v.id ? '…' : 'Approve'}
            </button>
            <button onClick={() => setRejectTarget(v)}
              className="px-2.5 py-1 text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg">
              Reject
            </button>
          </div>
        </td>
      )}
      {!showActions && v.status === 'SUBMITTED' && has('PETTY_CASH_CREATE') && (
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <button onClick={() => deleteVoucher(v)}
            className="text-slate-400 hover:text-red-500 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </td>
      )}
      {!showActions && v.status !== 'SUBMITTED' && <td />}
    </tr>
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Petty Cash Vouchers</h1>
          <p className="text-xs text-slate-500 mt-0.5">Submit daily cash expenses for Finance approval</p>
        </div>
        {has('PETTY_CASH_CREATE') && (
          <button onClick={() => setShowForm(true)} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Voucher
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {statCard("Today's Expenses", fmt(todayTotal), `${todayVouchers.length} approved vouchers`, 'text-teal-700')}
        {statCard("This Month", fmt(monthTotal), `${monthVouchers.length} approved vouchers`, 'text-slate-800')}
        {statCard("Pending Approval", pendingCount, 'Awaiting Finance review', pendingCount > 0 ? 'text-amber-600' : 'text-slate-400')}
        {statCard("Total Vouchers", vouchers.length, 'All time', 'text-slate-600')}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'vouchers', label: 'All Vouchers' },
          { key: 'pending',  label: `Pending Approval${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              tab === t.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters (only on vouchers tab) */}
      {tab === 'vouchers' && (
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Status</p>
            <div className="flex gap-1">
              {[['ALL','All'],['SUBMITTED','Pending'],['APPROVED','Approved'],['REJECTED','Rejected']].map(([v,l]) => (
                <button key={v} onClick={() => setFilterStatus(v)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                    filterStatus === v ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>{l}</button>
              ))}
            </div>
          </div>
          {user?.is_corporate_role && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Center</p>
              <select value={filterCenter} onChange={e => setFilterCenter(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-teal-400">
                <option value="ALL">All Centers</option>
                {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">From</p>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">To</p>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none" />
          </div>
          {(filterFrom || filterTo || filterCenter !== 'ALL') && (
            <button onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterCenter('ALL'); }}
              className="text-xs text-teal-600 hover:underline self-end pb-1">Clear</button>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Voucher #</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Center</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Paid To</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(tab === 'pending' ? pending : vouchers).length === 0 ? (
                  <tr><td colSpan={8} className="py-16 text-center text-slate-400 text-sm">
                    {tab === 'pending' ? 'No pending vouchers — all caught up!' : 'No vouchers found'}
                  </td></tr>
                ) : (tab === 'pending' ? pending : vouchers).map(v => (
                  <VoucherRow key={v.id} v={v} showActions={tab === 'pending'} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <VoucherModal
          user={user}
          centers={centers} expenseAccounts={expenseAccts} cashAccounts={cashAccts}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchAll(); }}
        />
      )}
      {rejectTarget && (
        <RejectModal
          voucher={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => { setRejectTarget(null); fetchAll(); }}
        />
      )}
      {detail && <VoucherDetail v={detail} onClose={() => setDetail(null)} />}
    </div>
  );
};

export default PettyCash;
