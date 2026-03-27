import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { today as serverToday } from '../utils/serverDate';

const api = (url, opts = {}) => fetch(url, {
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
  ...opts,
});

const fmt  = n => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const inp = 'w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500';

const STATUS_STYLE = {
  SUBMITTED: 'bg-amber-100 text-amber-700 border border-amber-200',
  APPROVED:  'bg-emerald-100 text-emerald-700 border border-emerald-200',
  REJECTED:  'bg-red-100 text-red-700 border border-red-200',
};

// ═══════════════════════════════════════════════════════════════
// ISSUE ADVANCE MODAL
// ═══════════════════════════════════════════════════════════════
const IssueAdvanceModal = ({ custodian, onClose, onSaved }) => {
  const [form, setForm] = useState({ amount: '', issued_date: serverToday(), notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!form.amount || parseFloat(form.amount) <= 0) return setErr('Amount is required');
    setSaving(true);
    try {
      const r = await api('/api/petty-cash/advances', {
        method: 'POST',
        body: JSON.stringify({ custodian_id: custodian.id, ...form, amount: parseFloat(form.amount) }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed'); setSaving(false); return; }
      onSaved(d);
    } catch { setErr('Network error'); setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999, background: 'rgba(15,23,42,0.65)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 rounded-t-2xl flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
          <div>
            <p className="text-white font-bold text-sm">Issue Petty Cash Advance</p>
            <p className="text-teal-200 text-xs mt-0.5">{custodian.employee_name} · {custodian.center_name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

          {custodian.advance_id && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-amber-800">Active advance exists</p>
              <p className="text-[10px] text-amber-700 mt-0.5">
                {custodian.advance_number} · Balance: {fmt(custodian.balance_remaining)}
              </p>
              <p className="text-[10px] text-amber-600 mt-1">Issuing a new advance will add to the existing outstanding.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount (₹) <span className="text-red-500">*</span></label>
              <input type="number" min="1" step="100" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className={inp} placeholder={`Max: ${fmt(custodian.credit_limit)}`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date</label>
              <input type="date" value={form.issued_date}
                onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))}
                className={inp} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className={inp} placeholder="Optional" />
          </div>

          <div className="bg-slate-50 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 space-y-0.5">
            <p>• Bank account will be credited (Dr: Staff Advances, Cr: Bank)</p>
            <p>• Custodian's party ledger will be updated</p>
            <p>• Custodian sees their balance in real time</p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Issuing…' : 'Issue Advance'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ═══════════════════════════════════════════════════════════════
// ASSIGN CUSTODIAN MODAL
// ═══════════════════════════════════════════════════════════════
const AssignModal = ({ centers, employees, onClose, onSaved }) => {
  const [form, setForm] = useState({ center_id: '', employee_id: '', credit_limit: 10000, notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!form.center_id)   return setErr('Center is required');
    if (!form.employee_id) return setErr('Employee is required');
    setSaving(true);
    try {
      const r = await api('/api/petty-cash/custodians', { method: 'POST', body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
    } catch { setErr('Network error'); setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999, background: 'rgba(15,23,42,0.65)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 rounded-t-2xl" style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
          <p className="text-white font-bold text-sm">Assign Petty Cash Custodian</p>
          <p className="text-teal-200 text-xs mt-0.5">Select center and employee</p>
        </div>

        <div className="p-5 space-y-4">
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Center <span className="text-red-500">*</span></label>
            <select value={form.center_id} onChange={e => setForm(f => ({ ...f, center_id: e.target.value }))} className={inp}>
              <option value="">— Select center —</option>
              {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employee <span className="text-red-500">*</span></label>
            <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className={inp}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.position}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Float Limit (₹)</label>
            <input type="number" min="0" step="500" value={form.credit_limit}
              onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))}
              className={inp} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className={inp} placeholder="Optional" />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Assign Custodian'}
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
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!reason.trim()) return setErr('Reason is required');
    setSaving(true);
    try {
      const r = await api(`/api/petty-cash/${voucher.id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) });
      if (r.ok) onDone();
      else { const d = await r.json(); setErr(d.error || 'Failed'); setSaving(false); }
    } catch { setErr('Network error'); setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999, background: 'rgba(15,23,42,0.65)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-800">Reject Voucher</h3>
        <p className="text-xs text-slate-500">{voucher.expense_number} — {voucher.description}</p>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reason <span className="text-red-500">*</span></label>
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
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
const PettyCashAP = () => {
  const [tab, setTab] = useState('custodians'); // 'custodians' | 'vouchers' | 'advances'

  const [custodians,    setCustodians]    = useState([]);
  const [vouchers,      setVouchers]      = useState([]);
  const [advances,      setAdvances]      = useState([]);
  const [centers,       setCenters]       = useState([]);
  const [employees,     setEmployees]     = useState([]);
  const [pendingCount,  setPendingCount]  = useState(0);
  const [loading,       setLoading]       = useState(true);

  const [advanceTarget, setAdvanceTarget] = useState(null);
  const [showAssign,    setShowAssign]    = useState(false);
  const [rejectTarget,  setRejectTarget]  = useState(null);
  const [approving,     setApproving]     = useState(null);

  const [filterStatus,  setFilterStatus]  = useState('SUBMITTED');
  const [filterCenter,  setFilterCenter]  = useState('ALL');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const vParams = new URLSearchParams({ limit: 200 });
      if (filterStatus !== 'ALL') vParams.set('status', filterStatus);
      if (filterCenter !== 'ALL') vParams.set('center_id', filterCenter);

      const [cRes, vRes, aRes, ctrRes, empRes, pcRes] = await Promise.all([
        api('/api/petty-cash/custodians').then(r => r.json()),
        api(`/api/petty-cash?${vParams}`).then(r => r.json()),
        api('/api/petty-cash/advances').then(r => r.json()),
        api('/api/centers').then(r => r.json()),
        api('/api/payroll/employees?active_only=true&limit=200').then(r => r.json()),
        api('/api/petty-cash/pending-count').then(r => r.json()),
      ]);
      setCustodians(cRes.custodians || []);
      setVouchers(vRes.vouchers || []);
      setAdvances(aRes.advances || []);
      setCenters(ctrRes.centers || ctrRes.data || []);
      setEmployees(empRes.employees || empRes.data || []);
      setPendingCount(pcRes.count || 0);
    } catch (e) {
      console.error('PettyCashAP fetch failed:', e);
    }
    setLoading(false);
  }, [filterStatus, filterCenter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const approve = async (v) => {
    setApproving(v.id);
    try {
      const r = await api(`/api/petty-cash/${v.id}/approve`, { method: 'PUT' });
      const d = await r.json();
      if (!r.ok) alert(d.error || 'Approval failed');
      else fetchAll();
    } catch { alert('Network error'); }
    setApproving(null);
  };

  const toggleCustodian = async (c) => {
    await api(`/api/petty-cash/custodians/${c.id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: !c.is_active }),
    });
    fetchAll();
  };

  // ── Custodians tab ────────────────────────────────────────────
  const CustodiansTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500">Manage petty cash custodians per center. Issue advances to fund their float.</p>
        <button onClick={() => setShowAssign(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
          </svg>
          Assign Custodian
        </button>
      </div>

      {loading ? <div className="text-center py-12 text-slate-400 text-sm">Loading…</div> : (
        <div className="grid gap-4">
          {custodians.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm bg-white rounded-xl border border-slate-200">No custodians assigned yet</div>
          ) : custodians.map(c => {
            const balance = parseFloat(c.balance_remaining ?? 0);
            const advance = parseFloat(c.advance_amount ?? 0);
            const balColor = balance < advance * 0.2 ? 'text-red-600' : balance < advance * 0.5 ? 'text-amber-600' : 'text-emerald-600';
            const pct = advance > 0 ? Math.min(100, ((advance - balance) / advance) * 100) : 0;
            return (
              <div key={c.id} className={`bg-white rounded-xl border ${c.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'} shadow-sm p-5`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${c.is_active ? 'bg-teal-600' : 'bg-slate-400'}`}>
                      {c.employee_name?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{c.employee_name}</p>
                      <p className="text-xs text-slate-500">{c.position} · {c.center_name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Float limit: {fmt(c.credit_limit)}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    {c.advance_id ? (
                      <>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Balance</p>
                        <p className={`text-lg font-bold ${balColor}`}>{fmt(balance)}</p>
                        <p className="text-[10px] text-slate-400">{c.advance_number}</p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No active advance</p>
                    )}
                  </div>
                </div>

                {c.advance_id && advance > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${balance < advance * 0.2 ? 'bg-red-500' : balance < advance * 0.5 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {fmt(advance - balance)} utilised of {fmt(advance)} issued on {fmtD(c.issued_date)}
                    </p>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button onClick={() => setAdvanceTarget(c)}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors">
                    Issue Advance
                  </button>
                  <button onClick={() => toggleCustodian(c)}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      c.is_active
                        ? 'text-slate-600 bg-slate-50 hover:bg-slate-100 border-slate-200'
                        : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                    }`}>
                    {c.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Vouchers tab ──────────────────────────────────────────────
  const VouchersTab = () => (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-end">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Status</p>
          <div className="flex gap-1">
            {[['SUBMITTED','Pending'],['ALL','All'],['APPROVED','Approved'],['REJECTED','Rejected']].map(([v,l]) => (
              <button key={v} onClick={() => setFilterStatus(v)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                  filterStatus === v ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Center</p>
          <select value={filterCenter} onChange={e => setFilterCenter(e.target.value)}
            className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none">
            <option value="ALL">All Centers</option>
            {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-slate-400 text-sm">Loading…</div> : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Voucher #','Date','Center','Employee','Description','Paid To','Amount','Type','Status',''].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vouchers.length === 0 ? (
                  <tr><td colSpan={10} className="py-12 text-center text-slate-400 text-sm">No vouchers found</td></tr>
                ) : vouchers.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-mono text-teal-700 font-semibold">{v.expense_number}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtD(v.expense_date)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{v.center_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{v.created_by_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-800 max-w-[140px] truncate">{v.description}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{v.paid_to || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">{fmt(v.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.is_advance_knockoff ? 'bg-teal-100 text-teal-700 border border-teal-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
                        {v.is_advance_knockoff ? 'Knock-off' : 'Reimburse'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[v.status]}`}>
                        {v.status === 'SUBMITTED' ? 'Pending' : v.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {v.status === 'SUBMITTED' && (
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
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ── Advances tab ──────────────────────────────────────────────
  const AdvancesTab = () => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Advance #','Employee','Center','Issued','Amount','Utilised','Balance','Status'].map(h => (
                <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider ${['Amount','Utilised','Balance'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="py-12 text-center text-slate-400 text-sm">Loading…</td></tr>
            ) : advances.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-slate-400 text-sm">No advances issued yet</td></tr>
            ) : advances.map(a => {
              const balance = parseFloat(a.amount) - parseFloat(a.amount_utilised);
              const balColor = balance < parseFloat(a.amount) * 0.2 ? 'text-red-600' : balance < parseFloat(a.amount) * 0.5 ? 'text-amber-600' : 'text-emerald-600';
              return (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs font-mono text-teal-700 font-semibold">{a.advance_number}</td>
                  <td className="px-4 py-3 text-xs text-slate-800">{a.employee_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{a.center_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtD(a.issued_date)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 text-right">{fmt(a.amount)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 text-right">{fmt(a.amount_utilised)}</td>
                  <td className={`px-4 py-3 text-xs font-bold text-right ${balColor}`}>{fmt(balance)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      a.status === 'ACTIVE'   ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                      a.status === 'SETTLED'  ? 'bg-slate-100 text-slate-500 border border-slate-200' :
                      'bg-amber-100 text-amber-700 border border-amber-200'
                    }`}>{a.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Petty Cash AP</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage custodians, issue advances, and settle vouchers</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Approval', value: pendingCount, color: pendingCount > 0 ? 'text-amber-600' : 'text-slate-400', sub: 'vouchers awaiting review' },
          { label: 'Active Custodians', value: custodians.filter(c => c.is_active).length, color: 'text-teal-700', sub: 'across all centers' },
          { label: 'Total Outstanding', value: fmt(advances.filter(a => a.status === 'ACTIVE').reduce((s, a) => s + parseFloat(a.amount) - parseFloat(a.amount_utilised), 0)), color: 'text-slate-800', sub: 'in active advances' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'custodians', label: 'Custodians' },
          { key: 'vouchers',   label: `Vouchers${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}` },
          { key: 'advances',   label: 'Advance Ledger' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              tab === t.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'custodians' && <CustodiansTab />}
      {tab === 'vouchers'   && <VouchersTab />}
      {tab === 'advances'   && <AdvancesTab />}

      {/* Modals */}
      {advanceTarget && (
        <IssueAdvanceModal
          custodian={advanceTarget}
          onClose={() => setAdvanceTarget(null)}
          onSaved={() => { setAdvanceTarget(null); fetchAll(); }}
        />
      )}
      {showAssign && (
        <AssignModal
          centers={centers} employees={employees}
          onClose={() => setShowAssign(false)}
          onSaved={() => { setShowAssign(false); fetchAll(); }}
        />
      )}
      {rejectTarget && (
        <RejectModal
          voucher={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => { setRejectTarget(null); fetchAll(); }}
        />
      )}
    </div>
  );
};

export default PettyCashAP;
