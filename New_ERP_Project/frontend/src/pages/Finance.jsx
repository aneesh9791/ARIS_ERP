import { useState, useEffect, useCallback, useMemo } from 'react';
import VendorModal from '../components/VendorModal';
import { CategoryMappingSettings } from './Settings/CategoryMappingSettings';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
const fmt  = n => `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const CorpBadge = ({ code }) => code === 'CORP'
  ? <span className="ml-1 px-1.5 py-0.5 text-[9px] font-black tracking-wide bg-indigo-100 text-indigo-700 rounded-full border border-indigo-200 uppercase">Corp</span>
  : null;
const fyStart = (offset = 0) => {
  const d = new Date();
  const yr = (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1) - offset;
  return new Date(yr, 3, 1).toISOString().slice(0, 10);
};
const fyEnd = (offset = 0) => {
  const d = new Date();
  const yr = (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1) - offset;
  return new Date(yr + 1, 2, 31).toISOString().slice(0, 10);
};
const monthStart = (offset = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - offset, 1).toISOString().slice(0, 10);
};
const monthEnd = (offset = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - offset + 1, 0).toISOString().slice(0, 10);
};
const quarterStart = () => {
  const d = new Date();
  const fyM = ((d.getMonth() - 3 + 12) % 12); // months since Apr
  const qStart = Math.floor(fyM / 3) * 3 + 3;  // Apr=3,Jul=6,Oct=9,Jan=0
  return new Date(qStart > d.getMonth() ? d.getFullYear() - 1 : d.getFullYear(),
    qStart % 12, 1).toISOString().slice(0, 10);
};

// ── Category config ───────────────────────────────────────────
const CAT_CFG = {
  ASSET:     { label: 'Asset',     color: '#0369a1', bg: '#e0f2fe' },
  LIABILITY: { label: 'Liability', color: '#b45309', bg: '#fef3c7' },
  EQUITY:    { label: 'Equity',    color: '#7c3aed', bg: '#ede9fe' },
  REVENUE:   { label: 'Revenue',   color: '#15803d', bg: '#dcfce7' },
  COGS:      { label: 'COGS',      color: '#be123c', bg: '#fce7f3' },
  EXPENSE:   { label: 'Expense',   color: '#dc2626', bg: '#fee2e2' },
};

const JE_STATUS = {
  DRAFT:    { label: 'Draft',    bg: '#fef3c7', color: '#92400e' },
  POSTED:   { label: 'Posted',   bg: '#dcfce7', color: '#166534' },
  REVERSED: { label: 'Reversed', bg: '#fee2e2', color: '#991b1b' },
};

const Badge = ({ cfg, text }) => (
  <span className="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
    style={{ background: cfg?.bg || '#f1f5f9', color: cfg?.color || '#475569' }}>
    {cfg?.label || text}
  </span>
);

const KpiCard = ({ label, value, sub, color = '#1e40af', icon }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider leading-tight">{label}</p>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: color + '18' }}>
        <svg className="w-4 h-4" fill="none" stroke={color} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
    </div>
    <div>
      <p className="text-2xl font-bold leading-tight" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  </div>
);

const Spin = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Input helpers ─────────────────────────────────────────────
const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide';

// ════════════════════════════════════════════════════════════════
// TAB 1 — OVERVIEW DASHBOARD
// ════════════════════════════════════════════════════════════════
function OverviewTab({ centerId = '', centerName = 'All Centers' }) {
  const [summary, setSummary] = useState(null);
  const [from, setFrom] = useState(fyStart());
  const [to, setTo]     = useState(today());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (centerId) params.set('center_id', centerId);
    const r = await api(`/api/finance/summary?${params}`);
    const d = await r.json();
    if (d.success) setSummary(d);
    setLoading(false);
  }, [from, to, centerId]);

  useEffect(() => { load(); }, [load]);

  const profitColor = summary && summary.net_profit >= 0 ? '#15803d' : '#dc2626';

  const applyPreset = (f, t) => { setFrom(f); setTo(t); };

  const PRESETS = [
    { label: 'This Month',  f: monthStart(0),   t: today() },
    { label: 'Last Month',  f: monthStart(1),   t: monthEnd(1) },
    { label: 'This Quarter',f: quarterStart(),  t: today() },
    { label: 'Current FY',  f: fyStart(0),      t: today() },
    { label: 'Last FY',     f: fyStart(1),      t: fyEnd(1) },
  ];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        {/* Quick presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button key={p.label}
              onClick={() => applyPreset(p.f, p.t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                ${from === p.f && to === p.t
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {/* Custom date range */}
        <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-slate-100">
          <div>
            <label className={labelCls}>From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls + ' w-40'} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls + ' w-40'} />
          </div>
          <button onClick={load}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            Apply
          </button>
          <div className="ml-auto flex items-center">
            <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${centerId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
              {centerId ? `📍 ${centerName}` : '🏢 All Centers'}
            </span>
          </div>
        </div>
      </div>

      {loading ? <Spin /> : summary && (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard label="Total Revenue"  value={fmt(summary.total_revenue)} color="#15803d"
              icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            <KpiCard label="Total Expenses" value={fmt(summary.total_expense)} color="#dc2626"
              icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            <KpiCard label="Net Profit" value={fmt(summary.net_profit)} color={profitColor}
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              sub={summary.net_profit >= 0 ? 'Profitable period' : 'Loss period'} />
            <KpiCard label="Cash Balance"   value={fmt(summary.cash_balance)} color="#0369a1"
              sub={centerId ? 'Entity-wide (all centers)' : undefined}
              icon="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            <KpiCard label="AR Outstanding" value={fmt(summary.ar_balance)} color="#b45309"
              icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            <KpiCard label="AP Outstanding" value={fmt(summary.ap_balance)} color="#7c3aed"
              icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
          </div>

          {/* Profit margin bar */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-slate-700">Revenue vs Expenses</p>
              <span className="text-sm font-bold" style={{ color: profitColor }}>
                {summary.total_revenue > 0
                  ? `${((summary.net_profit / summary.total_revenue) * 100).toFixed(1)}% margin`
                  : 'No revenue'}
              </span>
            </div>
            <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
              {summary.total_revenue > 0 && (
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (summary.total_expense / summary.total_revenue) * 100)}%`,
                    background: summary.net_profit >= 0 ? 'linear-gradient(90deg,#15803d,#16a34a)' : 'linear-gradient(90deg,#dc2626,#ef4444)',
                  }} />
              )}
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-400">
              <span>Expenses: {fmt(summary.total_expense)}</span>
              <span>Revenue: {fmt(summary.total_revenue)}</span>
            </div>
          </div>

          {/* Journal status tiles */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="font-semibold text-slate-700 mb-4">Journal Entry Summary</p>
            <div className="grid grid-cols-3 gap-4">
              {['DRAFT','POSTED','REVERSED'].map(s => (
                <div key={s} className="rounded-xl p-4 text-center"
                  style={{ background: JE_STATUS[s]?.bg }}>
                  <p className="text-2xl font-black" style={{ color: JE_STATUS[s]?.color }}>
                    {summary.journals?.[s] || 0}
                  </p>
                  <p className="text-xs font-semibold mt-1" style={{ color: JE_STATUS[s]?.color }}>
                    {JE_STATUS[s]?.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB 2 — CHART OF ACCOUNTS
// ════════════════════════════════════════════════════════════════
const ACCOUNT_TYPES   = ['BALANCE_SHEET', 'INCOME_STATEMENT'];
const ACCOUNT_CATS    = ['ASSET','LIABILITY','EQUITY','REVENUE','COGS','EXPENSE'];
const NORMAL_BALANCES = ['debit','credit'];
const EMPTY_ACC = {
  account_code: '', account_name: '', account_type: 'BALANCE_SHEET',
  account_category: 'ASSET', normal_balance: 'debit',
  parent_account_id: '', opening_balance: '0', description: '',
};

function AccountsTab() {
  const { has } = getPermissions();
  const [flat, setFlat]       = useState([]);
  const [search, setSearch]   = useState('');
  const [catFilter, setCat]   = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // null | {mode:'create'|'edit', acc?}
  const [form, setForm]       = useState(EMPTY_ACC);
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [expanded, setExpanded] = useState(new Set(['1000','1100','1200','2000','3000','3100','4000','5000']));

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api('/api/finance/accounts?active=all&flat=true');
    const d = await r.json();
    if (d.success) setFlat(d.accounts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sf = v => e => setForm(f => ({ ...f, [v]: e.target.value }));

  const openCreate = () => { setForm(EMPTY_ACC); setSaveErr(''); setModal({ mode: 'create' }); };
  const openEdit   = acc => {
    setForm({
      account_code: acc.account_code, account_name: acc.account_name,
      account_type: acc.account_type, account_category: acc.account_category,
      normal_balance: acc.normal_balance,
      parent_account_id: acc.parent_account_id || '',
      opening_balance: acc.opening_balance || '0',
      description: acc.description || '',
    });
    setSaveErr('');
    setModal({ mode: 'edit', acc });
  };

  const handleSave = async () => {
    setSaving(true); setSaveErr('');
    const body = { ...form, parent_account_id: form.parent_account_id || null };
    const isEdit = modal.mode === 'edit';
    const r = await api(
      isEdit ? `/api/finance/accounts/${modal.acc.id}` : '/api/finance/accounts',
      { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(body) }
    );
    const d = await r.json();
    if (!r.ok) { setSaveErr(d.error || 'Save failed'); setSaving(false); return; }
    await load();
    setModal(null);
    setSaving(false);
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this account?')) return;
    await api(`/api/finance/accounts/${id}`, { method: 'DELETE' });
    load();
  };

  const toggleExpand = code => setExpanded(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });

  // Build display list with indent (flat, filtered, indented)
  const filtered = flat.filter(a => {
    if (catFilter !== 'ALL' && a.account_category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.account_code.toLowerCase().includes(q) || a.account_name.toLowerCase().includes(q);
    }
    return true;
  });

  // For tree display — only show accounts whose parents are expanded
  const isVisible = acc => {
    if (catFilter !== 'ALL' || search) return true; // flat when filtering
    let cur = acc;
    while (cur.parent_account_id) {
      const parent = flat.find(a => a.id === cur.parent_account_id);
      if (!parent) break;
      if (!expanded.has(parent.account_code)) return false;
      cur = parent;
    }
    return true;
  };

  const hasChildren = acc => flat.some(a => a.parent_account_id === acc.id);

  // Recursively sum current_balance of all descendants (for collapsed group headers)
  const getSubtotal = acc => {
    const children = flat.filter(a => a.parent_account_id === acc.id);
    const own = parseFloat(acc.current_balance || 0);
    if (!children.length) return own;
    return own + children.reduce((sum, child) => sum + getSubtotal(child), 0);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or name…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="flex flex-wrap gap-1">
          {['ALL', ...ACCOUNT_CATS].map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${catFilter === c ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              style={catFilter === c && CAT_CFG[c] ? { background: CAT_CFG[c].bg, color: CAT_CFG[c].color } : {}}>
              {c === 'ALL' ? 'All' : CAT_CFG[c]?.label || c}
            </button>
          ))}
        </div>
        {has('COA_WRITE') && (
        <button onClick={openCreate}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Account
        </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? <Spin /> : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filtered.filter(isVisible).map(acc => {
                const catCfg = CAT_CFG[acc.account_category] || {};
                const isGroup = acc.account_level <= 2;
                return (
                  <div key={acc.id} className={`p-3 ${isGroup ? 'bg-slate-50' : ''} ${!acc.is_active ? 'opacity-40' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-bold text-slate-500">{acc.account_code}</span>
                        <p className={`text-sm mt-0.5 ${isGroup ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{acc.account_name}</p>
                      </div>
                      {has('COA_WRITE') && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => openEdit(acc)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        {acc.is_active && (
                          <button onClick={() => handleDeactivate(acc.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                          </button>
                        )}
                      </div>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                      <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: catCfg.bg, color: catCfg.color }}>{catCfg.label || acc.account_category}</span>
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${acc.normal_balance === 'debit' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>{acc.normal_balance === 'debit' ? 'Dr' : 'Cr'}</span>
                      {(() => { const v = hasChildren(acc) ? getSubtotal(acc) : parseFloat(acc.current_balance || 0); return v !== 0 ? <span className="font-mono font-semibold text-slate-700">{fmt(v)}</span> : null; })()}
                      {!acc.is_active && <span className="bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">Inactive</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide w-32">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Account Name</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Normal Bal</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide w-32">Opening Bal</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide w-32">Current Bal</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide w-20">Status</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.filter(isVisible).map(acc => {
                    const indent = (acc.account_level - 1) * 16;
                    const catCfg = CAT_CFG[acc.account_category] || {};
                    const hasKids = hasChildren(acc);
                    const isOpen = expanded.has(acc.account_code);
                    const isGroup = acc.account_level <= 2;
                    return (
                      <tr key={acc.id}
                        className={`hover:bg-blue-50/40 transition-colors ${isGroup ? 'bg-slate-50/60' : ''} ${!acc.is_active ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs font-bold text-slate-600">{acc.account_code}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2" style={{ paddingLeft: indent }}>
                            {hasKids && !search && catFilter === 'ALL' ? (
                              <button onClick={() => toggleExpand(acc.account_code)}
                                className="w-4 h-4 rounded flex items-center justify-center text-slate-400 hover:text-blue-600 flex-shrink-0">
                                <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            ) : (
                              <span className="w-4 flex-shrink-0" />
                            )}
                            <span className={`${isGroup ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{acc.account_name}</span>
                            {acc.journal_only && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap flex-shrink-0">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                Non Item Master
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: catCfg.bg, color: catCfg.color }}>{catCfg.label || acc.account_category}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-xs font-semibold ${acc.normal_balance === 'debit' ? 'text-blue-600' : 'text-emerald-600'}`}>{acc.normal_balance === 'debit' ? 'Dr' : 'Cr'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono text-slate-600">{acc.opening_balance != 0 ? fmt(acc.opening_balance) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono font-semibold text-slate-800">{(() => { const v = hasKids ? getSubtotal(acc) : parseFloat(acc.current_balance || 0); return v !== 0 ? fmt(v) : '—'; })()}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${acc.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{acc.is_active ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {has('COA_WRITE') && (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEdit(acc)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            {acc.is_active && (
                              <button onClick={() => handleDeactivate(acc.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                              </button>
                            )}
                          </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">{filtered.length} accounts</div>
            </div>
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{modal.mode === 'create' ? 'New Account' : 'Edit Account'}</h3>
              <button onClick={() => setModal(null)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Account Code *</label>
                  <input value={form.account_code} onChange={sf('account_code')} className={inputCls}
                    placeholder="e.g. 4110" disabled={modal.mode === 'edit'} />
                </div>
                <div>
                  <label className={labelCls}>Account Name *</label>
                  <input value={form.account_name} onChange={sf('account_name')} className={inputCls} placeholder="e.g. CT Scan Revenue" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Type *</label>
                  <select value={form.account_type} onChange={sf('account_type')} className={inputCls}>
                    {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Category *</label>
                  <select value={form.account_category} onChange={sf('account_category')} className={inputCls}>
                    {ACCOUNT_CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Normal Balance</label>
                  <select value={form.normal_balance} onChange={sf('normal_balance')} className={inputCls}>
                    {NORMAL_BALANCES.map(b => <option key={b} value={b}>{b === 'debit' ? 'Debit (Dr)' : 'Credit (Cr)'}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Parent Account</label>
                  <select value={form.parent_account_id} onChange={sf('parent_account_id')} className={inputCls}>
                    <option value="">— None (Top Level) —</option>
                    {flat.filter(a => a.account_level <= 3 && a.is_active).map(a => (
                      <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Opening Balance (₹)</label>
                <input type="number" value={form.opening_balance} onChange={sf('opening_balance')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea value={form.description} onChange={sf('description')} rows={2} className={inputCls} placeholder="Optional notes about this account" />
              </div>
              {saveErr && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{saveErr}</p>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : modal.mode === 'create' ? 'Create Account' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — FINANCE SETTINGS
// ════════════════════════════════════════════════════════════════
const FINANCE_SETTINGS_PAGES = [
  { key: 'cat-coa',  label: 'Category & COA Mapping' },
  { key: 'gl-rules', label: 'Transaction GL Rules' },
];

function FinanceSettingsTab() {
  const [page, setPage] = useState('cat-coa');
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200">
        {FINANCE_SETTINGS_PAGES.map(p => (
          <button key={p.key} onClick={() => setPage(p.key)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              page === p.key
                ? 'border-slate-700 text-slate-800'
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
            }`}>
            {p.label}
          </button>
        ))}
      </div>
      {page === 'cat-coa'  && <CategoryMappingSettings />}
      {page === 'gl-rules' && <TransactionGLRulesPage />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB 3 — JOURNAL ENTRIES
// ════════════════════════════════════════════════════════════════
const EMPTY_LINE = { account_id: '', debit_amount: '', credit_amount: '', description: '' };

function JournalsTab({ centerId = '', centerName = 'All Centers' }) {
  const { has } = getPermissions();
  const [journals, setJournals] = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [statusFilter, setStatus] = useState('ALL');
  const [search, setSearch]     = useState('');
  const [from, setFrom]         = useState(fyStart());
  const [to, setTo]             = useState(today());
  const [page, setPage]         = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail]     = useState(null);
  const [accounts, setAccounts] = useState([]);

  // Form state
  const [jeForm, setJEForm] = useState({ entry_date: today(), description: '', notes: '' });
  const [lines, setLines]   = useState([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 25, from, to });
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (search) params.set('search', search);
    if (centerId) params.set('center_id', centerId);
    const r = await api(`/api/finance/journals?${params}`);
    const d = await r.json();
    if (d.success) { setJournals(d.journals); setTotal(d.total); }
    setLoading(false);
  }, [page, statusFilter, search, from, to, centerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api('/api/finance/accounts?flat=true&active=true').then(r => r.json()).then(d => {
      if (d.success) setAccounts(d.accounts);
    });
  }, []);

  const setLine = (i, field) => e => {
    const val = e.target.value;
    setLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: val };
      // Auto-clear opposite side
      if (field === 'debit_amount'  && val) next[i].credit_amount = '';
      if (field === 'credit_amount' && val) next[i].debit_amount  = '';
      return next;
    });
  };

  const addLine    = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);
  const removeLine = i  => setLines(prev => prev.filter((_, idx) => idx !== i));

  const totalDr = lines.reduce((s, l) => s + parseFloat(l.debit_amount  || 0), 0);
  const totalCr = lines.reduce((s, l) => s + parseFloat(l.credit_amount || 0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  const handleCreate = async () => {
    setFormErr('');
    const activeLines = lines.filter(l => l.account_id && (parseFloat(l.debit_amount || 0) || parseFloat(l.credit_amount || 0)));
    if (activeLines.length < 2) { setFormErr('At least two line items required'); return; }
    if (!balanced) { setFormErr(`Journal does not balance — Dr: ${fmt(totalDr)}, Cr: ${fmt(totalCr)}`); return; }
    setSaving(true);
    const r = await api('/api/finance/journals', {
      method: 'POST',
      body: JSON.stringify({ ...jeForm, lines: activeLines }),
    });
    const d = await r.json();
    if (!r.ok) { setFormErr(d.error || 'Save failed'); setSaving(false); return; }
    setSaving(false);
    setShowForm(false);
    setJEForm({ entry_date: today(), description: '', notes: '' });
    setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
    load();
  };

  const handlePost = async id => {
    if (!window.confirm('Post this journal entry? This cannot be undone.')) return;
    await api(`/api/finance/journals/${id}/post`, { method: 'POST' });
    load();
    if (detail?.journal?.id === id) {
      const r = await api(`/api/finance/journals/${id}`);
      const d = await r.json();
      if (d.success) setDetail(d);
    }
  };

  const handleReverse = async id => {
    const reason = window.prompt('Reason for reversal:');
    if (reason === null) return;
    await api(`/api/finance/journals/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) });
    load();
    setDetail(null);
  };

  const openDetail = async id => {
    const r = await api(`/api/finance/journals/${id}`);
    const d = await r.json();
    if (d.success) setDetail(d);
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="relative flex-1 min-w-[180px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search JE number or description…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className={labelCls}>From</label>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className={inputCls + ' w-36'} />
        </div>
        <div>
          <label className={labelCls}>To</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className={inputCls + ' w-36'} />
        </div>
        <div className="flex gap-1">
          {['ALL','DRAFT','POSTED','REVERSED'].map(s => (
            <button key={s} onClick={() => { setStatus(s); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {s === 'ALL' ? 'All' : s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {centerId && (
            <span className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              📍 {centerName}
            </span>
          )}
          {has('JE_WRITE') && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Journal Entry
          </button>
          )}
        </div>
      </div>

      {/* Journal list */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? <Spin /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide w-32">JE No.</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide w-32">Total Dr</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide w-32">Total Cr</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide w-24">Status</th>
                    <th className="px-4 py-3 w-28 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {journals.map(je => (
                    <tr key={je.id} className="hover:bg-blue-50/40 transition-colors cursor-pointer" onClick={() => openDetail(je.id)}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">
                        <div className="flex items-center gap-1">
                          {je.entry_number}
                          {je.is_auto_posted && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{ background: '#fef9c3', color: '#854d0e' }}>AUTO</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{fmtD(je.entry_date)}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-slate-700 truncate text-sm">{je.description || '—'}</p>
                        {je.source_ref && (
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            <span className="font-medium text-slate-500">{je.source_module}</span> · {je.source_ref}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-blue-700">{fmt(je.total_debit)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-emerald-700">{fmt(je.total_credit)}</td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <Badge cfg={JE_STATUS[je.status]} text={je.status} />
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {has('JE_WRITE') && je.status === 'DRAFT' && (
                            <button onClick={() => handlePost(je.id)}
                              className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
                              Post
                            </button>
                          )}
                          {has('JE_APPROVE') && je.status === 'POSTED' && (
                            <button onClick={() => handleReverse(je.id)}
                              className="px-2.5 py-1 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                              Reverse
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!journals.length && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">No journal entries found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{total} entries</span>
                <div className="flex items-center gap-2">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 rounded-lg bg-slate-100 disabled:opacity-40 hover:bg-slate-200">‹ Prev</button>
                  <span>Page {page} of {totalPages}</span>
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 rounded-lg bg-slate-100 disabled:opacity-40 hover:bg-slate-200">Next ›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Journal Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '92vh' }}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 rounded-t-2xl"
              style={{ background: 'linear-gradient(135deg,#1e3a5f,#1e40af)' }}>
              <h3 className="font-bold text-white text-base">New Journal Entry</h3>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Date *</label>
                  <input type="date" value={jeForm.entry_date}
                    onChange={e => setJEForm(f => ({ ...f, entry_date: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Description *</label>
                  <input value={jeForm.description}
                    onChange={e => setJEForm(f => ({ ...f, description: e.target.value }))}
                    className={inputCls} placeholder="e.g. Monthly rent payment" />
                </div>
              </div>

              {/* Lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls}>Journal Lines</label>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${balanced && totalDr > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      Dr {fmt(totalDr)} / Cr {fmt(totalCr)} {balanced && totalDr > 0 ? '✓ Balanced' : '⚠ Unbalanced'}
                    </span>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase">Account</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase">Narration</th>
                        <th className="px-3 py-2 text-right font-bold text-blue-600 uppercase w-28">Debit (Dr)</th>
                        <th className="px-3 py-2 text-right font-bold text-emerald-600 uppercase w-28">Credit (Cr)</th>
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((l, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-2 py-1.5">
                            <select value={l.account_id} onChange={setLine(i, 'account_id')}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                              <option value="">— Select Account —</option>
                              {accounts.filter(a => a.account_level > 2).map(a => (
                                <option key={a.id} value={a.id}>
                                  {a.account_code} — {a.account_name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={l.description} onChange={setLine(i, 'description')}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                              placeholder="Narration…" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min="0" value={l.debit_amount} onChange={setLine(i, 'debit_amount')}
                              className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                              placeholder="0.00" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min="0" value={l.credit_amount} onChange={setLine(i, 'credit_amount')}
                              className="w-full border border-emerald-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-400"
                              placeholder="0.00" />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            {lines.length > 2 && (
                              <button onClick={() => removeLine(i)}
                                className="w-5 h-5 rounded-full bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200">
                        <td colSpan={2} className="px-3 py-2">
                          <button onClick={addLine} className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Line
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700 text-xs font-mono">{fmt(totalDr)}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-700 text-xs font-mono">{fmt(totalCr)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={jeForm.notes} onChange={e => setJEForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className={inputCls} placeholder="Optional internal notes…" />
              </div>

              {formErr && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{formErr}</p>}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !balanced || totalDr === 0}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '88vh' }}>
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl"
              style={{ background: 'linear-gradient(135deg,#1e3a5f,#1e40af)' }}>
              <div>
                <p className="text-white font-bold">{detail.journal.entry_number}</p>
                <p className="text-blue-200 text-xs mt-0.5">{fmtD(detail.journal.entry_date)} · {detail.journal.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge cfg={JE_STATUS[detail.journal.status]} text={detail.journal.status} />
                <button onClick={() => setDetail(null)} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="pb-2 text-left text-xs font-bold text-slate-500 uppercase">Account</th>
                    <th className="pb-2 text-left text-xs font-bold text-slate-500 uppercase">Narration</th>
                    <th className="pb-2 text-right text-xs font-bold text-blue-600 uppercase w-28">Debit (Dr)</th>
                    <th className="pb-2 text-right text-xs font-bold text-emerald-600 uppercase w-28">Credit (Cr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lines.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="py-2.5">
                        <span className="font-mono text-xs text-slate-500">{l.account_code}</span>
                        <span className="ml-2 font-semibold text-slate-800">{l.account_name}</span>
                      </td>
                      <td className="py-2.5 text-xs text-slate-500">{l.description || '—'}</td>
                      <td className="py-2.5 text-right font-mono font-semibold text-blue-700">
                        {parseFloat(l.debit_amount) > 0 ? fmt(l.debit_amount) : '—'}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-emerald-700">
                        {parseFloat(l.credit_amount) > 0 ? fmt(l.credit_amount) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-bold">
                    <td colSpan={2} className="pt-2 text-xs text-slate-500 uppercase">Total</td>
                    <td className="pt-2 text-right font-mono text-blue-700">{fmt(detail.journal.total_debit)}</td>
                    <td className="pt-2 text-right font-mono text-emerald-700">{fmt(detail.journal.total_credit)}</td>
                  </tr>
                </tfoot>
              </table>
              {detail.journal.notes && (
                <div className="mt-4 bg-slate-50 rounded-xl px-4 py-3 text-xs text-slate-600">
                  <span className="font-bold text-slate-500 uppercase">Notes: </span>{detail.journal.notes}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 flex justify-between items-center flex-shrink-0">
              <p className="text-xs text-slate-400">Created by {detail.journal.created_by_name || '—'}</p>
              <div className="flex gap-2">
                {detail.journal.status === 'DRAFT' && (
                  <button onClick={() => handlePost(detail.journal.id)}
                    className="px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100">
                    Post Entry
                  </button>
                )}
                {detail.journal.status === 'POSTED' && (
                  <button onClick={() => handleReverse(detail.journal.id)}
                    className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 rounded-xl hover:bg-red-100">
                    Reverse
                  </button>
                )}
                <button onClick={() => setDetail(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB 4 — REPORTS
// ════════════════════════════════════════════════════════════════
function ReportsTab({ centerId = '', centerName = 'All Centers' }) {
  const [report,   setReport]   = useState('pl');
  const [from,     setFrom]     = useState(fyStart());
  const [to,       setTo]       = useState(today());
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setData(null);
    const cParam = centerId ? `&center_id=${centerId}` : '';
    let r;
    if (report === 'pl') r = await api(`/api/finance/reports/profit-loss?from=${from}&to=${to}${cParam}`);
    else if (report === 'bs') r = await api(`/api/finance/reports/balance-sheet?as_of=${to}`);
    else r = await api(`/api/finance/reports/trial-balance?from=${from}&to=${to}${cParam}`);
    const d = await r.json();
    if (d.success) setData(d);
    setLoading(false);
  }, [report, from, to, centerId]);

  useEffect(() => { load(); }, [load]);

  const renderPL = () => {
    if (!data?.rows) return null;
    const rev  = data.rows.filter(r => r.account_category === 'REVENUE');
    const cogs = data.rows.filter(r => r.account_category === 'COGS');
    const exp  = data.rows.filter(r => r.account_category === 'EXPENSE');

    const totalRev  = rev.reduce((s, r)  => s + parseFloat(r.net_amount || 0), 0);
    const totalCOGS = cogs.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
    const grossProfit = totalRev - totalCOGS;
    const totalExp  = exp.reduce((s, r)  => s + parseFloat(r.net_amount || 0), 0);
    const netProfit = grossProfit - totalExp;

    const renderSection = (rows, color) => (
      rows.filter(r => parseFloat(r.net_amount || 0) !== 0 && r.account_level > 1).map(r => (
        <tr key={r.account_code} className="hover:bg-slate-50/50 transition-colors">
          <td className="py-2 pl-4 text-slate-500 font-mono text-xs w-24">{r.account_code}</td>
          <td className="py-2" style={{ paddingLeft: `${(r.account_level - 2) * 16 + 8}px` }}>
            <span className={r.account_level <= 2 ? 'font-semibold text-slate-800' : 'text-slate-700'}>{r.account_name}</span>
          </td>
          <td className="py-2 text-right pr-4 font-mono text-sm font-semibold" style={{ color }}>
            {parseFloat(r.net_amount) !== 0 ? fmt(r.net_amount) : ''}
          </td>
        </tr>
      ))
    );

    const SumRow = ({ label, value, bold, bg, color }) => (
      <tr style={{ background: bg || 'transparent' }}>
        <td className="py-2.5 pl-4 text-xs text-slate-400 font-mono"></td>
        <td className="py-2.5 pl-2" style={{ paddingLeft: 8 }}>
          <span className={`text-sm ${bold ? 'font-bold' : 'font-semibold'}`} style={{ color: color || '#1e293b' }}>{label}</span>
        </td>
        <td className="py-2.5 text-right pr-4 font-mono font-bold" style={{ color: color || '#1e293b' }}>{fmt(value)}</td>
      </tr>
    );

    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="pb-2 pl-4 text-left text-xs font-bold text-slate-400 uppercase w-24">Code</th>
            <th className="pb-2 pl-2 text-left text-xs font-bold text-slate-400 uppercase">Account</th>
            <th className="pb-2 pr-4 text-right text-xs font-bold text-slate-400 uppercase w-36">Amount (₹)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          <tr><td colSpan={3} className="pt-4 pb-1 pl-4 text-xs font-black text-emerald-700 uppercase tracking-widest bg-emerald-50">Revenue</td></tr>
          {renderSection(rev, '#15803d')}
          <SumRow label="Total Revenue" value={totalRev} color="#15803d" bold bg="#f0fdf4" />
          <tr><td colSpan={3} className="pt-4 pb-1 pl-4 text-xs font-black text-rose-700 uppercase tracking-widest bg-rose-50">Cost of Services</td></tr>
          {renderSection(cogs, '#be123c')}
          <SumRow label="Total Cost of Services" value={totalCOGS} color="#be123c" />
          <SumRow label="Gross Profit" value={grossProfit} color={grossProfit >= 0 ? '#15803d' : '#dc2626'} bold bg={grossProfit >= 0 ? '#f0fdf4' : '#fef2f2'} />
          <tr><td colSpan={3} className="pt-4 pb-1 pl-4 text-xs font-black text-red-700 uppercase tracking-widest bg-red-50">Operating Expenses</td></tr>
          {renderSection(exp, '#dc2626')}
          <SumRow label="Total Expenses" value={totalExp} color="#dc2626" />
          <tr><td colSpan={3} className="h-1 bg-slate-200" /></tr>
          <SumRow label="Net Profit / (Loss)" value={netProfit} color={netProfit >= 0 ? '#15803d' : '#dc2626'} bold
            bg={netProfit >= 0 ? '#dcfce7' : '#fee2e2'} />
        </tbody>
      </table>
    );
  };

  const renderBS = () => {
    if (!data?.rows) return null;
    const assets = data.rows.filter(r => r.account_category === 'ASSET');
    const liabs  = data.rows.filter(r => r.account_category === 'LIABILITY');
    const equity = data.rows.filter(r => r.account_category === 'EQUITY');
    const totalAssets = assets.reduce((s, r) => s + parseFloat(r.balance || 0), 0);
    const totalLiab   = liabs.reduce((s, r)  => s + parseFloat(r.balance || 0), 0);
    const totalEquity = equity.reduce((s, r) => s + parseFloat(r.balance || 0), 0);

    const renderSection = (rows, color) =>
      rows.filter(r => parseFloat(r.balance || 0) !== 0 && r.account_level > 1).map(r => (
        <tr key={r.account_code} className="hover:bg-slate-50/50">
          <td className="py-2 pl-4 text-slate-500 font-mono text-xs w-24">{r.account_code}</td>
          <td className="py-2" style={{ paddingLeft: `${(r.account_level - 2) * 16 + 8}px` }}>
            <span className={r.account_level <= 2 ? 'font-semibold text-slate-800' : 'text-slate-700'}>{r.account_name}</span>
          </td>
          <td className="py-2 text-right pr-4 font-mono text-sm font-semibold" style={{ color }}>
            {fmt(r.balance)}
          </td>
        </tr>
      ));

    const SumRow = ({ label, value, color, bg, bold }) => (
      <tr style={{ background: bg || 'transparent' }}>
        <td className="py-2.5 pl-4"></td>
        <td className="py-2.5 pl-2">
          <span className={`text-sm ${bold ? 'font-bold' : 'font-semibold'}`} style={{ color: color || '#1e293b' }}>{label}</span>
        </td>
        <td className="py-2.5 text-right pr-4 font-mono font-bold" style={{ color: color || '#1e293b' }}>{fmt(value)}</td>
      </tr>
    );

    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="pb-2 pl-4 text-left text-xs font-bold text-slate-400 uppercase w-24">Code</th>
            <th className="pb-2 pl-2 text-left text-xs font-bold text-slate-400 uppercase">Account</th>
            <th className="pb-2 pr-4 text-right text-xs font-bold text-slate-400 uppercase w-36">Balance (₹)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          <tr><td colSpan={3} className="pt-4 pb-1 pl-4 text-xs font-black text-blue-700 uppercase tracking-widest bg-blue-50">Assets</td></tr>
          {renderSection(assets, '#0369a1')}
          <SumRow label="Total Assets" value={totalAssets} color="#0369a1" bold bg="#eff6ff" />
          <tr><td colSpan={3} className="pt-4 pb-1 pl-4 text-xs font-black text-amber-700 uppercase tracking-widest bg-amber-50">Liabilities</td></tr>
          {renderSection(liabs, '#b45309')}
          <SumRow label="Total Liabilities" value={totalLiab} color="#b45309" bold bg="#fefce8" />
          <tr><td colSpan={3} className="pt-4 pb-1 pl-4 text-xs font-black text-violet-700 uppercase tracking-widest bg-violet-50">Equity</td></tr>
          {renderSection(equity, '#7c3aed')}
          <SumRow label="Total Equity" value={totalEquity} color="#7c3aed" bold bg="#f5f3ff" />
          <tr><td colSpan={3} className="h-1 bg-slate-200" /></tr>
          <SumRow label="Total Liabilities + Equity" value={totalLiab + totalEquity}
            color={Math.abs(totalAssets - (totalLiab + totalEquity)) < 1 ? '#15803d' : '#dc2626'}
            bold bg={Math.abs(totalAssets - (totalLiab + totalEquity)) < 1 ? '#dcfce7' : '#fee2e2'} />
        </tbody>
      </table>
    );
  };

  const renderTB = () => {
    if (!data?.rows) return null;
    const totalDr = data.rows.reduce((s, r) => s + parseFloat(r.period_debit || 0), 0);
    const totalCr = data.rows.reduce((s, r) => s + parseFloat(r.period_credit || 0), 0);
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b-2 border-slate-200">
            <th className="py-3 pl-4 text-left text-xs font-bold text-slate-500 uppercase w-24">Code</th>
            <th className="py-3 pl-2 text-left text-xs font-bold text-slate-500 uppercase">Account Name</th>
            <th className="py-3 text-right text-xs font-bold text-slate-500 uppercase w-28">Category</th>
            <th className="py-3 text-right text-xs font-bold text-slate-500 uppercase w-28">Opening</th>
            <th className="py-3 text-right text-xs font-bold text-blue-600 uppercase w-28">Debit</th>
            <th className="py-3 text-right text-xs font-bold text-emerald-600 uppercase w-28">Credit</th>
            <th className="py-3 pr-4 text-right text-xs font-bold text-slate-500 uppercase w-28">Closing</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.rows.filter(r => r.account_level > 1).map(r => {
            const catCfg = CAT_CFG[r.account_category] || {};
            return (
              <tr key={r.account_code} className="hover:bg-blue-50/30 transition-colors">
                <td className="py-2 pl-4 font-mono text-xs text-slate-500">{r.account_code}</td>
                <td className="py-2 pl-2">
                  <span className={r.account_level <= 2 ? 'font-semibold text-slate-800' : 'text-slate-700'} style={{ marginLeft: (r.account_level - 2) * 12 }}>
                    {r.account_name}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: catCfg.bg, color: catCfg.color }}>
                    {catCfg.label || r.account_category}
                  </span>
                </td>
                <td className="py-2 text-right font-mono text-xs text-slate-500">{parseFloat(r.opening_balance) !== 0 ? fmt(r.opening_balance) : '—'}</td>
                <td className="py-2 text-right font-mono text-xs text-blue-700 font-semibold">{parseFloat(r.period_debit) !== 0 ? fmt(r.period_debit) : '—'}</td>
                <td className="py-2 text-right font-mono text-xs text-emerald-700 font-semibold">{parseFloat(r.period_credit) !== 0 ? fmt(r.period_credit) : '—'}</td>
                <td className="py-2 pr-4 text-right font-mono text-sm font-bold" style={{ color: parseFloat(r.closing_balance) >= 0 ? '#0369a1' : '#dc2626' }}>
                  {fmt(r.closing_balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
            <td colSpan={4} className="py-3 pl-4 text-xs text-slate-500 uppercase">Totals</td>
            <td className="py-3 text-right font-mono text-sm text-blue-700">{fmt(totalDr)}</td>
            <td className="py-3 text-right font-mono text-sm text-emerald-700">{fmt(totalCr)}</td>
            <td className="py-3 pr-4 text-right font-mono text-sm" style={{ color: Math.abs(totalDr - totalCr) < 1 ? '#15803d' : '#dc2626' }}>
              {Math.abs(totalDr - totalCr) < 1 ? '✓ Balanced' : `Diff: ${fmt(Math.abs(totalDr - totalCr))}`}
            </td>
          </tr>
        </tfoot>
      </table>
    );
  };

  const reportTitles = { pl: 'Profit & Loss Statement', bs: 'Balance Sheet', tb: 'Trial Balance' };

  const printReport = useCallback(async () => {
    if (!data?.rows) return;
    const title = reportTitles[report];
    const subtitle = report === 'bs'
      ? `As of ${fmtD(to)} · ${centerName}`
      : `${fmtD(from)} – ${fmtD(to)} · ${centerName}`;

    // Fetch company info + logo
    let co = {};
    let logoDataUrl = null;
    try {
      const res = await fetch('/api/settings/company', { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) { const j = await res.json(); co = j.company || {}; }
    } catch { /* proceed without */ }
    if (co.logo_path) {
      try {
        const imgRes = await fetch(co.logo_path);
        const blob = await imgRes.blob();
        logoDataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch { logoDataUrl = null; }
    }

    // Trial Balance needs landscape for 7 columns; P&L and BS use portrait
    const orientation = report === 'tb' ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const MARGIN = 14;
    const NAVY = [30, 64, 175];
    const TEAL = [15, 118, 110];

    const drawLetterhead = () => {
      const LOGO_MAX_W = 36, LOGO_MAX_H = 14;
      const LOGO_X = MARGIN, LOGO_Y = 5;
      const rightX = pageW - MARGIN;
      const midY = LOGO_Y + LOGO_MAX_H / 2;
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, pageW, 1.5, 'F');
      if (logoDataUrl) {
        try {
          const props = doc.getImageProperties(logoDataUrl);
          const scale = Math.min(LOGO_MAX_W / (props.width || 200), LOGO_MAX_H / (props.height || 80));
          doc.addImage(logoDataUrl, LOGO_X, LOGO_Y, (props.width || 200) * scale, (props.height || 80) * scale, '', 'FAST');
        } catch { /* skip */ }
      }
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
      doc.text(co.company_name || 'ARIS Healthcare', rightX, midY - 1, { align: 'right' });
      if (co.tagline) {
        doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(110, 110, 110);
        doc.text(co.tagline, rightX, midY + 4, { align: 'right' });
      }
      const divY = LOGO_Y + LOGO_MAX_H + 3;
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.4);
      doc.line(MARGIN, divY, pageW - MARGIN, divY);
      return divY + 5;
    };

    const drawFooter = (pageH) => {
      const footerY = pageH - 12;
      doc.setDrawColor(...TEAL); doc.setLineWidth(0.3);
      doc.line(MARGIN, footerY - 2, pageW - MARGIN, footerY - 2);
      const addr = [co.address_line1, co.address_line2, [co.city, co.state, co.pincode].filter(Boolean).join(', ')].filter(Boolean).join(', ');
      const contacts = [co.phone && `Ph: ${co.phone}`, co.email && `Email: ${co.email}`].filter(Boolean).join('  |  ');
      const regInfo = [co.gstin && `GSTIN: ${co.gstin}`, co.pan_number && `PAN: ${co.pan_number}`].filter(Boolean).join('  |  ');
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.setTextColor(70, 70, 70);
      if (addr) doc.text(addr, pageW / 2, footerY + 2, { align: 'center' });
      if (contacts) doc.text(contacts, pageW / 2, footerY + 6, { align: 'center' });
      if (regInfo) { doc.setTextColor(120, 120, 120); doc.text(regInfo, pageW / 2, footerY + 10, { align: 'center' }); }
    };

    let startY = drawLetterhead();
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(title, MARGIN, startY);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
    doc.text(subtitle, MARGIN, startY + 5);
    startY += 12;

    const pageH = doc.internal.pageSize.getHeight();
    // jsPDF built-in Helvetica is Latin-1 only — ₹ (U+20B9) renders as garbage.
    // Use "Rs." prefix instead, and avoid any non-Latin-1 characters.
    const fmtN = n => `Rs.${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Force exact column widths AND halign on every column via didParseCell.
    // This hook fires for every cell (head/body/foot) and is the most reliable
    // way to get consistent alignment in jspdf-autotable v5, regardless of how
    // the library merges headStyles vs columnStyles internally.
    //
    // Portrait A4 : 210 - 2*14 = 182mm  → col widths [22, 120, 40]
    // Landscape A4: 297 - 2*14 = 269mm  → col widths [18, 80, 22, 37, 38, 38, 36]

    const baseOpts = (colWidths, colAligns) => ({
      styles:     { fontSize: 8, cellPadding: 2.5, overflow: 'ellipsize' },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      margin:     { left: MARGIN, right: MARGIN },
      didAddPage: () => { drawLetterhead(); },
      didParseCell: (d) => {
        d.cell.styles.cellWidth = colWidths[d.column.index];
        d.cell.styles.halign    = colAligns[d.column.index] || 'left';
      },
    });

    // Portrait 3-col: [22, 120, 40] = 182mm, aligns [left, left, right]
    const P_W = [22, 120, 40];
    const P_A = ['left', 'left', 'right'];

    if (report === 'pl') {
      const rev  = data.rows.filter(r => r.account_category === 'REVENUE');
      const cogs = data.rows.filter(r => r.account_category === 'COGS');
      const exp  = data.rows.filter(r => r.account_category === 'EXPENSE');
      const totalRev    = rev.reduce((s, r)  => s + parseFloat(r.net_amount || 0), 0);
      const totalCOGS   = cogs.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
      const grossProfit = totalRev - totalCOGS;
      const totalExp    = exp.reduce((s, r)  => s + parseFloat(r.net_amount || 0), 0);
      const netProfit   = grossProfit - totalExp;

      const plSections = [
        { label: 'REVENUE',            src: rev,  total: totalRev,  footLabel: 'Total Revenue',          footColor: [21, 128, 61],  amtField: 'net_amount' },
        { label: 'COST OF SERVICES',   src: cogs, total: totalCOGS, footLabel: 'Total Cost of Services', footColor: [190, 18, 60],  amtField: 'net_amount' },
        { label: 'OPERATING EXPENSES', src: exp,  total: totalExp,  footLabel: 'Total Expenses',         footColor: [220, 38, 38],  amtField: 'net_amount' },
      ];
      for (const sec of plSections) {
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
        doc.text(sec.label, MARGIN, startY); startY += 4;
        autoTable(doc, {
          ...baseOpts(P_W, P_A),
          startY,
          head: [['Code', 'Account', 'Amount (Rs.)']],
          body: sec.src
            .filter(r => parseFloat(r[sec.amtField] || 0) !== 0 && r.account_level > 1)
            .map(r => [r.account_code, '  '.repeat(Math.max(0, r.account_level - 2)) + r.account_name, fmtN(r[sec.amtField])]),
          foot:       [['', sec.footLabel, fmtN(sec.total)]],
          footStyles: { fillColor: [240, 247, 255], fontStyle: 'bold', textColor: sec.footColor },
        });
        startY = doc.lastAutoTable.finalY + 6;
      }
      autoTable(doc, {
        ...baseOpts(P_W, P_A),
        startY,
        body: [
          ['', 'Gross Profit',        fmtN(grossProfit)],
          ['', 'Net Profit / (Loss)', fmtN(netProfit)],
        ],
        styles:     { fontSize: 9, fontStyle: 'bold', cellPadding: 2.5, overflow: 'ellipsize' },
        bodyStyles: { fillColor: [248, 250, 252], textColor: netProfit >= 0 ? [21, 128, 61] : [220, 38, 38] },
      });

    } else if (report === 'bs') {
      const assets = data.rows.filter(r => r.account_category === 'ASSET');
      const liabs  = data.rows.filter(r => r.account_category === 'LIABILITY');
      const equity = data.rows.filter(r => r.account_category === 'EQUITY');
      const totalAssets = assets.reduce((s, r) => s + parseFloat(r.balance || 0), 0);
      const totalLiab   = liabs.reduce((s, r)  => s + parseFloat(r.balance || 0), 0);
      const totalEquity = equity.reduce((s, r) => s + parseFloat(r.balance || 0), 0);

      const bsSections = [
        { label: 'ASSETS',      src: assets, total: totalAssets, footLabel: 'Total Assets',      footColor: [30, 64, 175]  },
        { label: 'LIABILITIES', src: liabs,  total: totalLiab,   footLabel: 'Total Liabilities', footColor: [180, 83, 9]   },
        { label: 'EQUITY',      src: equity, total: totalEquity, footLabel: 'Total Equity',      footColor: [124, 58, 237] },
      ];
      for (const sec of bsSections) {
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
        doc.text(sec.label, MARGIN, startY); startY += 4;
        autoTable(doc, {
          ...baseOpts(P_W, P_A),
          startY,
          head: [['Code', 'Account', 'Balance (Rs.)']],
          body: sec.src
            .filter(r => parseFloat(r.balance || 0) !== 0 && r.account_level > 1)
            .map(r => [r.account_code, '  '.repeat(Math.max(0, r.account_level - 2)) + r.account_name, fmtN(r.balance)]),
          foot:       [['', sec.footLabel, fmtN(sec.total)]],
          footStyles: { fillColor: [240, 247, 255], fontStyle: 'bold', textColor: sec.footColor },
        });
        startY = doc.lastAutoTable.finalY + 6;
      }
      const bsBalanced = Math.abs(totalAssets - (totalLiab + totalEquity)) < 1;
      autoTable(doc, {
        ...baseOpts(P_W, P_A),
        startY,
        body: [['', 'Total Liabilities + Equity', fmtN(totalLiab + totalEquity)]],
        styles: { fontSize: 9, fontStyle: 'bold', cellPadding: 2.5, overflow: 'ellipsize',
          fillColor: bsBalanced ? [220, 252, 231] : [254, 226, 226],
          textColor: bsBalanced ? [21, 128, 61]   : [220, 38, 38] },
      });

    } else if (report === 'tb') {
      // Landscape A4: 297-28=269mm → [18,80,22,37,38,38,36] = 269mm
      const TB_W = [18, 80, 22, 37, 38, 38, 36];
      const TB_A = ['left', 'left', 'left', 'right', 'right', 'right', 'right'];
      const totalDr  = data.rows.reduce((s, r) => s + parseFloat(r.period_debit  || 0), 0);
      const totalCr  = data.rows.reduce((s, r) => s + parseFloat(r.period_credit || 0), 0);
      const tbBalanced = Math.abs(totalDr - totalCr) < 1;
      autoTable(doc, {
        ...baseOpts(TB_W, TB_A),
        startY,
        styles:  { fontSize: 7.5, cellPadding: 2, overflow: 'ellipsize' },
        head: [['Code', 'Account Name', 'Category', 'Opening', 'Debit', 'Credit', 'Closing']],
        body: data.rows.filter(r => r.account_level > 1).map(r => [
          r.account_code,
          '  '.repeat(Math.max(0, r.account_level - 2)) + r.account_name,
          r.account_category,
          parseFloat(r.opening_balance) !== 0 ? fmtN(r.opening_balance) : '-',
          parseFloat(r.period_debit)    !== 0 ? fmtN(r.period_debit)    : '-',
          parseFloat(r.period_credit)   !== 0 ? fmtN(r.period_credit)   : '-',
          fmtN(r.closing_balance),
        ]),
        foot: [['', '', '', 'Totals', fmtN(totalDr), fmtN(totalCr),
          tbBalanced ? 'Balanced' : `Diff: ${fmtN(Math.abs(totalDr - totalCr))}`]],
        footStyles: { fillColor: [240, 247, 255], fontStyle: 'bold',
          textColor: tbBalanced ? [21, 128, 61] : [220, 38, 38] },
      });
    }

    // Footer on every page
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawFooter(pageH);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(160);
      doc.text(`Page ${p} of ${totalPages}  ·  ${new Date().toLocaleDateString('en-IN')}`, pageW - MARGIN, pageH - 14, { align: 'right' });
    }

    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, report, from, to, centerName]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex gap-1 flex-wrap">
          {[['pl','P & L'], ['bs','Balance Sheet'], ['tb','Trial Balance']].map(([k, l]) => (
            <button key={k} onClick={() => setReport(k)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${report === k ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {l}
            </button>
          ))}
        </div>
        {report !== 'bs' ? (
          <>
            <div>
              <label className={labelCls}>From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls + ' w-36'} />
            </div>
            <div>
              <label className={labelCls}>To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls + ' w-36'} />
            </div>
          </>
        ) : (
          <div>
            <label className={labelCls}>As of Date</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls + ' w-36'} />
          </div>
        )}
        <button onClick={load}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          Generate
        </button>
      </div>

      {/* Report output */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg,#1e3a5f,#1e40af)' }}>
          <div>
            <p className="text-white font-bold text-base">{reportTitles[report]}</p>
            <p className="text-blue-200 text-xs mt-0.5">
              {report === 'bs' ? `As of ${fmtD(to)}` : `${fmtD(from)} – ${fmtD(to)}`}
              {` · ${centerName}`}
            </p>
          </div>
          <button onClick={printReport} disabled={!data}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/20 text-white text-xs font-semibold rounded-xl hover:bg-white/30 transition-colors disabled:opacity-40">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>
        {loading ? <Spin /> : (
          <div className="overflow-x-auto">
            {report === 'pl' && renderPL()}
            {report === 'bs' && renderBS()}
            {report === 'tb' && renderTB()}
          </div>
        )}
      </div>
    </div>
  );
}

const MODULE_LABELS = {
  BILLING_PAYMENT: 'Billing – Payment Method',
  BILLING_REVENUE: 'Billing – Revenue',
  BILLING_GST:     'Billing – GST',
  PO_COMPLETED:    'Procurement – PO Completed',
  PAYROLL_RUN:     'Payroll – Run',
  EXPENSE_RECORDED:'Expense – Recorded',
};

function TransactionGLRulesPage() {
  const [mappings, setMappings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(null); // mapping id being edited
  const [editVals, setEditVals] = useState({});
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, aRes] = await Promise.all([
      api('/api/finance/mappings'),
      api('/api/finance/accounts?flat=true'),
    ]);
    const mData = await mRes.json();
    const aData = await aRes.json();
    setMappings(mData.mappings || []);
    // flatten account tree for select
    const flat = [];
    const flatten = nodes => nodes.forEach(n => { flat.push(n); if (n.children) flatten(n.children); });
    flatten(aData.accounts || []);
    setAccounts(flat.sort((a, b) => a.account_code.localeCompare(b.account_code)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = m => {
    setEditing(m.id);
    setEditVals({ debit_account_id: m.debit_account_id || '', credit_account_id: m.credit_account_id || '', is_active: m.is_active });
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const res = await api(`/api/finance/mappings/${editing}`, {
        method: 'PUT',
        body: JSON.stringify({
          debit_account_id:  editVals.debit_account_id  || null,
          credit_account_id: editVals.credit_account_id || null,
          is_active: editVals.is_active,
        }),
      });
      if (res.ok) { setMsg({ type: 'ok', text: 'Mapping updated' }); await load(); setEditing(null); }
      else setMsg({ type: 'err', text: 'Save failed' });
    } catch { setMsg({ type: 'err', text: 'Network error' }); }
    setSaving(false);
    setTimeout(() => setMsg(null), 3000);
  };

  // Group by event_type
  const groups = mappings.reduce((g, m) => {
    if (!g[m.event_type]) g[m.event_type] = [];
    g[m.event_type].push(m);
    return g;
  }, {});

  const AccSelect = ({ value, onChange }) => (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-400 focus:outline-none">
      <option value="">— none —</option>
      {accounts.map(a => (
        <option key={a.id} value={a.id}>{a.account_code} · {a.account_name}</option>
      ))}
    </select>
  );

  if (loading) return <Spin />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Account Mappings</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Controls which accounts are debited/credited when billing, procurement, payroll, and expenses are finalised.
          </p>
        </div>
        {msg && (
          <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {msg.text}
          </div>
        )}
      </div>

      {Object.entries(groups).map(([eventType, rows]) => (
        <div key={eventType} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2"
            style={{ background: 'linear-gradient(90deg,#f8fafc,#fff)' }}>
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <h3 className="font-bold text-slate-700 text-sm">{MODULE_LABELS[eventType] || eventType}</h3>
            <span className="text-xs text-slate-400 ml-1">({rows.length} rules)</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase w-32">Sub-type</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase">Debit Account</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase">Credit Account</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase w-20">Active</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(m => (
                <tr key={m.id} className={`hover:bg-slate-50/50 transition-colors ${!m.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600">{m.sub_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    {editing === m.id ? (
                      <AccSelect value={editVals.debit_account_id} onChange={v => setEditVals(x => ({ ...x, debit_account_id: v }))} />
                    ) : (
                      <span className="text-slate-700">
                        {m.debit_code ? <><span className="font-mono text-xs text-blue-600">{m.debit_code}</span> · {m.debit_name}</> : <span className="text-slate-300">—</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editing === m.id ? (
                      <AccSelect value={editVals.credit_account_id} onChange={v => setEditVals(x => ({ ...x, credit_account_id: v }))} />
                    ) : (
                      <span className="text-slate-700">
                        {m.credit_code ? <><span className="font-mono text-xs text-emerald-600">{m.credit_code}</span> · {m.credit_name}</> : <span className="text-slate-300">—</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editing === m.id ? (
                      <input type="checkbox" checked={editVals.is_active}
                        onChange={e => setEditVals(x => ({ ...x, is_active: e.target.checked }))}
                        className="w-4 h-4 accent-blue-600" />
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${m.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {m.is_active ? 'Yes' : 'No'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editing === m.id ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={saveEdit} disabled={saving}
                          className="px-2.5 py-1 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          {saving ? '…' : 'Save'}
                        </button>
                        <button onClick={() => setEditing(null)}
                          className="px-2.5 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(m)}
                        className="px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — TRIAL BALANCE
// ════════════════════════════════════════════════════════════════
function TrialBalanceTab({ centerId = '', centerName = 'All Centers' }) {
  const [rows, setRows]   = useState([]);
  const [from, setFrom]   = useState(fyStart());
  const [to, setTo]       = useState(today());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (centerId) params.set('center_id', centerId);
    const r = await api(`/api/finance/reports/trial-balance?${params}`);
    const d = await r.json();
    if (d.success !== false) setRows(d.rows || []);
    setLoading(false);
  }, [from, to, centerId]);

  useEffect(() => { load(); }, [load]);

  const totalDr = rows.reduce((s, r) => s + parseFloat(r.period_debit || 0), 0);
  const totalCr = rows.reduce((s, r) => s + parseFloat(r.period_credit || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div><label className={labelCls}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls + ' w-40'} /></div>
        <div><label className={labelCls}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls + ' w-40'} /></div>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">Refresh</button>
        <span className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-semibold border ${centerId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
          {centerId ? `📍 ${centerName}` : '🏢 Feenixtech — All Centers'}
        </span>
      </div>
      {loading ? <Spin /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-bold text-slate-800">Trial Balance</h2>
            <span className={`text-sm font-semibold ${Math.abs(totalDr - totalCr) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
              {Math.abs(totalDr - totalCr) < 0.01 ? '✓ Balanced' : `⚠ Diff: ${fmt(Math.abs(totalDr - totalCr))}`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Code</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Account</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Opening</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Debit</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Credit</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.account_code}</td>
                    <td className="px-4 py-2 font-medium text-slate-800" style={{ paddingLeft: `${(r.account_level - 1) * 16 + 16}px` }}>{r.account_name}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{fmt(r.opening_balance)}</td>
                    <td className="px-4 py-2 text-right text-blue-700 font-medium">{parseFloat(r.period_debit) > 0 ? fmt(r.period_debit) : '—'}</td>
                    <td className="px-4 py-2 text-right text-orange-700 font-medium">{parseFloat(r.period_credit) > 0 ? fmt(r.period_credit) : '—'}</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-800">{fmt(r.closing_balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-slate-700">Totals</td>
                  <td className="px-4 py-3 text-right text-blue-700">{fmt(totalDr)}</td>
                  <td className="px-4 py-3 text-right text-orange-700">{fmt(totalCr)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — PROFIT & LOSS
// ════════════════════════════════════════════════════════════════
function ProfitLossTab({ centerId = '', centerName = 'All Centers' }) {
  const [rows, setRows]   = useState([]);
  const [from, setFrom]   = useState(fyStart());
  const [to, setTo]       = useState(today());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (centerId) params.set('center_id', centerId);
    const r = await api(`/api/finance/reports/profit-loss?${params}`);
    const d = await r.json();
    if (d.success !== false) setRows(d.rows || []);
    setLoading(false);
  }, [from, to, centerId]);

  useEffect(() => { load(); }, [load]);

  const revenue  = rows.filter(r => r.account_category === 'REVENUE').reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
  const cogs     = rows.filter(r => r.account_category === 'COGS').reduce((s, r)    => s + parseFloat(r.net_amount || 0), 0);
  const expenses = rows.filter(r => r.account_category === 'EXPENSE').reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
  const netProfit = revenue - cogs - expenses;

  const Section = ({ title, cat, color }) => {
    const allCat = rows.filter(r => r.account_category === cat);
    const items  = allCat.filter(r => parseFloat(r.net_amount || 0) !== 0);
    if (!items.length) return null;
    const total = items.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
    // Inject L2 parent headers before their first child (same pattern as Balance Sheet)
    const allById = Object.fromEntries(allCat.filter(r => r.id).map(r => [r.id, r]));
    const display = [];
    const shown = new Set();
    for (const r of items) {
      if (r.account_level > 2 && r.parent_account_id) {
        const parent = allById[r.parent_account_id];
        if (parent && !shown.has(parent.account_code)) {
          display.push({ ...parent, _isHeader: true });
          shown.add(parent.account_code);
        }
      }
      display.push(r);
    }
    return (
      <div className="mb-4">
        <div className="px-5 py-2 rounded-xl mb-1 flex justify-between" style={{ background: color + '18' }}>
          <span className="font-bold text-sm" style={{ color }}>{title}</span>
          <span className="font-bold text-sm" style={{ color }}>{fmt(total)}</span>
        </div>
        {display.map((r, i) => r._isHeader ? (
          <div key={'h-' + i} className="flex justify-between px-5 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2"
            style={{ paddingLeft: `${(r.account_level - 1) * 16 + 20}px` }}>
            <span>{r.account_name}</span>
          </div>
        ) : (
          <div key={i} className="flex justify-between px-5 py-1.5 hover:bg-slate-50 text-sm"
            style={{ paddingLeft: `${(r.account_level - 1) * 16 + 20}px` }}>
            <span className="text-slate-600">{r.account_name}</span>
            <span className="font-medium text-slate-800">{fmt(r.net_amount)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div><label className={labelCls}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls + ' w-40'} /></div>
        <div><label className={labelCls}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls + ' w-40'} /></div>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">Refresh</button>
        <span className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-semibold border ${centerId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
          {centerId ? `📍 ${centerName}` : '🏢 Feenixtech — All Centers'}
        </span>
      </div>
      {loading ? <Spin /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="font-bold text-slate-800 mb-5 text-lg">Profit & Loss Statement</h2>
          <Section title="Revenue" cat="REVENUE" color="#15803d" />
          <Section title="Cost of Goods Sold" cat="COGS" color="#be123c" />
          <div className="flex justify-between px-5 py-2 rounded-xl mb-4 font-bold text-sm" style={{ background: '#e0f2fe', color: '#0369a1' }}>
            <span>Gross Profit</span><span>{fmt(revenue - cogs)}</span>
          </div>
          <Section title="Operating Expenses" cat="EXPENSE" color="#dc2626" />
          <div className="flex justify-between px-5 py-3 rounded-xl font-bold text-base mt-2"
            style={{ background: netProfit >= 0 ? '#dcfce7' : '#fee2e2', color: netProfit >= 0 ? '#166534' : '#991b1b' }}>
            <span>Net Profit / (Loss)</span><span>{fmt(netProfit)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — BALANCE SHEET
// ════════════════════════════════════════════════════════════════
function BalanceSheetTab({ centerId = '', centerName = 'All Centers' }) {
  const [rows, setRows]   = useState([]);
  const [asOf, setAsOf]   = useState(today());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ as_of: asOf });
    if (centerId) params.set('center_id', centerId);
    const r = await api(`/api/finance/reports/balance-sheet?${params}`);
    const d = await r.json();
    if (d.success !== false) setRows(d.rows || []);
    setLoading(false);
  }, [asOf, centerId]);

  useEffect(() => { load(); }, [load]);

  const assets      = rows.filter(r => r.account_category === 'ASSET').reduce((s, r) => s + parseFloat(r.balance || 0), 0);
  const liabilities = rows.filter(r => r.account_category === 'LIABILITY').reduce((s, r) => s + parseFloat(r.balance || 0), 0);
  const equity      = rows.filter(r => r.account_category === 'EQUITY').reduce((s, r) => s + parseFloat(r.balance || 0), 0);

  const Section = ({ title, cat, color }) => {
    const allCat = rows.filter(r => r.account_category === cat);
    const items  = allCat.filter(r => parseFloat(r.balance || 0) !== 0);
    if (!items.length) return null;
    const total = items.reduce((s, r) => s + parseFloat(r.balance || 0), 0);
    // Collect L2 parents that have children with non-zero balance (even if parent itself is 0)
    const allById = Object.fromEntries(allCat.filter(r => r.id).map(r => [r.id, r]));
    const parentCodes = new Set(
      items.filter(r => r.account_level > 2 && r.parent_account_id)
           .map(r => allById[r.parent_account_id]?.account_code)
           .filter(Boolean)
    );
    // Build display list: inject L2 parent headers before their first child
    const display = [];
    const shown = new Set();
    for (const r of items) {
      if (r.account_level > 2 && r.parent_account_id) {
        const parent = allById[r.parent_account_id];
        if (parent && parentCodes.has(parent.account_code) && !shown.has(parent.account_code)) {
          display.push({ ...parent, _isHeader: true });
          shown.add(parent.account_code);
        }
      }
      display.push(r);
    }
    return (
      <div className="mb-4">
        <div className="px-5 py-2 rounded-xl mb-1 flex justify-between" style={{ background: color + '18' }}>
          <span className="font-bold text-sm" style={{ color }}>{title}</span>
          <span className="font-bold text-sm" style={{ color }}>{fmt(total)}</span>
        </div>
        {display.map((r, i) => r._isHeader ? (
          <div key={'h-' + i} className="flex justify-between px-5 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2"
            style={{ paddingLeft: `${(r.account_level - 1) * 16 + 20}px` }}>
            <span>{r.account_name}</span>
          </div>
        ) : (
          <div key={i} className="flex justify-between px-5 py-1.5 hover:bg-slate-50 text-sm"
            style={{ paddingLeft: `${(r.account_level - 1) * 16 + 20}px` }}>
            <span className="text-slate-600">{r.account_name}</span>
            <span className="font-medium text-slate-800">{fmt(r.balance)}</span>
          </div>
        ))}
      </div>
    );
  };

  const balanced = Math.abs(assets - (liabilities + equity)) < 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div><label className={labelCls}>As of Date</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className={inputCls + ' w-40'} /></div>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">Refresh</button>
        {!loading && <span className={`text-sm font-semibold ${balanced ? 'text-emerald-600' : 'text-red-600'}`}>
          {balanced ? '✓ Balanced' : `⚠ Assets ≠ Liabilities + Equity`}
        </span>}
        <span className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-semibold border ${centerId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
          {centerId ? `📍 ${centerName}` : '🏢 Feenixtech — All Centers'}
        </span>
        {centerId && (
          <p className="w-full text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-1">
            ⚠ Opening balances are entity-wide. Center view shows center-specific GL movements on top of consolidated opening balances.
          </p>
        )}
      </div>
      {loading ? <Spin /> : (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-slate-800 mb-4">Assets — {fmt(assets)}</h3>
            <Section title="Assets" cat="ASSET" color="#0369a1" />
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-slate-800 mb-4">Liabilities & Equity — {fmt(liabilities + equity)}</h3>
            <Section title="Liabilities" cat="LIABILITY" color="#b45309" />
            <Section title="Equity" cat="EQUITY" color="#7c3aed" />
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — AP AGING
// ════════════════════════════════════════════════════════════════
function APAgingTab() {
  const [rows, setRows]   = useState([]);
  const [asOf, setAsOf]   = useState(today());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api(`/api/finance/reports/ap-aging?as_of=${asOf}`);
      const d = await r.json();
      if (d.success !== false) {
        setRows(d.rows || []);
        setTotal(d.total || 0);
      } else {
        setError(d.error || 'Failed to load AP Aging data');
        setRows([]);
      }
    } catch (e) {
      setError('Network error loading AP Aging');
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => { load(); }, [load]);

  const bucketTotal = (key) => rows.reduce((s, r) => s + parseFloat(r[key] || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div><label className={labelCls}>As of Date</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className={inputCls + ' w-40'} /></div>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">Refresh</button>
      </div>

      {loading ? <Spin /> : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-red-700 text-sm">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[['0–30 Days','bucket_0_30','#15803d'],['31–60 Days','bucket_31_60','#b45309'],['61–90 Days','bucket_61_90','#dc2626'],['90+ Days','bucket_over_90','#7c3aed']].map(([label, key, color]) => (
              <div key={key} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                <p className="text-xs font-semibold text-slate-400 uppercase">{label}</p>
                <p className="text-xl font-black mt-1" style={{ color }}>{fmt(bucketTotal(key))}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex justify-between">
              <h2 className="font-bold text-slate-800">Vendor-wise Outstanding</h2>
              <span className="font-bold text-slate-600">{fmt(total)} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>{['Vendor','POs','Total','0–30','31–60','61–90','90+','Oldest PO'].map(h => (
                    <th key={h} className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase text-right first:text-left">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No outstanding POs</td></tr>}
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2">
                        <p className="font-semibold text-slate-800">{r.vendor_name}</p>
                        <p className="text-xs text-slate-400">{r.vendor_code} · {r.vendor_type}</p>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">{r.po_count}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-800">{fmt(r.total_amount)}</td>
                      <td className="px-4 py-2 text-right text-emerald-700">{parseFloat(r.bucket_0_30) > 0 ? fmt(r.bucket_0_30) : '—'}</td>
                      <td className="px-4 py-2 text-right text-amber-700">{parseFloat(r.bucket_31_60) > 0 ? fmt(r.bucket_31_60) : '—'}</td>
                      <td className="px-4 py-2 text-right text-orange-700">{parseFloat(r.bucket_61_90) > 0 ? fmt(r.bucket_61_90) : '—'}</td>
                      <td className="px-4 py-2 text-right text-red-700">{parseFloat(r.bucket_over_90) > 0 ? fmt(r.bucket_over_90) : '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{fmtD(r.oldest_po_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — RCM LIABILITY (Reverse Charge Mechanism — Tele-Radiology)
// ════════════════════════════════════════════════════════════════
function RCMLiabilityTab() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState(false);
  const [payMsg, setPayMsg]   = useState(null);
  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState({
    amount: '', payment_date: today(), bank_account_id: '', reference_number: '', notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/api/finance/rcm-liability');
      const d = await r.json();
      if (d.success !== false) setData(d);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Pre-fill amount with outstanding when opening modal
  const openModal = () => {
    setForm(f => ({
      ...f,
      amount: data?.balance?.outstanding > 0
        ? parseFloat(data.balance.outstanding).toFixed(2)
        : '',
    }));
    setPayMsg(null);
    setModal(true);
  };

  const submitPayment = async () => {
    if (!form.amount || !form.payment_date || !form.bank_account_id || !form.reference_number) {
      setPayMsg({ type: 'error', text: 'All fields marked * are required' });
      return;
    }
    setPaying(true);
    setPayMsg(null);
    try {
      const r = await api('/api/finance/rcm-liability/pay', {
        method: 'POST',
        body: JSON.stringify({
          amount:           parseFloat(form.amount),
          payment_date:     form.payment_date,
          bank_account_id:  parseInt(form.bank_account_id, 10),
          reference_number: form.reference_number,
          notes:            form.notes || undefined,
        }),
      });
      const d = await r.json();
      if (r.ok && !d.errors) {
        setPayMsg({ type: 'success', text: `Payment posted — JE ${d.entry_number}` });
        setModal(false);
        load();
      } else {
        const msg = d.errors ? d.errors.map(e => e.msg).join(', ') : d.error || 'Failed';
        setPayMsg({ type: 'error', text: msg });
      }
    } catch { setPayMsg({ type: 'error', text: 'Network error' }); }
    finally { setPaying(false); }
  };

  const outstanding = parseFloat(data?.balance?.outstanding || 0);
  const accrued     = parseFloat(data?.balance?.total_accrued || 0);
  const paidGl      = parseFloat(data?.balance?.total_paid_gl || 0);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-500 rounded-2xl p-5 text-white shadow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-orange-100 text-xs font-semibold uppercase tracking-widest mb-1">
              Reverse Charge Mechanism (RCM)
            </p>
            <h2 className="text-2xl font-black">IGST Payable to Govt</h2>
            <p className="text-orange-100 text-sm mt-1">
              18% GST on tele-radiology services — you pay as recipient under RCM
            </p>
          </div>
          <button
            onClick={openModal}
            disabled={outstanding <= 0}
            className="flex-shrink-0 px-5 py-2.5 bg-white text-orange-700 font-bold text-sm rounded-xl
                       hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            Pay to Govt
          </button>
        </div>
      </div>

      {payMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          payMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {payMsg.text}
        </div>
      )}

      {/* KPI cards */}
      {loading ? <Spin /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard label="Total Accrued (Liability)"
              value={fmt(accrued)} color="#ea580c"
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <KpiCard label="Paid to Govt"
              value={fmt(paidGl)} color="#15803d"
              icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            <KpiCard label="Outstanding Balance"
              value={fmt(outstanding)}
              color={outstanding > 0 ? '#dc2626' : '#15803d'}
              icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </div>

          {/* Per-vendor breakdown */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">By Tele-Radiology Vendor</h3>
              <p className="text-xs text-slate-400 mt-0.5">18% IGST accrued per vendor</p>
            </div>
            <div className="overflow-x-auto">
              {!data?.vendors?.length ? (
                <p className="text-slate-400 text-sm px-5 py-6">No tele-radiology RCM accruals yet</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      {['Vendor', 'Total Accrued', 'Paid to Govt', 'Outstanding'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.vendors.map((v, i) => (
                      <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-800">{v.vendor_name}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{fmt(v.total_accrued)}</td>
                        <td className="px-4 py-3 text-right text-emerald-700">{fmt(v.total_paid)}</td>
                        <td className="px-4 py-3 text-right font-bold">
                          <span className={parseFloat(v.outstanding) > 0 ? 'text-red-600' : 'text-emerald-600'}>
                            {fmt(v.outstanding)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Monthly breakdown */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Monthly Accrual History</h3>
            </div>
            <div className="overflow-x-auto">
              {!data?.monthly?.length ? (
                <p className="text-slate-400 text-sm px-5 py-6">No data</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      {['Month', 'Accrued', 'Paid', 'Net Outstanding'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly.map((m, i) => (
                      <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-700">{m.month_label}</td>
                        <td className="px-4 py-3 text-right text-orange-700">{fmt(m.accrued)}</td>
                        <td className="px-4 py-3 text-right text-emerald-700">{fmt(m.paid)}</td>
                        <td className="px-4 py-3 text-right font-semibold">
                          <span className={parseFloat(m.net) > 0 ? 'text-red-600' : 'text-emerald-600'}>
                            {fmt(m.net)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Payment history */}
          {data?.payments?.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800">Payment History</h3>
                <p className="text-xs text-slate-400 mt-0.5">Amounts remitted to government</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      {['Date', 'JE #', 'Challan / Ref', 'Amount', 'Notes'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p, i) => (
                      <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-600">{fmtD(p.payment_date)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-indigo-700">{p.entry_number}</td>
                        <td className="px-4 py-3 text-slate-700">{p.reference}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmt(p.amount)}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{p.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Pay to Govt Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Pay RCM GST to Govt</h3>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-800">
                <span className="font-bold">Outstanding:</span> {fmt(outstanding)} (IGST Payable — Account 2123)
              </div>

              {payMsg && (
                <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
                  payMsg.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                  {payMsg.text}
                </div>
              )}

              <div>
                <label className={labelCls}>Amount Paid (₹) *</label>
                <input type="number" step="0.01" min="0.01"
                  className={inputCls} value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Payment Date *</label>
                <input type="date" className={inputCls} value={form.payment_date}
                  onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Pay From Bank Account *</label>
                <select className={inputCls} value={form.bank_account_id}
                  onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                  <option value="">— Select bank account —</option>
                  {(data?.banks || []).map(b => (
                    <option key={b.id} value={b.id}>
                      {b.account_name} — {b.bank_name} ({b.account_number})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Challan / Reference No. *</label>
                <input type="text" className={inputCls} placeholder="BSR code / challan number"
                  value={form.reference_number}
                  onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <input type="text" className={inputCls} placeholder="e.g. GSTR-3B Mar 2026"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 font-semibold text-sm rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={submitPayment} disabled={paying}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white font-bold text-sm rounded-xl hover:bg-orange-700 disabled:opacity-50">
                {paying ? 'Posting…' : 'Post Payment JE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — GST RECONCILIATION (with GSTR-1 / GSTR-3B sub-tabs)
// ════════════════════════════════════════════════════════════════

function GSTOverviewSubTab({ centerId = '' }) {
  const [data, setData]   = useState(null);
  const [from, setFrom]   = useState(fyStart());
  const [to, setTo]       = useState(today());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const cParam = centerId ? `&center_id=${centerId}` : '';
    const r = await api(`/api/finance/reports/gst-reconciliation?from=${from}&to=${to}${cParam}`);
    const d = await r.json();
    if (d.success !== false) setData(d);
    setLoading(false);
  }, [from, to, centerId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div><label className={labelCls}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls + ' w-40'} /></div>
        <div><label className={labelCls}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls + ' w-40'} /></div>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">Refresh</button>
      </div>
      {loading ? <Spin /> : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Output GST" value={fmt(data.output?.total_output_gst || 0)} color="#15803d"
              icon="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
            <KpiCard label="Input Tax Credit" value={fmt(data.itc?.total_itc || 0)} color="#0369a1"
              icon="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            <KpiCard label="Net GST Payable" value={fmt(Math.abs(data.net?.total || 0))} color={(data.net?.total || 0) > 0 ? '#dc2626' : '#15803d'}
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <KpiCard label="Invoices" value={data.output?.invoice_count || 0} color="#7c3aed"
              icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3">Output Tax (from Patients)</h3>
              {[
                ['Gross Value',    data.output?.gross_value],
                ['Exempt Amount',  data.output?.exempt_amount],
                ['Taxable Amount', data.output?.taxable_amount],
                ['CGST',           data.output?.cgst_amount],
                ['SGST',           data.output?.sgst_amount],
                ['IGST',           data.output?.igst_amount],
                ['Total Output GST', data.output?.total_output_gst],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between py-1.5 text-sm border-b border-slate-50 last:border-0 last:font-bold">
                  <span className="text-slate-600">{l}</span><span className="text-slate-800">{fmt(v || 0)}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-1">Input Tax Credit (from Vendors)</h3>
              <p className="text-xs text-slate-400 mb-3">GST paid on approved vendor bills</p>
              {[
                ['Vendor Bills', data.itc?.bill_count && `${data.itc.bill_count} bills`],
                ['CGST ITC',     data.itc?.cgst_itc],
                ['SGST ITC',     data.itc?.sgst_itc],
                ['IGST ITC',     data.itc?.igst_itc],
                ['Total ITC',    data.itc?.total_itc],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between py-1.5 text-sm border-b border-slate-50 last:border-0 last:font-bold">
                  <span className="text-slate-600">{l}</span>
                  <span className="text-slate-800">{typeof v === 'string' ? v : fmt(v || 0)}</span>
                </div>
              ))}
              <div className="mt-3 p-2 rounded-lg bg-slate-50 flex justify-between text-sm font-bold">
                <span className="text-slate-700">Net GST {(data.net?.total || 0) > 0 ? 'Payable' : 'Credit'}</span>
                <span className={(data.net?.total || 0) > 0 ? 'text-red-600' : 'text-green-600'}>{fmt(Math.abs(data.net?.total || 0))}</span>
              </div>
            </div>
          </div>

          {/* Vendor-wise ITC breakdown */}
          {(data.itc_by_vendor || []).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800">Vendor-wise ITC Breakdown</h3>
                <p className="text-xs text-slate-400 mt-0.5">GST paid to each vendor — eligible as Input Tax Credit</p>
              </div>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>{['Vendor','Bills','Purchase Value (₹)','CGST ITC (₹)','SGST ITC (₹)','IGST ITC (₹)','Total ITC (₹)'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right first:text-left whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(data.itc_by_vendor || []).map((v, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{v.vendor_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 text-right">{v.bill_count}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-700 text-right">{fmt(v.purchase_value)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-700 text-right">{fmt(v.cgst_itc)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-700 text-right">{fmt(v.sgst_itc)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-700 text-right">{fmt(v.igst_itc)}</td>
                      <td className="px-4 py-2.5 text-xs font-bold text-blue-700 text-right">{fmt(v.total_itc)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr>
                    <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-slate-700 uppercase">Total</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-800 text-right">{fmt(data.itc?.purchase_value)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-800 text-right">{fmt(data.itc?.cgst_itc)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-800 text-right">{fmt(data.itc?.sgst_itc)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-800 text-right">{fmt(data.itc?.igst_itc)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-blue-700 text-right">{fmt(data.itc?.total_itc)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {/* Monthly */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 mb-3">Monthly GST Summary</h3>
            {(data.monthly || []).length === 0 && <p className="text-slate-400 text-sm">No data for this period</p>}
            {(data.monthly || []).length > 0 && (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 text-xs text-slate-500 uppercase">
                  {['Month','Invoices','Taxable','CGST','SGST','IGST','Total GST'].map(h => <th key={h} className="py-2 text-right first:text-left px-2">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {(data.monthly || []).map((m, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2 px-2 text-slate-700">{m.month}</td>
                      <td className="py-2 px-2 text-right text-slate-600">{m.invoices}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{fmt(m.taxable)}</td>
                      <td className="py-2 px-2 text-right text-slate-600">{fmt(m.cgst)}</td>
                      <td className="py-2 px-2 text-right text-slate-600">{fmt(m.sgst)}</td>
                      <td className="py-2 px-2 text-right text-slate-600">{fmt(m.igst)}</td>
                      <td className="py-2 px-2 text-right font-semibold text-slate-800">{fmt(m.total_gst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function GSTR1SubTab({ centerId = '' }) {
  const [data, setData]     = useState(null);
  const [from, setFrom]     = useState(fyStart());
  const [to, setTo]         = useState(today());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const cParam = centerId ? `&center_id=${centerId}` : '';
    const r = await api(`/api/finance/gstr1?from=${from}&to=${to}${cParam}`);
    const d = await r.json();
    if (d.success !== false) setData(d);
    setLoading(false);
  }, [from, to, centerId]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.supplies || [];
  const totTaxable = parseFloat(data?.totals?.taxable_value || 0);
  const totGST     = parseFloat(data?.totals?.total_gst     || 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div><label className={labelCls}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls + ' w-40'} /></div>
        <div><label className={labelCls}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls + ' w-40'} /></div>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">Refresh</button>
        <span className="ml-auto text-xs text-slate-400">GSTR-1 — Outward Supplies (B2C)</span>
      </div>

      {loading ? <Spin /> : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">HSN/SAC-wise Outward Supplies</h3>
            <span className="text-xs text-slate-400">{rows.length} HSN group{rows.length !== 1 ? 's' : ''}</span>
          </div>
          {rows.length === 0 ? (
            <p className="text-slate-400 text-sm p-6">No outward supplies found for this period.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['HSN/SAC', 'Description', 'GST Rate', 'Invoices', 'Taxable Value', 'CGST', 'SGST', 'Total GST'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{r.hsn_sac || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">{r.description || '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">{r.gst_rate ? `${r.gst_rate}%` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 text-center">{r.invoice_count}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-800 text-right">{fmt(r.taxable_value)}</td>
                    <td className="px-4 py-3 text-xs text-slate-700 text-right">{fmt(r.cgst)}</td>
                    <td className="px-4 py-3 text-xs text-slate-700 text-right">{fmt(r.sgst)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-800 text-right">{fmt(r.total_gst)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-xs font-bold text-slate-700 uppercase">Total</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-800 text-right">{fmt(totTaxable)}</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-800 text-right">{fmt(rows.reduce((s,r)=>s+parseFloat(r.cgst||0),0))}</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-800 text-right">{fmt(rows.reduce((s,r)=>s+parseFloat(r.sgst||0),0))}</td>
                  <td className="px-4 py-3 text-xs font-bold text-green-700 text-right">{fmt(totGST)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function GSTR3BSubTab({ centerId = '' }) {
  const [data, setData]     = useState(null);
  const [from, setFrom]     = useState(fyStart());
  const [to, setTo]         = useState(today());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const cParam = centerId ? `&center_id=${centerId}` : '';
    const r = await api(`/api/finance/gstr3b?from=${from}&to=${to}${cParam}`);
    const d = await r.json();
    if (d.success !== false) setData(d);
    setLoading(false);
  }, [from, to, centerId]);

  useEffect(() => { load(); }, [load]);

  const s31 = data?.section_3_1 || {};
  const s4  = data?.section_4   || {};
  const net = parseFloat(data?.net_tax_payable || 0);
  const cf  = parseFloat(data?.itc_carry_forward || 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div><label className={labelCls}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls + ' w-40'} /></div>
        <div><label className={labelCls}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls + ' w-40'} /></div>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">Refresh</button>
        <span className="ml-auto text-xs text-slate-400">GSTR-3B — Summary Return</span>
      </div>

      {loading ? <Spin /> : data && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* 3.1 Output Tax */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 mb-1">3.1 — Outward Supplies (Output Tax)</h3>
            <p className="text-xs text-slate-400 mb-3">Tax collected from patients</p>
            {[
              ['Taxable Turnover', s31.taxable_turnover],
              ['CGST Payable', s31.cgst],
              ['SGST Payable', s31.sgst],
              ['Total Output Tax', (parseFloat(s31.cgst||0)+parseFloat(s31.sgst||0))],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between py-1.5 text-sm border-b border-slate-50 last:border-0 last:font-bold">
                <span className="text-slate-600">{l}</span>
                <span className="text-slate-800">{fmt(v || 0)}</span>
              </div>
            ))}
          </div>

          {/* 4 ITC */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 mb-1">4 — Eligible ITC</h3>
            <p className="text-xs text-slate-400 mb-3">Input tax credit available</p>
            {[
              ['Vendor Bill GST (B2B)', s4.vendor_bill_gst],
              ['RCM IGST (Tele-Radiology)', s4.rcm_igst],
              ['Expense ITC', s4.expense_itc],
              ['Total ITC', s4.total_itc],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between py-1.5 text-sm border-b border-slate-50 last:border-0 last:font-bold">
                <span className="text-slate-600">{l}</span>
                <span className="text-slate-800">{fmt(v || 0)}</span>
              </div>
            ))}
          </div>

          {/* Net payable summary */}
          <div className={`md:col-span-2 rounded-2xl border p-5 ${net > 0 ? 'bg-red-50 border-red-200' : cf > 0 ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-700">
                  {net > 0 ? 'Net GST Payable to Government' : cf > 0 ? 'ITC Carry Forward (No Payment Due)' : 'Net Position'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Output Tax − Total ITC</p>
              </div>
              <p className={`text-2xl font-black ${net > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {fmt(net > 0 ? net : cf)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GSTReconciliationTab({ centerId = '' }) {
  const [sub, setSub] = useState('overview');
  const GST_SUBS = [
    { key: 'overview', label: 'Overview' },
    { key: 'gstr1',    label: 'GSTR-1' },
    { key: 'gstr3b',   label: 'GSTR-3B' },
  ];
  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        {GST_SUBS.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              sub === s.key ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {s.label}
          </button>
        ))}
      </div>
      {sub === 'overview' && <GSTOverviewSubTab centerId={centerId} />}
      {sub === 'gstr1'    && <GSTR1SubTab       centerId={centerId} />}
      {sub === 'gstr3b'   && <GSTR3BSubTab      centerId={centerId} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — BANK / CASH RECONCILIATION
// ════════════════════════════════════════════════════════════════
function BankReconciliationTab() {
  const [accounts, setAccounts]         = useState([]);
  const [selAccount, setSelAccount]     = useState('');
  const [lines, setLines]               = useState([]);
  const [from, setFrom]                 = useState(today().slice(0, 7) + '-01');
  const [to, setTo]                     = useState(today());
  const [loading, setLoading]           = useState(false);
  const [showAdd, setShowAdd]           = useState(false);
  const [newLine, setNewLine]           = useState({ transaction_date: today(), description: '', debit_amount: '', credit_amount: '', cheque_number: '', notes: '' });
  const [saving, setSaving]             = useState(false);
  const [msg, setMsg]                   = useState(null);
  const [summary, setSummary]           = useState(null);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  useEffect(() => {
    api('/api/finance/bank-accounts').then(r => r.json()).then(d => {
      setAccounts(d.accounts || []);
      if (d.accounts?.length) setSelAccount(String(d.accounts[0].id));
    });
  }, []);

  const load = useCallback(async () => {
    if (!selAccount) return;
    setLoading(true);
    const [stmtRes, sumRes] = await Promise.all([
      api(`/api/finance/bank-statement?bank_account_id=${selAccount}&from=${from}&to=${to}`),
      api(`/api/finance/bank-reconciliation-summary?bank_account_id=${selAccount}&as_of=${to}`),
    ]);
    const stmtData = await stmtRes.json();
    const sumData  = await sumRes.json();
    setLines(stmtData.lines || []);
    setSummary(sumData.success !== false ? sumData : null);
    setLoading(false);
  }, [selAccount, from, to]);

  useEffect(() => { load(); }, [load]);

  const addLine = async () => {
    if (!newLine.transaction_date) return;
    setSaving(true);
    const r = await api('/api/finance/bank-statement', {
      method: 'POST',
      body: JSON.stringify({ ...newLine, bank_account_id: selAccount }),
    });
    const d = await r.json();
    if (d.success) { showMsg('ok', 'Line added'); setShowAdd(false); setNewLine({ transaction_date: today(), description: '', debit_amount: '', credit_amount: '', cheque_number: '', notes: '' }); load(); }
    else showMsg('err', d.error || 'Failed');
    setSaving(false);
  };

  const toggleReconcile = async (line) => {
    const url = line.is_reconciled ? `/api/finance/bank-statement/${line.id}/unmatch` : `/api/finance/bank-statement/${line.id}/reconcile`;
    await api(url, { method: 'PUT', body: JSON.stringify({}) });
    load();
  };

  const deleteLine = async (id) => {
    if (!window.confirm('Delete this line?')) return;
    await api(`/api/finance/bank-statement/${id}`, { method: 'DELETE' });
    load();
  };

  const totalDebit    = lines.reduce((s, l) => s + parseFloat(l.debit_amount || 0), 0);
  const totalCredit   = lines.reduce((s, l) => s + parseFloat(l.credit_amount || 0), 0);
  const reconciledCnt = lines.filter(l => l.is_reconciled).length;

  return (
    <div className="space-y-4">
      {msg && <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div><label className={labelCls}>Bank Account</label>
          <select value={selAccount} onChange={e => setSelAccount(e.target.value)} className={inputCls + ' w-56'}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name} — {a.bank_name}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls + ' w-40'} /></div>
        <div><label className={labelCls}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls + ' w-40'} /></div>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">Load</button>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700">+ Add Line</button>
      </div>

      {/* Reconciliation Summary */}
      {summary && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Reconciliation Summary — as of {fmtD(summary.as_of)}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium mb-1">Bank Statement Balance</p>
              <p className="text-lg font-bold text-slate-800">{fmt(summary.statement_balance)}</p>
              <p className="text-xs text-slate-400 mt-1">Opening {fmt(summary.opening_balance)} + Credits {fmt(summary.statement_credits)} − Debits {fmt(summary.statement_debits)}</p>
            </div>
            <div className={`rounded-xl p-3 ${summary.gl_balance !== null ? 'bg-slate-50' : 'bg-amber-50'}`}>
              <p className="text-xs text-slate-500 font-medium mb-1">GL Book Balance</p>
              {summary.gl_balance !== null ? (
                <p className="text-lg font-bold text-slate-800">{fmt(summary.gl_balance)}</p>
              ) : (
                <p className="text-sm text-amber-600 font-semibold mt-2">No GL account linked</p>
              )}
              {summary.gl_account_name && <p className="text-xs text-slate-400 mt-1">{summary.gl_account_name}</p>}
            </div>
            <div className={`rounded-xl p-3 ${
              summary.difference === null ? 'bg-slate-50' :
              summary.difference === 0 ? 'bg-emerald-50' : 'bg-red-50'
            }`}>
              <p className="text-xs text-slate-500 font-medium mb-1">Difference</p>
              {summary.difference !== null ? (
                <>
                  <p className={`text-lg font-bold ${summary.difference === 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {fmt(Math.abs(summary.difference))}
                  </p>
                  <p className={`text-xs mt-1 font-semibold ${summary.difference === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {summary.difference === 0 ? '✓ Balanced' : summary.difference > 0 ? 'GL > Statement' : 'Statement > GL'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400 mt-2">—</p>
              )}
            </div>
            <div className="bg-amber-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium mb-1">Unreconciled Items</p>
              <p className="text-lg font-bold text-amber-700">{summary.unreconciled_count}</p>
              <p className="text-xs text-slate-400 mt-1">
                In {fmt(summary.unreconciled_credits)} · Out {fmt(summary.unreconciled_debits)}
              </p>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-4">Add Bank Statement Line</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[['Date','transaction_date','date'],['Description','description','text'],['Debit (Out)','debit_amount','number'],['Credit (In)','credit_amount','number'],['Cheque No.','cheque_number','text'],['Notes','notes','text']].map(([l, k, t]) => (
              <div key={k}><label className={labelCls}>{l}</label>
                <input type={t} value={newLine[k]} onChange={e => setNewLine(p => ({ ...p, [k]: e.target.value }))}
                  className={inputCls} step={t === 'number' ? '0.01' : undefined} /></div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={addLine} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">{saving ? '…' : 'Save'}</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <Spin /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-4 items-center">
            <h2 className="font-bold text-slate-800">Statement Lines</h2>
            <span className="text-sm text-slate-500">{reconciledCnt}/{lines.length} reconciled</span>
            <span className="ml-auto text-sm text-slate-600">Debits: <b>{fmt(totalDebit)}</b> · Credits: <b className="text-emerald-700">{fmt(totalCredit)}</b></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>{['Date','Description','Cheque','Debit','Credit','JE Matched','Status',''].map(h => (
                  <th key={h} className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase text-left">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lines.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No lines — add bank statement entries above</td></tr>}
                {lines.map((l, i) => (
                  <tr key={i} className={`hover:bg-slate-50/60 ${l.is_reconciled ? 'bg-emerald-50/30' : ''}`}>
                    <td className="px-3 py-2 text-slate-600">{fmtD(l.transaction_date)}</td>
                    <td className="px-3 py-2 text-slate-800 max-w-[200px] truncate">{l.description}</td>
                    <td className="px-3 py-2 text-slate-500">{l.cheque_number || '—'}</td>
                    <td className="px-3 py-2 text-red-700 font-medium">{parseFloat(l.debit_amount) > 0 ? fmt(l.debit_amount) : '—'}</td>
                    <td className="px-3 py-2 text-emerald-700 font-medium">{parseFloat(l.credit_amount) > 0 ? fmt(l.credit_amount) : '—'}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{l.matched_je_number || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${l.is_reconciled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {l.is_reconciled ? 'Reconciled' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => toggleReconcile(l)}
                          className={`px-2 py-0.5 text-xs font-bold rounded-lg ${l.is_reconciled ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                          {l.is_reconciled ? 'Unmatch' : 'Match'}
                        </button>
                        {!l.is_reconciled && (
                          <button onClick={() => deleteLine(l.id)} className="px-2 py-0.5 text-xs font-bold rounded-lg bg-red-50 text-red-700 hover:bg-red-100">Del</button>
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
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — ASSET DEPRECIATION
// ════════════════════════════════════════════════════════════════
function AssetDepreciationTab({ centerId = '' }) {
  const [assets, setAssets]         = useState([]);
  const [history, setHistory]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [running, setRunning]       = useState(false);
  const [msg, setMsg]               = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const now = new Date();
  const [runYear, setRunYear]   = useState(now.getFullYear());
  const [runMonth, setRunMonth] = useState(now.getMonth() + 1);
  const [selected, setSelected] = useState(new Set());

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    const cParam = centerId ? `?center_id=${centerId}` : '';
    const [aRes, hRes] = await Promise.all([
      api(`/api/finance/depreciation/assets${cParam}`),
      api(`/api/finance/depreciation/history${cParam}`),
    ]);
    const aData = await aRes.json();
    const hData = await hRes.json();
    setAssets(aData.assets || []);
    setHistory(hData.history || []);
    setLoading(false);
  }, [centerId]);

  useEffect(() => { load(); }, [load]);

  const runDepreciation = async () => {
    if (!window.confirm(`Run depreciation for ${runYear}-${String(runMonth).padStart(2,'0')}?`)) return;
    setRunning(true);
    const body = { period_year: runYear, period_month: runMonth };
    if (selected.size > 0) body.asset_ids = [...selected];
    const r = await api('/api/finance/depreciation/run', { method: 'POST', body: JSON.stringify(body) });
    const d = await r.json();
    if (d.success !== false) { showMsg('ok', `Depreciation run complete: ${d.posted} assets posted`); load(); }
    else showMsg('err', d.error || 'Run failed');
    setRunning(false);
  };

  const toggleSelect = (id) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const totalMonthly = assets.reduce((s, a) => s + parseFloat(a.monthly_depreciation || 0), 0);

  return (
    <div className="space-y-4">
      {msg && <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      {/* Run panel */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-800 mb-4">Run Monthly Depreciation</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div><label className={labelCls}>Year</label>
            <input type="number" value={runYear} onChange={e => setRunYear(parseInt(e.target.value))}
              className={inputCls + ' w-28'} min={2020} max={2099} /></div>
          <div><label className={labelCls}>Month</label>
            <select value={runMonth} onChange={e => setRunMonth(parseInt(e.target.value))} className={inputCls + ' w-36'}>
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                <option key={i} value={i+1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Selected: {selected.size === 0 ? 'All assets' : `${selected.size} assets`}</p>
            <p className="text-xs text-slate-500">Est. total: <b>{fmt(selected.size === 0 ? totalMonthly : assets.filter(a => selected.has(a.id)).reduce((s, a) => s + parseFloat(a.monthly_depreciation || 0), 0))}</b></p>
          </div>
          <button onClick={runDepreciation} disabled={running}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {running ? 'Running…' : 'Run Depreciation'}
          </button>
          <button onClick={() => setShowHistory(!showHistory)} className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-200">
            {showHistory ? 'Hide History' : 'View History'}
          </button>
        </div>
      </div>

      {loading ? <Spin /> : (
        <>
          {/* Asset list */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex justify-between">
              <h2 className="font-bold text-slate-800">Depreciable Assets ({assets.length})</h2>
              <span className="text-sm text-slate-500">Monthly total: <b>{fmt(totalMonthly)}</b></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>{['','Code','Asset','Type','Purchase Cost','Depr Rate','Monthly','Accum Depr','Net Book Value','Last Run'].map(h => (
                    <th key={h} className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase text-left">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {assets.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No depreciable assets found. Add assets with a depreciation rate in Asset Management.</td></tr>}
                  {assets.map((a, i) => (
                    <tr key={i} className={`hover:bg-slate-50/60 ${selected.has(a.id) ? 'bg-blue-50/40' : ''}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)}
                          className="rounded border-slate-300 text-blue-600" />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{a.asset_code}</td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-800">{a.asset_name}</p>
                        <p className="text-xs text-slate-400">{a.vendor_name || '—'}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{a.asset_type}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{fmt(a.purchase_cost)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{(parseFloat(a.depreciation_rate) * 100).toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">{fmt(a.monthly_depreciation)}</td>
                      <td className="px-3 py-2 text-right text-orange-700">{fmt(a.accumulated_depreciation)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-800">{fmt(a.net_book_value)}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs">
                        {a.last_run_period ? `${String(a.last_run_period).slice(0,4)}-${String(a.last_run_period).slice(4)}` : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Depreciation history */}
          {showHistory && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h2 className="font-bold text-slate-800">Depreciation Run History</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>{['Period','Asset','Amount','JE Number','Run By','Date'].map(h => (
                      <th key={h} className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase text-left">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {history.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No runs yet</td></tr>}
                    {history.map((h, i) => (
                      <tr key={i} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2 font-mono text-sm text-slate-700">{h.period_year}-{String(h.period_month).padStart(2,'0')}</td>
                        <td className="px-4 py-2 text-slate-800">{h.asset_name} <span className="text-xs text-slate-400">({h.asset_code})</span></td>
                        <td className="px-4 py-2 text-right font-bold text-blue-700">{fmt(h.depreciation_amount)}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{h.je_number || '—'}</td>
                        <td className="px-4 py-2 text-slate-500">{h.run_by_name || '—'}</td>
                        <td className="px-4 py-2 text-slate-500">{fmtD(h.run_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — DAILY EXPENSES
// ════════════════════════════════════════════════════════════════

const EMPTY_EXPENSE = {
  expense_date: today(), category: '', category_id: null, sub_category: '',
  description: '', vendor_name: '', amount: '', gst_amount: '',
  payment_method: 'BANK', payment_status: 'PAID',
  reference_number: '', center_id: '', notes: '', po_id: '',
};

const STATUS_COLOR = {
  PAID:      'bg-green-100 text-green-700',
  PENDING:   'bg-amber-100 text-amber-700',
  CANCELLED: 'bg-red-100 text-red-700',
};
const METHOD_COLOR = {
  CASH: 'bg-slate-100 text-slate-700',
  BANK: 'bg-blue-100 text-blue-700',
  UPI:  'bg-violet-100 text-violet-700',
  CARD: 'bg-orange-100 text-orange-700',
};

export function ExpensesTab() {
  const [expenses,         setExpenses]         = useState([]);
  const [total,            setTotal]            = useState(0);
  const [summary,          setSummary]          = useState([]);
  const [centers,          setCenters]          = useState([]);
  const [expenseCategories,setExpenseCategories]= useState([]);
  const [loading,          setLoading]          = useState(true);
  const [modal,            setModal]            = useState(false);
  const [editing,          setEditing]          = useState(null);
  const [form,             setForm]             = useState(EMPTY_EXPENSE);
  const [saving,           setSaving]           = useState(false);
  const [formErr,          setFormErr]          = useState('');
  const [pos,              setPos]              = useState([]);

  // filters
  const [from,      setFrom]      = useState(fyStart());
  const [to,        setTo]        = useState(today());
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page,      setPage]      = useState(1);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from, to, page, limit: LIMIT });
    if (catFilter)    params.set('category', catFilter);
    if (statusFilter) params.set('payment_status', statusFilter);
    const [expRes, sumRes, ctRes] = await Promise.all([
      api(`/api/expenses?${params}`).then(r => r.json()),
      api(`/api/expenses/summary?from=${from}&to=${to}`).then(r => r.json()),
      api('/api/centers').then(r => r.json()),
    ]);
    setExpenses(expRes.expenses || []);
    setTotal(expRes.total || 0);
    setSummary(sumRes.summary || []);
    setCenters((ctRes.centers || []).filter(c => c.active !== false));
    setLoading(false);
  }, [from, to, catFilter, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  // Load open POs once for the PO picker
  useEffect(() => {
    api('/api/expenses/pos').then(r => r.json()).then(d => setPos(d.pos || [])).catch(() => {});
  }, []);

  // Load expense categories from DB once
  useEffect(() => {
    api('/api/item-categories?item_type=EXPENSE').then(r => r.json()).then(d => {
      setExpenseCategories(d.categories || []);
    }).catch(() => {});
  }, []);

  const setF = (f) => (e) => {
    const val = e.target.value;
    setForm(p => {
      const next = { ...p, [f]: val };
      if (f === 'amount' || f === 'gst_amount') {
        const a = parseFloat(f === 'amount' ? val : p.amount) || 0;
        const g = parseFloat(f === 'gst_amount' ? val : p.gst_amount) || 0;
        next._total = (a + g).toFixed(2);
      }
      if (f === 'category_id') {
        const cat = expenseCategories.find(c => String(c.id) === String(val));
        next.category = cat ? cat.name : '';
      }
      return next;
    });
  };

  const openAdd = () => {
    setEditing(null); setForm({ ...EMPTY_EXPENSE }); setFormErr(''); setModal(true);
  };
  const openEdit = (exp) => {
    setEditing(exp);
    setForm({
      expense_date: exp.expense_date?.slice(0,10) || today(),
      category: exp.category_label || exp.category || '',
      category_id: exp.category_id ? String(exp.category_id) : '',
      sub_category: exp.sub_category || '',
      description: exp.description, vendor_name: exp.vendor_name || '',
      amount: exp.amount, gst_amount: exp.gst_amount || '',
      payment_method: exp.payment_method, payment_status: exp.payment_status,
      reference_number: exp.reference_number || '',
      center_id: exp.center_id ? String(exp.center_id) : '',
      notes: exp.notes || '',
      _total: exp.total_amount,
      po_id: exp.po_id ? String(exp.po_id) : '',
    });
    setFormErr(''); setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) return setFormErr('Description is required');
    if (!form.amount || parseFloat(form.amount) <= 0) return setFormErr('Amount must be greater than 0');
    setSaving(true); setFormErr('');
    try {
      const payload = {
        ...form,
        amount:       parseFloat(form.amount),
        gst_amount:   parseFloat(form.gst_amount) || 0,
        total_amount: parseFloat(form._total) || parseFloat(form.amount),
        center_id:    form.center_id || null,
        po_id:        form.po_id     ? parseInt(form.po_id, 10) : null,
        category_id:  form.category_id ? parseInt(form.category_id, 10) : null,
      };
      delete payload._total;
      const url    = editing ? `/api/expenses/${editing.id}` : '/api/expenses';
      const method = editing ? 'PUT' : 'POST';
      const r = await api(url, { method, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d.success) throw new Error(d.errors?.[0]?.msg || d.error || 'Save failed');
      setModal(false); load();
    } catch (ex) { setFormErr(ex.message); }
    setSaving(false);
  };

  const markPaid = async (exp) => {
    await api(`/api/expenses/${exp.id}`, { method: 'PUT', body: JSON.stringify({ payment_status: 'PAID' }) });
    load();
  };

  const deleteExp = async (exp) => {
    if (!window.confirm(`Delete expense "${exp.description}"?`)) return;
    await api(`/api/expenses/${exp.id}`, { method: 'DELETE' });
    load();
  };

  const totalAmt     = summary.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
  const totalPaid    = summary.reduce((s, r) => s + parseFloat(r.paid_amount || 0), 0);
  const totalPending = summary.reduce((s, r) => s + parseFloat(r.pending_amount || 0), 0);

  const theadStyle = { background: 'linear-gradient(to right, #f1f5f9, #e2e8f0)' };
  const thStyle    = { border: '1px solid #cbd5e1', padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' };

  return (
    <div className="space-y-4">

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Expenses', value: fmt(totalAmt),    color: '#dc2626', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
          { label: 'Paid',           value: fmt(totalPaid),   color: '#16a34a', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Pending',        value: fmt(totalPending),color: '#d97706', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        ].map(k => (
          <KpiCard key={k.label} label={k.label} value={k.value} color={k.color} icon={k.icon} />
        ))}
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-rose-600 to-rose-500">
          <div>
            <h3 className="text-sm font-bold text-white">Daily Expenses</h3>
            <p className="text-xs text-rose-100 mt-0.5">{total} record{total !== 1 ? 's' : ''} · {from} to {to}</p>
          </div>
          <button onClick={openAdd} className="inline-flex items-center gap-1.5 bg-white text-rose-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
            Add Expense
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400" />
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400" />
          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400">
            <option value="">All Categories</option>
            {expenseCategories.filter(c => c.level === 1).map(l1 => (
              <optgroup key={l1.id} label={l1.name}>
                {expenseCategories.filter(c => c.level === 2 && c.parent_id === l1.id).map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400">
            <option value="">All Statuses</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-center py-12 text-slate-400 text-sm">Loading…</p>
        ) : expenses.length === 0 ? (
          <p className="text-center py-12 text-slate-400 text-sm">No expenses found for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={theadStyle}>
                  {['Date','Exp #','Category','Description','Vendor','Amount','GST','Total','Method','Status','Centre','Actions'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }} className="hover:bg-rose-50/20 transition-colors">
                    <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{fmtD(e.expense_date)}</td>
                    <td className="px-4 py-3"><span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{e.expense_number}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-semibold text-slate-600">{e.category_label || e.category || '—'}</span></td>
                    <td className="px-4 py-3 text-slate-800 font-medium max-w-[200px]"><div className="truncate">{e.description}</div></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{e.vendor_name || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(e.amount)}</td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">{parseFloat(e.gst_amount || 0) > 0 ? fmt(e.gst_amount) : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(e.total_amount)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${METHOD_COLOR[e.payment_method] || 'bg-slate-100 text-slate-600'}`}>{e.payment_method}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[e.payment_status] || 'bg-slate-100 text-slate-600'}`}>{e.payment_status}</span></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{e.center_name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {e.po_number && (
                          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-mono">{e.po_number}</span>
                        )}
                        {e.journal_entry_id && (
                          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-mono">JE#{e.journal_entry_id}</span>
                        )}
                        <div className="flex gap-2">
                          {e.payment_status === 'PENDING' && (
                            <button onClick={() => markPaid(e)} className="text-green-600 hover:text-green-800 font-semibold text-xs">Pay</button>
                          )}
                          <button onClick={() => openEdit(e)} className="text-blue-600 hover:text-blue-800 font-semibold text-xs">Edit</button>
                          <button onClick={() => deleteExp(e)} className="text-red-500 hover:text-red-700 font-semibold text-xs">Del</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
            <span>Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-100">←</button>
              <button disabled={page * LIMIT >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-100">→</button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 flex justify-between items-center bg-gradient-to-r from-rose-600 to-rose-500 rounded-t-2xl">
              <h3 className="text-base font-bold text-white">{editing ? 'Edit Expense' : 'Add Expense'}</h3>
              <button onClick={() => setModal(false)} className="text-rose-200 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {formErr && <div className="px-3 py-2 bg-red-50 text-red-700 text-xs rounded-lg">{formErr}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Date <span className="text-red-500">*</span></label>
                  <input type="date" className={inputCls} value={form.expense_date} onChange={setF('expense_date')} />
                </div>
                <div>
                  <label className={labelCls}>Category <span className="text-red-500">*</span></label>
                  <select className={inputCls} value={form.category_id || ''} onChange={setF('category_id')}>
                    <option value="">— Select category —</option>
                    {expenseCategories.filter(c => c.level === 1).map(l1 => (
                      <optgroup key={l1.id} label={l1.name}>
                        {expenseCategories.filter(c => c.level === 2 && c.parent_id === l1.id).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Description <span className="text-red-500">*</span></label>
                  <input className={inputCls} value={form.description} onChange={setF('description')} placeholder="e.g. Monthly office rent — Jan 2026" />
                </div>
                <div>
                  <label className={labelCls}>Vendor / Payee</label>
                  <input className={inputCls} value={form.vendor_name} onChange={setF('vendor_name')} placeholder="Vendor name" />
                </div>
                <div>
                  <label className={labelCls}>Reference No.</label>
                  <input className={inputCls} value={form.reference_number} onChange={setF('reference_number')} placeholder="Receipt / invoice #" />
                </div>
                <div>
                  <label className={labelCls}>Amount (excl. GST) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" className={inputCls} value={form.amount} onChange={setF('amount')} placeholder="0.00" />
                </div>
                <div>
                  <label className={labelCls}>GST Amount</label>
                  <input type="number" min="0" step="0.01" className={inputCls} value={form.gst_amount} onChange={setF('gst_amount')} placeholder="0.00" />
                </div>
                {form._total && (
                  <div className="col-span-2 px-3 py-2 bg-slate-50 rounded-lg text-sm font-semibold text-slate-700">
                    Total: <span className="text-rose-600">{fmt(form._total)}</span>
                  </div>
                )}
                <div>
                  <label className={labelCls}>Payment Method</label>
                  <select className={inputCls} value={form.payment_method} onChange={setF('payment_method')}>
                    {['CASH','BANK','UPI','CARD'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select className={inputCls} value={form.payment_status} onChange={setF('payment_status')}>
                    <option value="PAID">Paid</option>
                    <option value="PENDING">Pending</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Centre</label>
                  <select className={inputCls} value={form.center_id} onChange={setF('center_id')}>
                    <option value="">All Centres</option>
                    {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <input className={inputCls} value={form.notes} onChange={setF('notes')} placeholder="Optional notes" />
                </div>

                {/* PO Link — optional */}
                <div className="col-span-2">
                  <label className={labelCls}>Against Purchase Order (optional)</label>
                  <select className={inputCls} value={form.po_id}
                    onChange={e => {
                      const id = e.target.value;
                      const po = pos.find(p => String(p.id) === id);
                      setForm(prev => ({
                        ...prev,
                        po_id: id,
                        vendor_name: po ? po.vendor_name : prev.vendor_name,
                      }));
                    }}>
                    <option value="">— No PO / Petty cash —</option>
                    {pos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.po_number} · {p.vendor_name} · ₹{parseFloat(p.total_amount || 0).toLocaleString('en-IN')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-60">
                  {saving ? 'Saving…' : editing ? 'Update' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — BANK ACCOUNTS & CARDS
// ════════════════════════════════════════════════════════════════

const BANK_ACCOUNT_TYPES = ['CURRENT','SAVINGS','OVERDRAFT','CASH_CREDIT','FIXED_DEPOSIT'];
const CARD_TYPES         = ['CREDIT','DEBIT','PREPAID'];
const CARD_NETWORKS      = ['VISA','MASTERCARD','RUPAY','AMEX','DINERS','OTHER'];

const EMPTY_BANK = {
  account_name:'', account_number:'', bank_name:'', branch_name:'',
  ifsc_code:'', account_type:'CURRENT', center_id:'', opening_balance:'', notes:'', gl_account_id:'',
};
const EMPTY_CARD = {
  card_name:'', last_four:'', card_type:'CREDIT', network:'VISA',
  bank_name:'', expiry_month:'', expiry_year:'', credit_limit:'',
  center_id:'', cardholder_name:'', notes:'',
};

function BankAccountsTab() {
  const [subTab,    setSubTab]    = useState('banks');
  const [accounts,  setAccounts]  = useState([]);
  const [cards,     setCards]     = useState([]);
  const [centers,   setCenters]   = useState([]);
  const [coaAccts,  setCoaAccts]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [modal,     setModal]     = useState(null);   // 'bank-add'|'bank-edit'|'card-add'|'card-edit'
  const [form,      setForm]      = useState({});
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [ba, cc, ct, coa] = await Promise.all([
      api('/api/finance/bank-accounts?all=true').then(r => r.json()),
      api('/api/finance/company-cards?all=true').then(r => r.json()),
      api('/api/centers').then(r => r.json()),
      api('/api/chart-of-accounts/accounts').then(r => r.json()).catch(() => ({ accounts: [] })),
    ]);
    setAccounts(ba.accounts || []);
    setCards(cc.cards || []);
    setCenters((ct.centers || ct || []).filter(c => c.active !== false));
    // Cash & bank accounts: account_code starting with 11
    const all = coa.accounts || coa.data || [];
    setCoaAccts(all.filter(a => a.is_active !== false && String(a.account_code || '').startsWith('11')));
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const setF = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }));

  const openBank = (acct = null) => {
    setForm(acct ? {
      account_name: acct.account_name, account_number: acct.account_number,
      bank_name: acct.bank_name, branch_name: acct.branch_name,
      ifsc_code: acct.ifsc_code, account_type: acct.account_type,
      center_id: acct.center_id ? String(acct.center_id) : '',
      opening_balance: acct.opening_balance || '', notes: acct.notes || '',
      gl_account_id: acct.gl_account_id ? String(acct.gl_account_id) : '',
      _id: acct.id, active: acct.active,
    } : { ...EMPTY_BANK });
    setFormErr(''); setModal(acct ? 'bank-edit' : 'bank-add');
  };

  const openCard = (card = null) => {
    setForm(card ? {
      card_name: card.card_name, last_four: card.last_four,
      card_type: card.card_type, network: card.network,
      bank_name: card.bank_name, expiry_month: String(card.expiry_month),
      expiry_year: String(card.expiry_year), credit_limit: card.credit_limit || '',
      center_id: card.center_id ? String(card.center_id) : '',
      cardholder_name: card.cardholder_name || '', notes: card.notes || '',
      _id: card.id, active: card.active,
    } : { ...EMPTY_CARD });
    setFormErr(''); setModal(card ? 'card-edit' : 'card-add');
  };

  const saveBank = async (e) => {
    e.preventDefault();
    if (!form.account_name || !form.account_number || !form.bank_name || !form.branch_name || !form.ifsc_code)
      return setFormErr('Please fill all required fields');
    setSaving(true); setFormErr('');
    try {
      const isEdit = modal === 'bank-edit';
      const url    = isEdit ? `/api/finance/bank-accounts/${form._id}` : '/api/finance/bank-accounts';
      const r = await api(url, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify({
        ...form, center_id: form.center_id || null, opening_balance: parseFloat(form.opening_balance) || 0,
        gl_account_id: form.gl_account_id ? parseInt(form.gl_account_id) : null,
      }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Save failed');
      setModal(null); loadAll();
    } catch (ex) { setFormErr(ex.message); }
    setSaving(false);
  };

  const saveCard = async (e) => {
    e.preventDefault();
    if (!form.card_name || !form.last_four || !form.bank_name || !form.expiry_month || !form.expiry_year)
      return setFormErr('Please fill all required fields');
    if (!/^\d{4}$/.test(form.last_four)) return setFormErr('Last 4 digits must be exactly 4 numbers');
    setSaving(true); setFormErr('');
    try {
      const isEdit = modal === 'card-edit';
      const url    = isEdit ? `/api/finance/company-cards/${form._id}` : '/api/finance/company-cards';
      const r = await api(url, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify({
        ...form, center_id: form.center_id || null, credit_limit: parseFloat(form.credit_limit) || 0,
      }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Save failed');
      setModal(null); loadAll();
    } catch (ex) { setFormErr(ex.message); }
    setSaving(false);
  };

  const deleteBank = async (id) => {
    if (!window.confirm('Deactivate this bank account?')) return;
    await api(`/api/finance/bank-accounts/${id}`, { method: 'DELETE' });
    loadAll();
  };

  const deleteCard = async (id) => {
    if (!window.confirm('Deactivate this card?')) return;
    await api(`/api/finance/company-cards/${id}`, { method: 'DELETE' });
    loadAll();
  };

  const networkColor = { VISA:'bg-blue-100 text-blue-700', MASTERCARD:'bg-red-100 text-red-700',
    RUPAY:'bg-orange-100 text-orange-700', AMEX:'bg-indigo-100 text-indigo-700',
    DINERS:'bg-slate-100 text-slate-700', OTHER:'bg-slate-100 text-slate-600' };

  const cardTypeColor = { CREDIT:'bg-violet-100 text-violet-700', DEBIT:'bg-teal-100 text-teal-700', PREPAID:'bg-amber-100 text-amber-700' };

  const inCls  = `${inputCls} w-full`;
  const selCls = `${inputCls} w-full`;
  const reqStar = <span className="text-red-500 ml-0.5">*</span>;

  const theadStyle = { background: 'linear-gradient(to right, #f1f5f9, #e2e8f0)' };
  const thStyle    = { border: '1px solid #cbd5e1', padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' };

  return (
    <div className="space-y-4">
      {/* Sub-tab toggle */}
      <div className="flex gap-2">
        {[['banks','Bank Accounts','M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z'],
          ['cards','Payment Cards','M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z']
        ].map(([key, label, icon]) => (
          <button key={key} onClick={() => setSubTab(key)}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
              subTab === key ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
            }`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
            {label}
          </button>
        ))}
      </div>

      {/* Inline loading spinner */}
      {loading && <Spin />}

      {/* ── Bank Accounts panel ── */}
      {!loading && subTab === 'banks' && (
        <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-blue-700 to-blue-500">
            <div>
              <h3 className="text-sm font-bold text-white">Company Bank Accounts</h3>
              <p className="text-xs text-blue-100 mt-0.5">Current, savings and OD accounts used for payments &amp; receipts</p>
            </div>
            <button onClick={() => openBank()} className="inline-flex items-center gap-1.5 bg-white text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              Add Account
            </button>
          </div>
          {accounts.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">No bank accounts added yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={theadStyle}>
                    {['Account Name','Account No.','Bank','Branch','IFSC','Type','Centre','Balance','Status','Actions'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a, i) => (
                    <tr key={a.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{a.account_name}</td>
                      <td className="px-4 py-3"><span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{a.account_number}</span></td>
                      <td className="px-4 py-3 text-slate-700">{a.bank_name}</td>
                      <td className="px-4 py-3 text-slate-600">{a.branch_name}</td>
                      <td className="px-4 py-3"><span className="font-mono text-xs text-slate-600">{a.ifsc_code}</span></td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">{a.account_type}</span></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{a.center_name || <span className="text-slate-300">All</span>}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(a.current_balance)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${a.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {a.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button onClick={() => openBank(a)} className="text-blue-600 hover:text-blue-800 font-semibold text-xs">Edit</button>
                          <button onClick={() => deleteBank(a.id)} className="text-red-500 hover:text-red-700 font-semibold text-xs">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Cards panel ── */}
      {!loading && subTab === 'cards' && (
        <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-violet-700 to-violet-500">
            <div>
              <h3 className="text-sm font-bold text-white">Payment Cards</h3>
              <p className="text-xs text-violet-100 mt-0.5">Corporate credit, debit &amp; prepaid cards</p>
            </div>
            <button onClick={() => openCard()} className="inline-flex items-center gap-1.5 bg-white text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-violet-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              Add Card
            </button>
          </div>
          {cards.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">No cards added yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={theadStyle}>
                    {['Card Name','Number','Type','Network','Bank','Expiry','Limit','Cardholder','Centre','Status','Actions'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c, i) => (
                    <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }} className="hover:bg-violet-50/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{c.card_name}</td>
                      <td className="px-4 py-3"><span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">•••• {c.last_four}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cardTypeColor[c.card_type] || 'bg-slate-100 text-slate-600'}`}>{c.card_type}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${networkColor[c.network] || 'bg-slate-100 text-slate-600'}`}>{c.network}</span></td>
                      <td className="px-4 py-3 text-slate-700">{c.bank_name}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{String(c.expiry_month).padStart(2,'0')}/{c.expiry_year}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{c.card_type === 'CREDIT' ? fmt(c.credit_limit) : '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{c.cardholder_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{c.center_name || <span className="text-slate-300">All</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {c.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button onClick={() => openCard(c)} className="text-violet-600 hover:text-violet-800 font-semibold text-xs">Edit</button>
                          <button onClick={() => deleteCard(c.id)} className="text-red-500 hover:text-red-700 font-semibold text-xs">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Bank Account Modal ── */}
      {(modal === 'bank-add' || modal === 'bank-edit') && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-blue-700 to-blue-500 rounded-t-2xl">
              <h3 className="text-base font-bold text-white">{modal === 'bank-edit' ? 'Edit Bank Account' : 'Add Bank Account'}</h3>
              <button onClick={() => setModal(null)} className="text-blue-200 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={saveBank} className="px-6 py-5 space-y-4">
              {formErr && <div className="px-3 py-2 bg-red-50 text-red-700 text-xs rounded-lg">{formErr}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Account Name {reqStar}</label>
                  <input className={inCls} value={form.account_name} onChange={setF('account_name')} placeholder="e.g. HDFC Current Account" />
                </div>
                <div>
                  <label className={labelCls}>Account Number {reqStar}</label>
                  <input className={inCls} value={form.account_number} onChange={setF('account_number')} placeholder="e.g. 50100012345678" disabled={modal === 'bank-edit'} />
                </div>
                <div>
                  <label className={labelCls}>Account Type {reqStar}</label>
                  <select className={selCls} value={form.account_type} onChange={setF('account_type')}>
                    {BANK_ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Bank Name {reqStar}</label>
                  <input className={inCls} value={form.bank_name} onChange={setF('bank_name')} placeholder="e.g. HDFC Bank" />
                </div>
                <div>
                  <label className={labelCls}>Branch Name {reqStar}</label>
                  <input className={inCls} value={form.branch_name} onChange={setF('branch_name')} placeholder="e.g. Koramangala" />
                </div>
                <div>
                  <label className={labelCls}>IFSC Code {reqStar}</label>
                  <input className={inCls} value={form.ifsc_code} onChange={e => setForm(p => ({ ...p, ifsc_code: e.target.value.toUpperCase() }))} placeholder="e.g. HDFC0001234" maxLength={11} />
                </div>
                <div>
                  <label className={labelCls}>Opening Balance</label>
                  <input type="number" min="0" step="0.01" className={inCls} value={form.opening_balance} onChange={setF('opening_balance')} placeholder="0.00" />
                </div>
                <div>
                  <label className={labelCls}>Centre</label>
                  <select className={selCls} value={form.center_id} onChange={setF('center_id')}>
                    <option value="">All Centres</option>
                    {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>GL Account (for Reconciliation)</label>
                  <select className={selCls} value={form.gl_account_id} onChange={setF('gl_account_id')}>
                    <option value="">— Not linked —</option>
                    {coaAccts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Notes</label>
                  <textarea className={inCls} rows={2} value={form.notes} onChange={setF('notes')} placeholder="Optional notes" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Card Modal ── */}
      {(modal === 'card-add' || modal === 'card-edit') && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-violet-700 to-violet-500 rounded-t-2xl">
              <h3 className="text-base font-bold text-white">{modal === 'card-edit' ? 'Edit Card' : 'Add Payment Card'}</h3>
              <button onClick={() => setModal(null)} className="text-violet-200 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={saveCard} className="px-6 py-5 space-y-4">
              {formErr && <div className="px-3 py-2 bg-red-50 text-red-700 text-xs rounded-lg">{formErr}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Card Name {reqStar}</label>
                  <input className={inCls} value={form.card_name} onChange={setF('card_name')} placeholder="e.g. HDFC Corporate Platinum" />
                </div>
                <div>
                  <label className={labelCls}>Last 4 Digits {reqStar}</label>
                  <input className={inCls} value={form.last_four} onChange={setF('last_four')} maxLength={4} placeholder="e.g. 4321" />
                </div>
                <div>
                  <label className={labelCls}>Card Type {reqStar}</label>
                  <select className={selCls} value={form.card_type} onChange={setF('card_type')}>
                    {CARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Network</label>
                  <select className={selCls} value={form.network} onChange={setF('network')}>
                    {CARD_NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Bank Name {reqStar}</label>
                  <input className={inCls} value={form.bank_name} onChange={setF('bank_name')} placeholder="e.g. HDFC Bank" />
                </div>
                <div>
                  <label className={labelCls}>Expiry Month {reqStar}</label>
                  <select className={selCls} value={form.expiry_month} onChange={setF('expiry_month')}>
                    <option value="">— Month —</option>
                    {Array.from({length:12},(_,i)=>i+1).map(m => (
                      <option key={m} value={m}>{String(m).padStart(2,'0')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Expiry Year {reqStar}</label>
                  <select className={selCls} value={form.expiry_year} onChange={setF('expiry_year')}>
                    <option value="">— Year —</option>
                    {Array.from({length:15},(_,i)=>new Date().getFullYear()+i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                {form.card_type === 'CREDIT' && (
                  <div>
                    <label className={labelCls}>Credit Limit (₹)</label>
                    <input type="number" min="0" step="1000" className={inCls} value={form.credit_limit} onChange={setF('credit_limit')} placeholder="e.g. 500000" />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Cardholder Name</label>
                  <input className={inCls} value={form.cardholder_name} onChange={setF('cardholder_name')} placeholder="Name on card" />
                </div>
                <div>
                  <label className={labelCls}>Centre</label>
                  <select className={selCls} value={form.center_id} onChange={setF('center_id')}>
                    <option value="">All Centres</option>
                    {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Notes</label>
                  <textarea className={inCls} rows={2} value={form.notes} onChange={setF('notes')} placeholder="Optional notes" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB — CENTER CONTRACTS
// ════════════════════════════════════════════════════════════════
const CONTRACT_MODEL_COLORS = {
  LEASE:         { bg: '#e0f2fe', color: '#0369a1' },
  REVENUE_SHARE: { bg: '#dcfce7', color: '#15803d' },
  HYBRID:        { bg: '#fef3c7', color: '#92400e' },
  CUSTOM:        { bg: '#ede9fe', color: '#7c3aed' },
};

const EMPTY_RULE = {
  center_id: '', contract_model: 'LEASE', effective_from: today(),
  effective_to: '', fixed_fee_amount: '', revenue_share_percent: '',
  share_basis: 'GROSS_BILL', minimum_guarantee: '', settlement_frequency: 'MONTHLY',
  expense_account_id: '', payable_party_id: '', notes: ''
};

function CenterContractsTab({ centerId = '', centerName = 'All Centers' }) {
  const [rules,     setRules]     = useState([]);
  const [parties,   setParties]   = useState([]);
  const [expAccts,  setExpAccts]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [modal,     setModal]     = useState(null); // null | 'add'
  const [form,      setForm]      = useState(EMPTY_RULE);
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');
  const [msg,       setMsg]       = useState('');
  // Settlement
  const [settlePeriodStart, setSettleStart] = useState('');
  const [settlePeriodEnd,   setSettleEnd]   = useState('');
  const [settling,          setSettling]    = useState(false);
  const [settleMsg,         setSettleMsg]   = useState({ text: '', type: '' });
  const [settleHistory,     setSettleHist]  = useState([]);

  const todayStr = today();

  // Load reference data on mount
  useEffect(() => {
    api('/api/parties').then(r => r.json()).then(d => setParties(d.parties || []));
    api('/api/chart-of-accounts/accounts?account_type=EXPENSE').then(r => r.json())
      .then(d => setExpAccts(d.accounts || []));
  }, []);

  const loadRules = useCallback(async (cid) => {
    if (!cid) return;
    setLoading(true);
    const r = await api(`/api/center-contract-rules?center_id=${cid}`);
    const d = await r.json();
    setRules(d.rules || []);
    setLoading(false);
  }, []);

  const loadSettleHistory = useCallback(async (cid) => {
    if (!cid) return;
    const r = await api(`/api/finance/center-settlement/history?center_id=${cid}`);
    const d = await r.json();
    setSettleHist(d.history || []);
  }, []);

  useEffect(() => { loadRules(centerId); loadSettleHistory(centerId); }, [centerId, loadRules, loadSettleHistory]);

  const runSettlement = async () => {
    if (!centerId || !settlePeriodStart || !settlePeriodEnd)
      return setSettleMsg({ text: 'Select center and period dates', type: 'error' });
    setSettling(true);
    setSettleMsg({ text: '', type: '' });
    try {
      const r = await api('/api/finance/center-settlement', {
        method: 'POST',
        body: JSON.stringify({ center_id: centerId, period_start: settlePeriodStart, period_end: settlePeriodEnd }),
      });
      const d = await r.json();
      if (d.success) {
        setSettleMsg({ text: `Settlement posted — JE #${d.journal_entry_id || 'N/A'}`, type: 'success' });
        loadSettleHistory(centerId);
      } else {
        setSettleMsg({ text: d.error || 'Settlement failed', type: 'error' });
      }
    } catch (_) { setSettleMsg({ text: 'Network error', type: 'error' }); }
    setSettling(false);
  };

  const handleAdd = async e => {
    e.preventDefault();
    setSaving(true); setErr('');
    const body = { ...form, center_id: centerId };
    const r = await api('/api/center-contract-rules', {
      method: 'POST', body: JSON.stringify(body)
    });
    const d = await r.json();
    if (d.success) {
      setMsg('Rule added successfully');
      setModal(null);
      setForm(EMPTY_RULE);
      loadRules(centerId);
      setTimeout(() => setMsg(''), 3000);
    } else {
      setErr(d.error || 'Save failed');
    }
    setSaving(false);
  };

  const isActive = (rule) => {
    const from = rule.effective_from?.slice(0, 10);
    const to   = rule.effective_to?.slice(0, 10);
    return from <= todayStr && (to === null || to === undefined || to === '' || to > todayStr) && rule.active;
  };

  const fv = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  return (
    <div className="space-y-5">
      {!centerId ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-slate-400 text-sm">
          Select a specific center from the header to manage contract rules and settlements.
        </div>
      ) : (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{centerName}</span>
        <button onClick={() => { setForm({ ...EMPTY_RULE, center_id: centerId }); setModal('add'); setErr(''); }}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl">
          + Add Rule
        </button>
      </div>
      )}

      {msg && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-xl">
          {msg}
        </div>
      )}

      {/* Rules list */}
      {centerId && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">Contract Rules</h3>
            <span className="text-xs text-slate-400">{rules.length} rule{rules.length !== 1 ? 's' : ''}</span>
          </div>

          {loading ? <Spin /> : rules.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">No contract rules found for this center.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rules.map(rule => {
                const mcfg = CONTRACT_MODEL_COLORS[rule.contract_model] || { bg: '#f1f5f9', color: '#475569' };
                const active = isActive(rule);
                const started = rule.effective_from?.slice(0, 10) < todayStr;
                return (
                  <div key={rule.id} className="px-5 py-4 flex flex-wrap items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ background: mcfg.bg, color: mcfg.color }}>
                          {rule.contract_model.replace('_', ' ')}
                        </span>
                        {active && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                            Active
                          </span>
                        )}
                        {!rule.active && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Effective: {fmtD(rule.effective_from)}
                        {rule.effective_to ? ` → ${fmtD(rule.effective_to)}` : ' (open-ended)'}
                      </p>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-600 mt-1">
                        {rule.contract_model === 'LEASE' && (
                          <span>Fixed fee: {fmt(rule.fixed_fee_amount)}</span>
                        )}
                        {(rule.contract_model === 'REVENUE_SHARE' || rule.contract_model === 'HYBRID') && (
                          <span>Rev share: {rule.revenue_share_percent}% of {rule.share_basis}</span>
                        )}
                        {rule.minimum_guarantee > 0 && (
                          <span>Min guarantee: {fmt(rule.minimum_guarantee)}</span>
                        )}
                        <span>Settlement: {rule.settlement_frequency}</span>
                        {rule.expense_account_name && (
                          <span>GL: {rule.expense_account_code} {rule.expense_account_name}</span>
                        )}
                        {rule.payable_party_name && (
                          <span>Party: {rule.payable_party_name}</span>
                        )}
                      </div>
                      {rule.notes && (
                        <p className="text-xs text-slate-400 italic mt-1">{rule.notes}</p>
                      )}
                    </div>
                    {started && (
                      <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 self-start flex-shrink-0">
                        Started — read-only
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Rule Modal */}
      {modal === 'add' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">Add Contract Rule</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Contract Model *</label>
                  <select value={form.contract_model} onChange={fv('contract_model')} className={inputCls} required>
                    <option value="LEASE">Lease (Fixed Fee)</option>
                    <option value="REVENUE_SHARE">Revenue Share</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Settlement Frequency</label>
                  <select value={form.settlement_frequency} onChange={fv('settlement_frequency')} className={inputCls}>
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Effective From *</label>
                  <input type="date" value={form.effective_from} onChange={fv('effective_from')}
                    className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Effective To (leave blank = open)</label>
                  <input type="date" value={form.effective_to} onChange={fv('effective_to')}
                    className={inputCls} />
                </div>
              </div>

              {(form.contract_model === 'LEASE' || form.contract_model === 'HYBRID' || form.contract_model === 'CUSTOM') && (
                <div>
                  <label className={labelCls}>Fixed Fee Amount (₹)</label>
                  <input type="number" step="0.01" min="0" value={form.fixed_fee_amount}
                    onChange={fv('fixed_fee_amount')} className={inputCls} placeholder="0.00" />
                </div>
              )}

              {(form.contract_model === 'REVENUE_SHARE' || form.contract_model === 'HYBRID') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Revenue Share %</label>
                    <input type="number" step="0.01" min="0" max="100" value={form.revenue_share_percent}
                      onChange={fv('revenue_share_percent')} className={inputCls} placeholder="0.00" />
                  </div>
                  <div>
                    <label className={labelCls}>Share Basis</label>
                    <select value={form.share_basis} onChange={fv('share_basis')} className={inputCls}>
                      <option value="GROSS_BILL">Gross Billing</option>
                      <option value="NET_BILL">Net Billing</option>
                      <option value="COLLECTION">Collections</option>
                    </select>
                  </div>
                </div>
              )}

              {form.contract_model === 'HYBRID' && (
                <div>
                  <label className={labelCls}>Minimum Guarantee (₹)</label>
                  <input type="number" step="0.01" min="0" value={form.minimum_guarantee}
                    onChange={fv('minimum_guarantee')} className={inputCls} placeholder="0.00" />
                </div>
              )}

              <div>
                <label className={labelCls}>Expense GL Account</label>
                <select value={form.expense_account_id} onChange={fv('expense_account_id')} className={inputCls}>
                  <option value="">— select account —</option>
                  {expAccts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Payable Party</label>
                <select value={form.payable_party_id} onChange={fv('payable_party_id')} className={inputCls}>
                  <option value="">— select party —</option>
                  {parties.map(p => (
                    <option key={p.id} value={p.id}>{p.party_name} ({p.party_type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={form.notes} onChange={fv('notes')} rows={2}
                  className={inputCls} placeholder="Optional notes" />
              </div>

              {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl disabled:opacity-60">
                  {saving ? 'Saving…' : 'Add Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Settlement Runner ── */}
      {centerId && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-3">Run Center Settlement</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls}>Period Start *</label>
              <input type="date" value={settlePeriodStart} onChange={e => setSettleStart(e.target.value)} className={inputCls + ' w-40'} />
            </div>
            <div>
              <label className={labelCls}>Period End *</label>
              <input type="date" value={settlePeriodEnd} onChange={e => setSettleEnd(e.target.value)} className={inputCls + ' w-40'} />
            </div>
            <button onClick={runSettlement} disabled={settling}
              className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
              style={{ background: '#0d9488' }}>
              {settling ? 'Processing…' : 'Run Settlement'}
            </button>
          </div>
          {settleMsg.text && (
            <div className={`px-4 py-3 rounded-xl text-sm font-semibold border ${settleMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {settleMsg.text}
            </div>
          )}

          {/* Settlement History */}
          {settleHistory.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Settlement History</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      {['JE #','Date','Description','Amount','Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {settleHistory.map(h => (
                      <tr key={h.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 font-mono text-xs text-blue-700">{h.entry_number}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{h.entry_date ? new Date(h.entry_date).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-600 max-w-xs truncate" title={h.description}>{h.description || h.source_ref || '—'}</td>
                        <td className="px-3 py-2 text-xs font-bold text-slate-800 text-right">₹{parseFloat(h.total_debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${h.status === 'POSTED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{h.status}</span>
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENTS TAB
// ═══════════════════════════════════════════════════════════════════════════════
const PAYMENT_MODES = ['CASH','CHEQUE','NEFT','RTGS','UPI'];

const PAYEE_TYPE_CFG = {
  VENDOR:      { label: 'Vendor',      bg: '#e0f2fe', color: '#0369a1' },
  RADIOLOGIST: { label: 'Radiologist', bg: '#ede9fe', color: '#6d28d9' },
  SERVICE:     { label: 'Service',     bg: '#fce7f3', color: '#be185d' },
};

function PaymentsTab() {
  const [payables, setPayables]   = useState([]);
  const [totals,   setTotals]     = useState({ total_outstanding: 0, total_overdue: 0, VENDOR: 0, RADIOLOGIST: 0, SERVICE: 0 });
  const [history,  setHistory]    = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [search,   setSearch]     = useState('');
  const [view,     setView]       = useState('pending'); // 'pending' | 'history'
  const [modal,    setModal]      = useState(null); // payable row being paid
  const [form,     setForm]       = useState({ amount_paid: '', payment_mode: 'NEFT', payment_date: today(), bank_account_id: '', transaction_reference: '', notes: '' });
  const [paying,   setPaying]     = useState(false);
  const [payErr,   setPayErr]     = useState('');
  // Bulk pay
  const [bulkMode,     setBulkMode]     = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkVendor,   setBulkVendor]   = useState('');
  const [bulkForm,     setBulkForm]     = useState({ payment_mode: 'NEFT', payment_date: today(), bank_account_id: '', transaction_reference: '', notes: '' });
  const [bulkPaying,   setBulkPaying]   = useState(false);
  const [bulkErr,      setBulkErr]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pendRes, histRes, bankRes] = await Promise.all([
        api('/api/payments/outstanding').then(r => r.json()),
        api('/api/payments/history').then(r => r.json()),
        api('/api/payments/bank-options').then(r => r.json()),
      ]);
      if (pendRes.success) { setPayables(pendRes.payables); setTotals(pendRes.totals); }
      if (histRes.success)   setHistory(histRes.payments);
      if (bankRes.success)   setBankAccounts(bankRes.accounts);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPay = (row) => {
    setModal(row);
    // Default bank account: first non-petty-cash account, or first in list
    const defaultBank = bankAccounts.find(b => b.account_type !== 'PETTY_CASH') || bankAccounts[0];
    setForm({
      amount_paid: parseFloat(row.balance_amount).toFixed(2),
      payment_mode: 'NEFT',
      payment_date: today(),
      bank_account_id: defaultBank?.id || '',
      transaction_reference: '',
      notes: '',
    });
    setPayErr('');
  };

  const submitPayment = async () => {
    if (!form.amount_paid || parseFloat(form.amount_paid) <= 0) { setPayErr('Enter a valid amount'); return; }
    if (!form.bank_account_id) { setPayErr('Select a bank / cash account'); return; }
    if (!form.transaction_reference?.trim()) { setPayErr('Transaction reference / UTR is required'); return; }
    setPaying(true); setPayErr('');
    try {
      const endpoint = modal.source_type === 'vendor_bill'
        ? `/api/payments/vendor-bill/${modal.id}/pay`
        : `/api/payments/payable/${modal.id}/pay`;
      const r = await api(endpoint, { method: 'POST', body: JSON.stringify({ ...form, amount_paid: parseFloat(form.amount_paid) }) });
      const d = await r.json();
      if (!r.ok) { setPayErr(d.error || d.errors?.[0]?.msg || 'Payment failed'); setPaying(false); return; }
      setModal(null);
      load();
    } catch { setPayErr('Network error'); }
    setPaying(false);
  };

  const vendorBills = payables.filter(p => p.payee_type === 'VENDOR');
  const bulkVendors = [...new Set(vendorBills.map(p => p.payee_name))].sort();
  const bulkBills   = bulkVendor ? vendorBills.filter(p => p.payee_name === bulkVendor) : [];
  const bulkTotal   = bulkBills.filter(p => bulkSelected.has(p.id)).reduce((s, p) => s + parseFloat(p.balance_amount), 0);

  const toggleBulkAll = () => {
    if (bulkBills.every(p => bulkSelected.has(p.id))) {
      setBulkSelected(prev => { const n = new Set(prev); bulkBills.forEach(p => n.delete(p.id)); return n; });
    } else {
      setBulkSelected(prev => { const n = new Set(prev); bulkBills.forEach(p => n.add(p.id)); return n; });
    }
  };

  const submitBulkPay = async () => {
    if (!bulkSelected.size) { setBulkErr('Select at least one bill'); return; }
    if (!bulkForm.bank_account_id) { setBulkErr('Select a bank account'); return; }
    if (!bulkForm.transaction_reference?.trim()) { setBulkErr('Transaction reference is required'); return; }
    setBulkPaying(true); setBulkErr('');
    try {
      const r = await api('/api/payments/vendor-bulk-pay', {
        method: 'POST',
        body: JSON.stringify({ ...bulkForm, bill_ids: [...bulkSelected] }),
      });
      const d = await r.json();
      if (!r.ok) { setBulkErr(d.error || d.errors?.[0]?.msg || 'Payment failed'); return; }
      setBulkSelected(new Set());
      setBulkVendor('');
      setBulkMode(false);
      load();
    } catch { setBulkErr('Network error'); }
    finally { setBulkPaying(false); }
  };

  const displayed = payables.filter(p => {
    if (typeFilter !== 'ALL' && p.payee_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (p.payee_name || '').toLowerCase().includes(q) ||
             (p.reference  || '').toLowerCase().includes(q);
    }
    return true;
  });

  const isOverdue = (row) => row.days_overdue > 0;

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Total Outstanding" value={fmt(totals.total_outstanding)} color="#dc2626"
          icon="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        <KpiCard label="Overdue" value={fmt(totals.total_overdue)} color="#b45309"
          icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        <KpiCard label="Vendor Payables" value={fmt(totals.VENDOR)} color="#0369a1"
          icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        <KpiCard label="Radiologist / Service" value={fmt((totals.RADIOLOGIST || 0) + (totals.SERVICE || 0))} color="#6d28d9"
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {[['pending','Pending Payables'],['history','Payment History']].map(([k,l]) => (
            <button key={k} onClick={() => { setView(k); setBulkMode(false); }}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === k && !bulkMode ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => {
          const opening = !bulkMode;
          setBulkMode(opening);
          setView('pending');
          setBulkSelected(new Set());
          setBulkErr('');
          if (opening) {
            const def = bankAccounts.find(b => b.account_type !== 'PETTY_CASH') || bankAccounts[0];
            setBulkForm(f => ({ ...f, bank_account_id: def?.id || '', payment_date: today() }));
          }
        }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${bulkMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-300 hover:bg-indigo-50'}`}>
          {bulkMode ? '✕ Cancel Bulk Pay' : '⊕ Bulk Pay Vendor'}
        </button>
        {!bulkMode && view === 'pending' && (
          <>
            <div className="flex gap-1">
              {['ALL','VENDOR','RADIOLOGIST','SERVICE'].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${typeFilter === t ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {t === 'ALL' ? 'All' : PAYEE_TYPE_CFG[t]?.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[160px]">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search payee or reference…"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
          </>
        )}
      </div>

      {/* ── Bulk Pay Panel ── */}
      {bulkMode && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}>
            <div>
              <p className="text-white font-bold text-sm">Vendor Consolidated Payment</p>
              <p className="text-indigo-200 text-xs mt-0.5">Select a vendor, pick outstanding bills, pay in one transaction</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Vendor selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Vendor</label>
              <select value={bulkVendor} onChange={e => { setBulkVendor(e.target.value); setBulkSelected(new Set()); }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— Select vendor —</option>
                {bulkVendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Bill list */}
            {bulkVendor && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-600">Outstanding Bills</label>
                  <button onClick={toggleBulkAll} className="text-xs font-semibold text-indigo-600 hover:underline">
                    {bulkBills.every(p => bulkSelected.has(p.id)) ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                {bulkBills.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">No outstanding bills for this vendor</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          <th className="px-3 py-2 w-8"></th>
                          <th className="px-3 py-2 text-left">Bill / Reference</th>
                          <th className="px-3 py-2 text-right">Invoice Total</th>
                          <th className="px-3 py-2 text-right">Already Paid</th>
                          <th className="px-3 py-2 text-right">Balance Due</th>
                          <th className="px-3 py-2 text-left">Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkBills.map(p => {
                          const overdue = p.days_overdue > 0;
                          const checked = bulkSelected.has(p.id);
                          return (
                            <tr key={p.id} onClick={() => setBulkSelected(prev => { const n = new Set(prev); checked ? n.delete(p.id) : n.add(p.id); return n; })}
                              className={`border-t border-slate-100 cursor-pointer transition-colors ${checked ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                              <td className="px-3 py-2.5 text-center">
                                <input type="checkbox" readOnly checked={checked}
                                  className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-medium text-slate-800 text-xs">{p.reference}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{p.source_type === 'vendor_bill' ? 'Vendor Bill' : 'Payable'}</p>
                              </td>
                              <td className="px-3 py-2.5 text-right text-xs text-slate-700">{fmt(p.amount)}</td>
                              <td className="px-3 py-2.5 text-right text-xs text-slate-500">{fmt(p.paid_amount)}</td>
                              <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-800">{fmt(p.balance_amount)}</td>
                              <td className="px-3 py-2.5 text-xs">
                                <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                                  {p.due_date ? new Date(p.due_date).toLocaleDateString('en-IN') : '—'}
                                  {overdue && <span className="ml-1 text-[10px]">({p.days_overdue}d overdue)</span>}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                          <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-indigo-700 text-right">
                            {bulkSelected.size} bill{bulkSelected.size !== 1 ? 's' : ''} selected — Total Payment:
                          </td>
                          <td className="px-3 py-2.5 text-right text-sm font-bold text-indigo-700">{fmt(bulkTotal)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Payment details */}
            {bulkSelected.size > 0 && (
              <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Payment Mode</label>
                  <select value={bulkForm.payment_mode} onChange={e => setBulkForm(f => ({ ...f, payment_mode: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {['NEFT','RTGS','CHEQUE','UPI','CASH'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Payment Date</label>
                  <input type="date" value={bulkForm.payment_date} onChange={e => setBulkForm(f => ({ ...f, payment_date: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Bank Account</label>
                  <select value={bulkForm.bank_account_id} onChange={e => setBulkForm(f => ({ ...f, bank_account_id: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">— Select account —</option>
                    {bankAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.bank_name} — {a.account_name} ({a.gl_account_code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Transaction Reference / UTR *</label>
                  <input value={bulkForm.transaction_reference} onChange={e => setBulkForm(f => ({ ...f, transaction_reference: e.target.value }))}
                    placeholder="UTR / Cheque No / UPI Ref"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes (optional)</label>
                  <input value={bulkForm.notes} onChange={e => setBulkForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. March consolidated payment"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                {bulkErr && <p className="col-span-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{bulkErr}</p>}

                <div className="col-span-2 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-xs text-indigo-700">
                  <p className="font-semibold">One JE will be posted:</p>
                  <p className="mt-0.5">DR AP accounts (per item category) &nbsp;→&nbsp; CR {bankAccounts.find(a => String(a.id) === String(bulkForm.bank_account_id))?.gl_account_code || 'Bank'} &nbsp;·&nbsp; Total: {fmt(bulkTotal)}</p>
                </div>

                <div className="col-span-2 flex justify-end">
                  <button onClick={submitBulkPay} disabled={bulkPaying}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {bulkPaying ? 'Processing…' : `Pay ${fmt(bulkTotal)} — ${bulkSelected.size} Bill${bulkSelected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending payables table */}
      {!bulkMode && view === 'pending' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">No pending payables</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Payee</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Reference</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Paid</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Balance</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Due Date</th>
                    <th className="px-4 py-3 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayed.map(row => {
                    const overdue = isOverdue(row);
                    const cfg = PAYEE_TYPE_CFG[row.payee_type] || {};
                    return (
                      <tr key={`${row.source_type}-${row.id}`}
                        className={`hover:bg-teal-50/30 transition-colors ${overdue ? 'bg-red-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 text-sm">{row.payee_name}</p>
                          {row.center_name && <p className="text-xs text-slate-400">{row.center_name}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ background: cfg.bg, color: cfg.color }}>
                            {cfg.label || row.payee_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.reference}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">{fmt(row.amount)}</td>
                        <td className="px-4 py-3 text-right text-sm text-emerald-600 font-medium">{parseFloat(row.paid_amount) > 0 ? fmt(row.paid_amount) : '—'}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{fmt(row.balance_amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
                            {fmtD(row.due_date)}
                          </span>
                          {overdue && (
                            <p className="text-[10px] text-red-500 font-semibold">{row.days_overdue}d overdue</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => openPay(row)}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors">
                            Pay
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payment history */}
      {!bulkMode && view === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">No payments recorded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Payee</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Reference</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Date</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide w-24">Mode</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Journal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {history.map((h, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{h.payee_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{h.reference}</td>
                      <td className="px-4 py-3 text-center text-xs text-slate-600">{fmtD(h.payment_date)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">{h.payment_mode}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmt(h.amount)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{h.journal_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payment Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="px-5 py-4 rounded-t-2xl flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
              <div>
                <p className="text-white font-bold text-sm">Record Payment</p>
                <p className="text-teal-200 text-xs mt-0.5">{modal.payee_name} · {modal.reference}</p>
              </div>
              <button onClick={() => setModal(null)}
                className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {payErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{payErr}</p>}

              {/* Balance info */}
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
                <div>
                  <p className="text-xs text-slate-500">Invoice Amount</p>
                  <p className="font-bold text-slate-700">{fmt(modal.amount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Balance Due</p>
                  <p className="font-bold text-red-600">{fmt(modal.balance_amount)}</p>
                </div>
                {parseFloat(modal.paid_amount) > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Already Paid</p>
                    <p className="font-bold text-emerald-600">{fmt(modal.paid_amount)}</p>
                  </div>
                )}
              </div>

              {/* Payment Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Amount (₹) <span className="text-red-500">*</span></label>
                <input type="number" min="0.01" step="0.01" value={form.amount_paid}
                  onChange={e => setForm(f => ({ ...f, amount_paid: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>

              {/* Payment Mode + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Mode <span className="text-red-500">*</span></label>
                  <select value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.payment_date}
                    onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </div>

              {/* Bank / Cash Account */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Pay From (Bank / Cash Account) <span className="text-red-500">*</span></label>
                <select value={form.bank_account_id}
                  onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value ? parseInt(e.target.value) : '' }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                  <option value="">— Select account —</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} — {b.account_name} ({b.gl_account_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Transaction Reference */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Transaction Reference / UTR <span className="text-red-500">*</span></label>
                <input value={form.transaction_reference}
                  onChange={e => setForm(f => ({ ...f, transaction_reference: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="UTR / Cheque No / UPI Ref" required />
              </div>

              {/* GL note */}
              {(() => {
                const selBank = bankAccounts.find(b => b.id === form.bank_account_id);
                const crLabel = selBank ? `${selBank.gl_account_code} ${selBank.account_name}` : '—';
                return (
                  <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5 text-xs text-teal-700 space-y-0.5">
                    <p className="font-semibold">Journal entry will be posted automatically:</p>
                    <p>DR {modal.ap_account_code || '2113'} AP Account &nbsp;→&nbsp; CR {crLabel}</p>
                  </div>
                );
              })()}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
              <button onClick={() => setModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={submitPayment} disabled={paying}
                className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {paying ? 'Processing…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ACCOUNTS PAYABLE — Bill lifecycle + Payments
// ════════════════════════════════════════════════════════════════


function calcDueDate(billDate, paymentTerms) {
  if (!billDate || !paymentTerms) return billDate || '';
  const m = (paymentTerms || '').match(/(\d+)\s*DAY/i);
  if (!m) return billDate;
  const d = new Date(billDate);
  d.setDate(d.getDate() + parseInt(m[1]));
  return d.toISOString().slice(0, 10);
}

const EMPTY_BILL = {
  vendor_code: '', vendor_invoice_number: '', center_id: '',
  bill_date: today(), due_date: '', po_id: '',
  subtotal: '', cgst_pct: '0', sgst_pct: '0', igst_pct: '0', notes: '',
};

function BillsSubTab({ onSwitchToPayments }) {
  const [grns,        setGrns]        = useState([]);
  const [advanceBills,setAdvanceBills]= useState([]);
  const [loading,     setLoading]     = useState(true);
  const [vendors,     setVendors]     = useState([]);
  const [search,      setSearch]      = useState(''  );
  const [statusFilter,setStatusFilter]= useState('ALL');
  const [modal,       setModal]       = useState(null);  // grn row
  const [form,        setForm]        = useState(EMPTY_BILL);
  const [saving,      setSaving]      = useState(false);
  const [saveErr,     setSaveErr]     = useState('');
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason,setRejectReason]= useState('');
  const [actionErr,   setActionErr]   = useState('');
  const [repostModal, setRepostModal] = useState(null);
  const [repostForm,  setRepostForm]  = useState({ vendor_invoice_number: '', due_date: '' });
  const [repostSaving,setRepostSaving]= useState(false);
  const [repostErr,   setRepostErr]   = useState('');
  const [applyingAdv, setApplyingAdv] = useState(null); // bill_id being processed

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api('/api/payments/grn-bills');
    const d = await r.json();
    if (d.success) { setGrns(d.grns); setAdvanceBills(d.advance_bills || []); }
    setLoading(false);
  }, []);

  const applyAdvance = async (grn) => {
    const billAmt = parseFloat(grn.bill_amount || grn.total_value || 0);
    const advAmt  = parseFloat(grn.po_advance_amount || 0);
    const netDue  = Math.max(0, billAmt - advAmt);
    const msg = netDue === 0
      ? `Bill: ₹${billAmt.toLocaleString('en-IN')}\nAdvance paid: ₹${advAmt.toLocaleString('en-IN')}\nNet due: ₹0\n\nApply advance and mark ${grn.bill_number} as PAID?`
      : `Bill: ₹${billAmt.toLocaleString('en-IN')}\nAdvance paid: ₹${advAmt.toLocaleString('en-IN')}\nNet due: ₹${netDue.toLocaleString('en-IN')}\n\nApply advance against ${grn.bill_number}?`;
    if (!window.confirm(msg)) return;
    setApplyingAdv(grn.bill_id);
    setActionErr('');
    try {
      const r = await api(`/api/payments/vendor-bills/${grn.bill_id}/apply-advance`, { method: 'POST', body: '{}' });
      const d = await r.json();
      if (d.success) {
        if (d.no_advance || d.advance_voided) {
          // Advance already exhausted by a previous GRN, or never paid — pay directly
          window.alert(d.message || 'No advance available — please make a direct payment from the Payments tab.');
          onSwitchToPayments();
        } else {
          load();
        }
      } else {
        setActionErr(d.error || 'Failed to apply advance');
      }
    } catch { setActionErr('Network error'); }
    finally { setApplyingAdv(null); }
  };

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api('/api/vendors?active=true').then(r => r.json()).then(d => {
      if (d.success || d.vendors) setVendors(d.vendors || []);
    }).catch(() => {});
  }, []);

  // Open "Post Invoice" modal for a GRN
  const openBill = (grn) => {
    const matched = vendors.find(v =>
      v.vendor_name.toLowerCase() === (grn.vendor_name || '').toLowerCase()
    );
    // If re-submitting a rejected bill or updating a DRAFT, pre-fill from existing bill data
    if (grn.bill_status === 'REJECTED' || grn.bill_status === 'DRAFT') {
      const sub = parseFloat(grn.bill_amount || grn.total_value || 0);
      setForm({
        ...EMPTY_BILL,
        vendor_invoice_number: grn.vendor_invoice_number || '',
        bill_date: grn.receipt_date?.slice(0, 10) || today(),
        due_date:  grn.bill_due_date?.slice(0, 10) || (matched?.payment_terms ? calcDueDate(grn.receipt_date?.slice(0, 10), matched.payment_terms) : ''),
        po_id:     grn.po_id || '',
        subtotal:  sub.toFixed(2),
        cgst_pct:  '0', sgst_pct: '0', igst_pct: '0',
      });
    } else {
      // Fresh bill — pre-fill from GRN items
      const items = grn.items || [];
      const subtotal   = items.reduce((s, i) => s + parseFloat(i.amount || 0) - parseFloat(i.gst_amount || 0), 0);
      const totalGST   = items.reduce((s, i) => s + parseFloat(i.gst_amount || 0), 0);
      const avgGstRate = subtotal > 0 ? ((totalGST / subtotal) * 100 / 2) : 0;
      setForm({
        ...EMPTY_BILL,
        vendor_code:  matched?.vendor_code || '',
        bill_date:    grn.receipt_date?.slice(0, 10) || today(),
        due_date:     matched?.payment_terms ? calcDueDate(grn.receipt_date?.slice(0, 10), matched.payment_terms) : '',
        po_id:        grn.po_id || '',
        subtotal:     subtotal.toFixed(2),
        cgst_pct:     avgGstRate.toFixed(2),
        sgst_pct:     avgGstRate.toFixed(2),
        igst_pct:     '0',
      });
    }
    setSaveErr('');
    setModal(grn);
  };

  const sf = field => e => {
    const val = e.target.value;
    setForm(f => {
      const next = { ...f, [field]: val };
      if (field === 'vendor_code' || field === 'bill_date') {
        const vc = field === 'vendor_code' ? val : f.vendor_code;
        const bd = field === 'bill_date'   ? val : f.bill_date;
        const v  = vendors.find(x => x.vendor_code === vc);
        if (v?.payment_terms) next.due_date = calcDueDate(bd, v.payment_terms);
      }
      return next;
    });
  };

  const computedTotal = () => {
    const sub  = parseFloat(form.subtotal || 0);
    const cgst = sub * (parseFloat(form.cgst_pct || 0) / 100);
    const sgst = sub * (parseFloat(form.sgst_pct || 0) / 100);
    const igst = sub * (parseFloat(form.igst_pct || 0) / 100);
    return (sub + cgst + sgst + igst).toFixed(2);
  };

  const handleSave = async () => {
    if (!form.vendor_invoice_number) { setSaveErr('Vendor invoice number is required'); return; }
    if (!form.subtotal || parseFloat(form.subtotal) <= 0) { setSaveErr('Enter a valid subtotal'); return; }
    if (!form.due_date) { setSaveErr('Due date is required'); return; }
    setSaving(true); setSaveErr('');
    const payload = { ...form, grn_id: modal.grn_id, vendor_name: modal.vendor_name, vendor_gstin: modal.vendor_gstin };
    const isUpdate = (modal.bill_status === 'REJECTED' || modal.bill_status === 'DRAFT') && modal.bill_id;
    const r = isUpdate
      ? await api(`/api/payments/vendor-bills/${modal.bill_id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/payments/vendor-bills', { method: 'POST', body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) { setSaveErr(d.error || d.errors?.[0]?.msg || 'Save failed'); setSaving(false); return; }
    // Auto-submit after save
    const billId = isUpdate ? modal.bill_id : d.bill?.id;
    if (billId) {
      await api(`/api/payments/vendor-bills/${billId}/submit`, { method: 'POST' });
    }
    setModal(null);
    load();
    setSaving(false);
  };

  const doAction = async (bill_id, action) => {
    setActionErr('');
    const r = await api(`/api/payments/vendor-bills/${bill_id}/${action}`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { setActionErr(d.error || `${action} failed`); return; }
    load();
  };

  const doReject = async () => {
    if (!rejectReason.trim()) { setActionErr('Rejection reason is required'); return; }
    setActionErr('');
    const r = await api(`/api/payments/vendor-bills/${rejectModal.bill_id}/reject`, {
      method: 'POST', body: JSON.stringify({ reason: rejectReason }),
    });
    const d = await r.json();
    if (!r.ok) { setActionErr(d.error || 'Rejection failed'); return; }
    setRejectModal(null); setRejectReason(''); load();
  };

  const BILL_STATUS_LABEL = {
    undefined:   { label: 'Awaiting Invoice', bg: '#fef3c7', color: '#92400e' },
    null:        { label: 'Awaiting Invoice', bg: '#fef3c7', color: '#92400e' },
    DRAFT:       { label: 'Draft',            bg: '#f1f5f9', color: '#475569' },
    SUBMITTED:   { label: 'Pending Approval', bg: '#dbeafe', color: '#1e40af' },
    APPROVED:    { label: 'Approved',         bg: '#dcfce7', color: '#166534' },
    REJECTED:    { label: 'Rejected',         bg: '#fee2e2', color: '#991b1b' },
  };

  const displayed = grns.filter(g => {
    const bStatus = g.bill_status || null;
    if (statusFilter === 'AWAITING' && bStatus !== null) return false;
    if (statusFilter === 'DRAFT'    && bStatus !== 'DRAFT')     return false;
    if (statusFilter === 'SUBMITTED'&& bStatus !== 'SUBMITTED') return false;
    if (statusFilter === 'APPROVED' && bStatus !== 'APPROVED')  return false;
    if (search) {
      const q = search.toLowerCase();
      return (g.grn_number || '').toLowerCase().includes(q)
          || (g.vendor_name || '').toLowerCase().includes(q)
          || (g.po_number   || '').toLowerCase().includes(q);
    }
    return true;
  });

  const kpis = {
    total:     grns.length,
    awaiting:  grns.filter(g => !g.bill_id).length,
    pending:   grns.filter(g => g.bill_status === 'SUBMITTED').length,
    approved:  grns.filter(g => g.bill_status === 'APPROVED').length,
  };

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Total GRNs"       value={kpis.total}    color="#0369a1"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        <KpiCard label="Awaiting Invoice" value={kpis.awaiting} color="#b45309"
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard label="Pending Approval" value={kpis.pending}  color="#7c3aed"
          icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        <KpiCard label="Approved"         value={kpis.approved} color="#15803d"
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 flex-wrap">
          {[
            ['ALL','All GRNs'],['AWAITING','Awaiting Invoice'],['SUBMITTED','Pending Approval'],['APPROVED','Approved']
          ].map(([k,l]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors
                ${statusFilter === k ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search GRN, vendor, PO…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
      </div>

      {actionErr && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionErr}</p>
      )}

      {/* GRN table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? <Spin /> : displayed.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">No GRNs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">GRN</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">PO No.</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide w-28">Receipt Date</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide w-32">GRN Value</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide w-36">Bill Status</th>
                  <th className="px-4 py-3 w-40"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayed.map(grn => {
                  const bsCfg = BILL_STATUS_LABEL[grn.bill_status] || BILL_STATUS_LABEL[null];
                  return (
                    <tr key={grn.grn_id} className="hover:bg-teal-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono font-semibold text-teal-700 text-sm">{grn.grn_number}</p>
                        {grn.center_name && <p className="text-xs text-slate-400">{grn.center_name}<CorpBadge code={grn.center_code} /></p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 text-sm">{grn.vendor_name}</p>
                        {grn.vendor_gstin && <p className="text-[10px] text-slate-400 font-mono">{grn.vendor_gstin}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{grn.po_number}</td>
                      <td className="px-4 py-3 text-center text-xs text-slate-600">{fmtD(grn.receipt_date)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-800">{fmt(grn.total_value)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ background: bsCfg.bg, color: bsCfg.color }}>
                          {bsCfg.label}
                        </span>
                        {grn.bill_number && (
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">{grn.bill_number}</p>
                        )}
                        {grn.bill_status === 'SUBMITTED' && grn.vendor_invoice_number && (
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">Inv# {grn.vendor_invoice_number}</p>
                        )}
                        {grn.bill_status === 'SUBMITTED' && grn.bill_due_date && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Due {fmtD(grn.bill_due_date)}</p>
                        )}
                        {grn.bill_status === 'APPROVED' && (
                          <p className="text-[10px] mt-0.5" style={{ color: grn.payment_status === 'PAID' ? '#166534' : '#b45309' }}>
                            {grn.payment_status}
                          </p>
                        )}
                        {grn.bill_status === 'REJECTED' && grn.rejected_reason && (
                          <p className="text-[10px] text-red-500 mt-0.5 max-w-[140px] truncate" title={grn.rejected_reason}>
                            ↩ {grn.rejected_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* No bill yet, or bill is DRAFT — enter invoice details */}
                          {(!grn.bill_id || grn.bill_status === 'DRAFT') && (
                            <button onClick={() => openBill(grn)}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors">
                              Post Invoice
                            </button>
                          )}
                          {/* SUBMITTED — Approve / Reject */}
                          {grn.bill_status === 'SUBMITTED' && (<>
                            <button onClick={() => doAction(grn.bill_id, 'approve')}
                              className="px-2 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">
                              Approve
                            </button>
                            <button onClick={() => { setRejectModal(grn); setRejectReason(''); setActionErr(''); }}
                              className="px-2 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
                              Reject
                            </button>
                          </>)}
                          {/* APPROVED — Pay (auto-applies advance if PO had one and not yet applied) */}
                          {grn.bill_status === 'APPROVED' && grn.payment_status !== 'PAID' && (
                            parseFloat(grn.po_advance_amount || 0) > 0 && grn.payment_status === 'PENDING'
                              ? <button
                                  onClick={() => applyAdvance(grn)}
                                  disabled={applyingAdv === grn.bill_id}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors">
                                  {applyingAdv === grn.bill_id ? '…' : 'Pay'}
                                </button>
                              : <button
                                  onClick={() => onSwitchToPayments()}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors">
                                  {grn.payment_status === 'PARTIAL' ? 'Pay Balance' : 'Pay'}
                                </button>
                          )}
                          {/* REJECTED — Repost (correct inv#/due date) or full Edit & Resubmit */}
                          {grn.bill_status === 'REJECTED' && (
                            <button onClick={() => { setRepostModal(grn); setRepostForm({ vendor_invoice_number: grn.vendor_invoice_number || '', due_date: grn.due_date ? grn.due_date.slice(0,10) : '' }); setRepostErr(''); }}
                              className="px-2 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors">
                              Repost
                            </button>
                          )}
                          {grn.bill_status === 'REJECTED' && (
                            <button onClick={() => openBill(grn)}
                              className="px-2 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                              Edit
                            </button>
                          )}
                          {grn.payment_status === 'PAID' && (
                            <span className="text-xs font-semibold text-emerald-600">✓ Paid</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Advance Bills Section */}
      {advanceBills.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-100 flex items-center gap-2"
            style={{ background: 'linear-gradient(to right,#fffbeb,#fef3c7)' }}>
            <span className="text-sm font-bold text-amber-800">Advance Bills</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200 text-amber-800">{advanceBills.length}</span>
            <span className="text-xs text-amber-600 ml-1">— from POs with advance payment terms</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 border-b border-amber-100">
                  {['Bill #','Vendor','PO #','Advance %','Amount','Status','Actions'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-amber-700 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {advanceBills.map(b => {
                  const STATUS_CFG = {
                    SUBMITTED: { label: 'Pending Approval', bg: '#fef3c7', color: '#92400e' },
                    APPROVED:  { label: 'Approved',         bg: '#dcfce7', color: '#166534' },
                    REJECTED:  { label: 'Rejected',         bg: '#fee2e2', color: '#991b1b' },
                  };
                  const cfg = STATUS_CFG[b.bill_status] || { label: b.bill_status, bg: '#f1f5f9', color: '#475569' };
                  return (
                    <tr key={b.bill_id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-amber-700">{b.bill_number}</span>
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">ADVANCE</span>
                        {b.center_name && <p className="text-[10px] text-slate-400 mt-0.5">{b.center_name}<CorpBadge code={b.center_code} /></p>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{b.vendor_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.po_number}</td>
                      <td className="px-4 py-3 text-center text-xs text-slate-600">{b.advance_percentage ? `${b.advance_percentage}%` : '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{fmt(b.bill_amount)}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                        {b.payment_status === 'PAID' && (
                          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">✓ Paid</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {b.bill_status === 'SUBMITTED' && (<>
                            <button onClick={() => doAction(b.bill_id, 'approve')}
                              className="px-2 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                              Approve
                            </button>
                            <button onClick={() => { setRejectModal(b); setRejectReason(''); setActionErr(''); }}
                              className="px-2 py-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg">
                              Reject
                            </button>
                          </>)}
                          {b.bill_status === 'APPROVED' && b.payment_status !== 'PAID' && (
                            <button onClick={() => onSwitchToPayments()}
                              className="px-2 py-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg">
                              Pay
                            </button>
                          )}
                          {b.payment_status === 'PAID' && (
                            <span className="text-xs text-emerald-600 font-semibold">✓ Paid</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Post Invoice Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)', borderRadius: '1rem 1rem 0 0' }}>
              <div>
                <p className="text-white font-bold">
                  {modal.bill_status === 'REJECTED' ? 'Edit & Resubmit Invoice' : 'Post Vendor Invoice'}
                </p>
                <p className="text-teal-200 text-xs mt-0.5">
                  GRN: {modal.grn_number} &nbsp;·&nbsp; {modal.vendor_name} &nbsp;·&nbsp; {modal.po_number}
                </p>
                {modal.bill_status === 'REJECTED' && modal.rejected_reason && (
                  <p className="text-red-300 text-xs mt-1">
                    ↩ Rejected: {modal.rejected_reason}
                  </p>
                )}
              </div>
              <button onClick={() => setModal(null)}
                className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* GRN Items (read-only) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                <p className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  Items Received (GRN)
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Item</th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-500 w-20">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-500 w-24">Rate</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-500 w-20">GST%</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-500 w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(modal.items || []).map((item, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="px-3 py-2 text-slate-700">{item.item_name}</td>
                        <td className="px-3 py-2 text-center text-slate-600">{item.received_qty} {item.uom}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{fmt(item.unit_rate)}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{item.gst_rate}%</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmt(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100">
                      <td colSpan={4} className="px-3 py-2 text-right font-bold text-slate-600 text-xs">GRN Total</td>
                      <td className="px-3 py-2 text-right font-black text-slate-800">{fmt(modal.total_value)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Vendor — auto from GRN, read-only */}
              <div>
                <label className={labelCls}>Vendor</label>
                <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700 font-semibold">
                  {modal.vendor_name}
                </div>
              </div>

              {/* Invoice No + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Vendor Invoice No. <span className="text-red-500">*</span></label>
                  <input value={form.vendor_invoice_number} onChange={sf('vendor_invoice_number')}
                    className={inputCls} placeholder="Vendor's invoice reference" />
                </div>
                <div>
                  <label className={labelCls}>Invoice Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.bill_date} onChange={sf('bill_date')} className={inputCls} />
                </div>
              </div>

              {/* Due Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Due Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.due_date} onChange={sf('due_date')} className={inputCls} />
                  {form.vendor_code && (() => {
                    const v = vendors.find(x => x.vendor_code === form.vendor_code);
                    return v?.payment_terms
                      ? <p className="text-[10px] text-slate-400 mt-0.5">Terms: {v.payment_terms}</p>
                      : null;
                  })()}
                </div>
                <div className="flex items-end">
                  <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 w-full">
                    <span className="font-semibold text-slate-700">GRN Value: {fmt(modal.total_value)}</span><br />
                    <span className="text-[10px]">Verify invoice amounts match GRN</span>
                  </p>
                </div>
              </div>

              {/* Amounts — pre-filled, editable for discrepancies */}
              <div>
                <label className={labelCls}>
                  Subtotal (₹) <span className="text-red-500">*</span>
                  <span className="ml-2 text-[10px] text-slate-400 normal-case font-normal">Edit if invoice differs from GRN</span>
                </label>
                <input type="number" min="0.01" step="0.01" value={form.subtotal}
                  onChange={sf('subtotal')} className={inputCls} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[['cgst_pct','CGST %'],['sgst_pct','SGST %'],['igst_pct','IGST %']].map(([f,l]) => (
                  <div key={f}>
                    <label className={labelCls}>{l}</label>
                    <input type="number" min="0" max="28" step="0.5" value={form[f]}
                      onChange={sf(f)} className={inputCls} />
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
                <span className="text-sm font-semibold text-teal-700">Invoice Total (incl. GST)</span>
                <span className={`text-xl font-black ${Math.abs(parseFloat(computedTotal()) - parseFloat(modal.total_value)) > 0.5 ? 'text-amber-600' : 'text-teal-800'}`}>
                  {fmt(computedTotal())}
                  {Math.abs(parseFloat(computedTotal()) - parseFloat(modal.total_value)) > 0.5 && (
                    <span className="text-xs font-normal ml-2 text-amber-600">⚠ differs from GRN</span>
                  )}
                </span>
              </div>

              {/* Notes */}
              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={form.notes} onChange={sf('notes')} rows={2} className={inputCls}
                  placeholder="e.g. partial delivery, price discrepancy note…" />
              </div>

              {saveErr && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveErr}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setModal(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving ? 'Submitting…' : modal.bill_status === 'REJECTED' ? 'Edit & Resubmit' : 'Post Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Reject Bill</h3>
            <p className="text-sm text-slate-600">
              Rejecting bill for GRN <span className="font-mono font-semibold text-teal-700">{rejectModal.grn_number}</span>
            </p>
            <div>
              <label className={labelCls}>Reason <span className="text-red-500">*</span></label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                rows={3} className={inputCls} placeholder="Why is this bill being rejected?" />
            </div>
            {actionErr && <p className="text-xs text-red-500">{actionErr}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejectModal(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={doReject}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors">
                Reject Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Repost Modal — correct inv# and due date on APPROVED bill */}
      {repostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Repost Bill — Correct Details</h3>
            <p className="text-xs text-slate-500">
              Bill <span className="font-mono font-semibold text-teal-700">{repostModal.bill_number}</span> is already approved.
              You can correct the invoice number and due date only. The journal entry will not change.
            </p>
            <div>
              <label className={labelCls}>Vendor Invoice Number</label>
              <input value={repostForm.vendor_invoice_number}
                onChange={e => setRepostForm(f => ({ ...f, vendor_invoice_number: e.target.value }))}
                className={inputCls} placeholder="e.g. INV-2024-001" />
            </div>
            <div>
              <label className={labelCls}>Due Date</label>
              <input type="date" value={repostForm.due_date}
                onChange={e => setRepostForm(f => ({ ...f, due_date: e.target.value }))}
                className={inputCls} />
            </div>
            {repostErr && <p className="text-xs text-red-500">{repostErr}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setRepostModal(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button disabled={repostSaving} onClick={async () => {
                setRepostSaving(true); setRepostErr('');
                try {
                  const r = await api(`/api/payments/vendor-bills/${repostModal.bill_id}/repost`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(repostForm),
                  });
                  const d = await r.json();
                  if (!r.ok) { setRepostErr(d.error || 'Failed to repost'); return; }
                  setRepostModal(null);
                  load();
                } catch { setRepostErr('Network error'); }
                finally { setRepostSaving(false); }
              }}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-60">
                {repostSaving ? 'Saving…' : 'Save Corrections'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reporter Consolidated Billing Sub-tab ─────────────────────────────────────
function TeleRadBillingSubTab() {
  const [reporters, setReporters] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [expanding, setExpanding] = useState({});
  const [consolidating, setConsolidating] = useState(null);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState('');

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB') : '—';

  const load = () => {
    setLoading(true); setError(''); setResult(null);
    const p = new URLSearchParams();
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo)   p.set('date_to',   dateTo);
    api(`/api/payments/tele-rad/accruals?${p}`)
      .then(r => r.json())
      .then(d => { if (d.success) setReporters(d.reporters); else setError(d.error || 'Failed to load'); })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const consolidate = async (rep) => {
    const isTeleRad = rep.reporter_type === 'TELERADIOLOGY';
    if (isTeleRad && !rep.vendor_code) {
      setError(`"${isTeleRad ? rep.reporter_name : `Dr. ${rep.reporter_name}`}" has no vendor linked. Set vendor_code in Radiologist Master first.`);
      return;
    }
    const tds = isTeleRad ? 0 : parseFloat((rep.total * (rep.tds_rate || 0) / 100).toFixed(2));
    const net = rep.total - tds;
    const msg = isTeleRad
      ? `Generate vendor bill for ${rep.reporter_name}?\n\n${rep.count} studies · Gross: ${fmt(rep.total)}\n\nBill will be SUBMITTED for AP approval.`
      : `Generate payment batch for Dr. ${rep.reporter_name}?\n\n${rep.count} studies · Gross: ${fmt(rep.total)}\nTDS @${rep.tds_rate || 0}%: −${fmt(tds)}\nNet payable: ${fmt(net)}\nPAN: ${rep.pan_number || 'Not set'}\nBank: ${rep.bank_name || '—'} · ${rep.bank_account_number || '—'}\nIFSC: ${rep.ifsc_code || '—'}${rep.upi_id ? `\nUPI: ${rep.upi_id}` : ''}`;
    if (!window.confirm(msg)) return;
    setConsolidating(rep.reporter_id); setError('');
    try {
      const body = { reporter_id: rep.reporter_id };
      if (dateFrom) body.date_from = dateFrom;
      if (dateTo)   body.date_to   = dateTo;
      const r = await api('/api/payments/tele-rad/consolidate', { method: 'POST', body: JSON.stringify(body) });
      const d = await r.json();
      if (r.ok) { setResult(d); load(); }
      else setError(d.error || 'Consolidation failed');
    } catch { setError('Network error'); }
    finally { setConsolidating(null); }
  };

  // Group reporters by type for display
  const teleRad   = reporters.filter(r => r.reporter_type === 'TELERADIOLOGY');
  const radiologists = reporters.filter(r => r.reporter_type === 'RADIOLOGIST');

  const ReporterCard = ({ rep }) => {
    const isTeleRad = rep.reporter_type === 'TELERADIOLOGY';
    const tds = isTeleRad ? 0 : parseFloat((rep.total * (rep.tds_rate || 0) / 100).toFixed(2));
    const net = rep.total - tds;
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isTeleRad ? 'bg-violet-100' : 'bg-teal-100'}`}>
              <svg className={`w-5 h-5 ${isTeleRad ? 'text-violet-600' : 'text-teal-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isTeleRad
                  ? 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
                  : 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'} />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-800">{isTeleRad ? rep.reporter_name : `Dr. ${rep.reporter_name}`}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isTeleRad ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700'}`}>
                  {isTeleRad ? 'Tele-rad' : 'Radiologist'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{rep.reporter_code}
                {isTeleRad
                  ? rep.vendor_code
                    ? <span className="ml-2 text-emerald-600">· Vendor: {rep.vendor_code}</span>
                    : <span className="ml-2 text-red-500">· No vendor linked</span>
                  : rep.pan_number
                    ? <span className="ml-2 text-slate-400">· PAN: {rep.pan_number}</span>
                    : <span className="ml-2 text-amber-500">· PAN not set</span>
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-slate-500">{rep.count} studies · Gross {fmt(rep.total)}</p>
              {!isTeleRad && tds > 0 && (
                <p className="text-xs text-slate-400">TDS @{rep.tds_rate}% −{fmt(tds)} · Net <span className="font-semibold text-slate-700">{fmt(net)}</span></p>
              )}
              {isTeleRad && <p className="text-base font-bold text-slate-800">{fmt(rep.total)}</p>}
            </div>
            <button onClick={() => setExpanding(p => ({ ...p, [rep.reporter_id]: !p[rep.reporter_id] }))}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
              <svg className={`w-4 h-4 transition-transform ${expanding[rep.reporter_id] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button onClick={() => consolidate(rep)} disabled={consolidating === rep.reporter_id}
              className={`px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-50 transition-colors ${isTeleRad ? 'bg-violet-600 hover:bg-violet-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
              {consolidating === rep.reporter_id ? 'Generating…' : isTeleRad ? 'Generate Bill' : 'Generate Batch'}
            </button>
          </div>
        </div>
        {expanding[rep.reporter_id] && (
          <div className="border-t border-slate-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="px-5 py-2 text-left">Accrual #</th>
                  <th className="px-5 py-2 text-left">Date</th>
                  <th className="px-5 py-2 text-left">Reference</th>
                  <th className="px-5 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rep.entries.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2 font-mono text-slate-600">{e.payable_number}</td>
                    <td className="px-5 py-2 text-slate-500">{fmtDate(e.created_at)}</td>
                    <td className="px-5 py-2 text-slate-500 truncate max-w-xs">{e.notes}</td>
                    <td className="px-5 py-2 text-right font-semibold text-slate-700">{fmt(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold">
                  <td colSpan={3} className="px-5 py-2 text-right text-slate-600">Gross Total</td>
                  <td className="px-5 py-2 text-right text-slate-800">{fmt(rep.total)}</td>
                </tr>
                {!isTeleRad && tds > 0 && <>
                  <tr className="bg-slate-50">
                    <td colSpan={3} className="px-5 py-2 text-right text-slate-500">TDS @{rep.tds_rate}%</td>
                    <td className="px-5 py-2 text-right text-red-600">−{fmt(tds)}</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={3} className="px-5 py-2 text-right text-slate-700">Net Payable</td>
                    <td className="px-5 py-2 text-right text-teal-700">{fmt(net)}</td>
                  </tr>
                </>}
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Reporter Consolidated Billing</h2>
            <p className="text-xs text-slate-500 mt-0.5">Group per-study accruals into bills by period. Tele-rad → vendor bill (AP approval). Radiologist → payment batch (TDS deducted).</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <button onClick={load} className="px-4 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
              Search
            </button>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
          ✓ <span className="font-bold">{result.bill_number}</span> — {result.studies} studies ·
          {result.reporter_type === 'TELERADIOLOGY'
            ? <> Gross {fmt(result.gross)} · Pending AP approval</>
            : <> Gross {fmt(result.gross)} · TDS {fmt(result.tds_amount)} · Net payable {fmt(result.net_amount)}</>}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center text-slate-400 text-sm">Loading accruals…</div>
      ) : reporters.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold text-slate-400">No pending accruals</p>
          <p className="text-xs text-slate-400 mt-1">All study accruals have been consolidated, or try a different date range.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {teleRad.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-violet-700 uppercase tracking-widest px-1">Teleradiology Companies ({teleRad.length})</p>
              {teleRad.map(rep => <ReporterCard key={rep.reporter_id} rep={rep} />)}
            </div>
          )}
          {radiologists.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-teal-700 uppercase tracking-widest px-1">Radiologists ({radiologists.length})</p>
              {radiologists.map(rep => <ReporterCard key={rep.reporter_id} rep={rep} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PAY_MODES_V  = ['CASH', 'CHEQUE', 'NEFT', 'RTGS', 'UPI'];
const AP_CODE_HINT = { SUPPLIER: '2111', CONTRACTOR: '2112', SERVICE: '2113', UTILITY: '2114', OTHER: '2113' };
const VB_STATUS_CLS = { PENDING: 'bg-amber-100 text-amber-700', PARTIAL: 'bg-blue-100 text-blue-700', PAID: 'bg-emerald-100 text-emerald-700', CANCELLED: 'bg-red-100 text-red-700' };

// ── Direct Bill Modal (non-PO vendor bill) ────────────────────────────────────
function DirectBillModal({ vendors, glAccounts, onClose, onSaved }) {
  const d0 = new Date(); const todayStr = `${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,'0')}-${String(d0.getDate()).padStart(2,'0')}`;
  const [form, setForm] = useState({ vendor_code: '', bill_number: '', bill_date: todayStr, due_date: '', notes: '', itc_claimable: false });
  const [items, setItems] = useState([{ item_name: '', quantity: '1', rate: '', gst_rate: '18', cgst_amount: '0', sgst_amount: '0', igst_amount: '0', hsn_code: '', gl_account_id: '' }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  // Derive taxpayer status from selected vendor
  const selectedVendor = vendors.find(v => v.vendor_code === form.vendor_code);
  const vendorIsTaxpayer = selectedVendor ? (selectedVendor.is_taxpayer ?? true) : true;

  const setF = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    // When vendor changes, zero out GST if non-taxpayer
    if (k === 'vendor_code') {
      const vnd = vendors.find(x => x.vendor_code === v);
      if (vnd && !vnd.is_taxpayer) {
        setItems(prev => prev.map(it => ({ ...it, gst_rate: '0', cgst_amount: '0', sgst_amount: '0', igst_amount: '0' })));
      }
    }
  };

  const setItem = (idx, k, v) => setItems(prev => {
    const next = prev.map((it, i) => i === idx ? { ...it, [k]: v } : it);
    if (['quantity', 'rate', 'gst_rate'].includes(k)) {
      const it = next[idx];
      const amt = parseFloat(it.quantity || 0) * parseFloat(it.rate || 0);
      const effectiveRate = vendorIsTaxpayer ? parseFloat(it.gst_rate || 0) : 0;
      const half = (amt * effectiveRate / 100 / 2).toFixed(2);
      next[idx] = { ...next[idx], cgst_amount: half, sgst_amount: half, igst_amount: '0' };
    }
    return next;
  });

  const addItem    = () => setItems(p => [...p, { item_name: '', quantity: '1', rate: '', gst_rate: vendorIsTaxpayer ? '18' : '0', cgst_amount: '0', sgst_amount: '0', igst_amount: '0', hsn_code: '', gl_account_id: '' }]);
  const removeItem = idx => setItems(p => p.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + parseFloat(i.quantity || 0) * parseFloat(i.rate || 0), 0);
  const totalGST = items.reduce((s, i) => s + parseFloat(i.cgst_amount || 0) + parseFloat(i.sgst_amount || 0) + parseFloat(i.igst_amount || 0), 0);
  const total    = subtotal + totalGST;

  const submit = async () => {
    setErr('');
    if (!form.vendor_code || !form.bill_number || !form.bill_date || !form.due_date)
      return setErr('Vendor, Bill No, Bill Date and Due Date are required');
    if (items.some(i => !i.item_name || !i.rate)) return setErr('All items need name and rate');
    if (items.some(i => !i.gl_account_id)) return setErr('Select a GL account for each line item');
    setSaving(true);
    try {
      const r = await api('/api/vendors/bills', { method: 'POST', body: JSON.stringify({ ...form, items }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
    } catch { setErr('Network error'); setSaving(false); }
  };

  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">New Direct Vendor Bill</h2>
            <p className="text-xs text-slate-500 mt-0.5">Direct bill not linked to a PO or GRN</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{err}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Vendor *</label>
              <select value={form.vendor_code} onChange={e => setF('vendor_code', e.target.value)} className={inp}>
                <option value="">Select vendor…</option>
                {vendors.map(v => <option key={v.id} value={v.vendor_code}>{v.vendor_code} — {v.vendor_name}{!v.is_taxpayer ? ' (Non-Taxpayer)' : ''}</option>)}
              </select>
              {form.vendor_code && !vendorIsTaxpayer && (
                <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Non-taxpayer vendor — GST will not be applied on this bill.
                </p>
              )}
            </div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Bill Number *</label>
              <input value={form.bill_number} onChange={e => setF('bill_number', e.target.value)} className={inp} /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <input value={form.notes} onChange={e => setF('notes', e.target.value)} className={inp} /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Bill Date *</label>
              <input type="date" value={form.bill_date} onChange={e => setF('bill_date', e.target.value)} className={inp} /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Due Date *</label>
              <input type="date" value={form.due_date} onChange={e => setF('due_date', e.target.value)} className={inp} /></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.itc_claimable} onChange={e => setF('itc_claimable', e.target.checked)} className="w-4 h-4 rounded text-teal-600" />
            <span className="text-sm font-medium text-slate-700">GST ITC claimable</span>
            <span className="text-xs text-slate-400">— GST posted to ITC (1134) instead of expensed</span>
          </label>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">Line Items</h3>
              <button onClick={addItem} className="text-xs text-teal-600 border border-teal-300 rounded px-2 py-1">+ Add Item</button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-2 text-left">Item Name</th>
                    <th className="px-3 py-2 text-left" style={{minWidth:'180px'}}>GL Account *</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">GST%</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">HSN</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const amt = parseFloat(it.quantity || 0) * parseFloat(it.rate || 0);
                    const gst = parseFloat(it.cgst_amount || 0) + parseFloat(it.sgst_amount || 0);
                    return (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-3 py-2"><input value={it.item_name} onChange={e => setItem(idx, 'item_name', e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500" placeholder="Item name" /></td>
                        <td className="px-3 py-2" style={{minWidth:'180px'}}>
                          <select value={it.gl_account_id || ''} onChange={e => setItem(idx, 'gl_account_id', e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none">
                            <option value="">Select GL…</option>
                            <optgroup label="── Expense Accounts ──">{glAccounts.expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.account_code} {a.account_name}</option>)}</optgroup>
                            <optgroup label="── Asset / Stock Accounts ──">{glAccounts.assetAccounts.map(a => <option key={a.id} value={a.id}>{a.account_code} {a.account_name}</option>)}</optgroup>
                          </select>
                        </td>
                        <td className="px-3 py-2 w-16"><input type="number" min="0.01" step="0.01" value={it.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-right focus:outline-none" /></td>
                        <td className="px-3 py-2 w-24"><input type="number" min="0" step="0.01" value={it.rate} onChange={e => setItem(idx, 'rate', e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-right focus:outline-none" placeholder="0.00" /></td>
                        <td className="px-3 py-2 w-16">
                          {vendorIsTaxpayer ? (
                            <select value={it.gst_rate} onChange={e => setItem(idx, 'gst_rate', e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none">
                              {[0,5,12,18,28].map(r => <option key={r} value={r}>{r}%</option>)}
                            </select>
                          ) : (
                            <div className="text-center text-[10px] text-amber-600 font-medium py-1">0%</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700 w-24">
                          <div>{fmt(amt)}</div>
                          <div className="text-slate-400">+{fmt(gst)}</div>
                        </td>
                        <td className="px-3 py-2 w-20"><input value={it.hsn_code} onChange={e => setItem(idx, 'hsn_code', e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none" placeholder="HSN" /></td>
                        <td className="px-2 py-2">{items.length > 1 && <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-start justify-between">
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500 flex-1 mr-4">
                <span className="font-medium text-slate-600">JE Preview: </span>
                DR Expense/Asset GL(s) {fmt(subtotal)}{form.itc_claimable && totalGST > 0 && <> + DR ITC {fmt(totalGST)}</>} = CR AP {fmt(total)}
              </div>
              <div className="space-y-1 text-right text-sm">
                <div className="text-slate-500">Subtotal: <span className="font-medium">{fmt(subtotal)}</span></div>
                <div className="text-slate-500">GST: <span className="font-medium">{fmt(totalGST)}</span></div>
                <div className="text-base font-bold text-slate-800">Total: {fmt(total)}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-200 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
            {saving ? 'Saving…' : 'Create Bill & Post JE'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Direct Bill Payment Modal ─────────────────────────────────────────────────
function DirectPayModal({ bill, glAccounts, onClose, onSaved }) {
  const amountDue = parseFloat(bill.total_amount) - parseFloat(bill.amount_paid || 0);
  const [form, setForm] = useState({ payment_mode: 'NEFT', amount_paid: amountDue.toFixed(2), payment_date: today(), transaction_reference: '', notes: '', bank_account_id: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const bankAcc = glAccounts.cashAccounts.find(a => a.account_code === '1112');
    if (bankAcc) setForm(f => ({ ...f, bank_account_id: String(bankAcc.id) }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModeChange = mode => {
    set('payment_mode', mode);
    const code = mode === 'CASH' ? '1111' : '1112';
    const acc = glAccounts.cashAccounts.find(a => a.account_code === code);
    if (acc) set('bank_account_id', String(acc.id));
  };

  const submit = async () => {
    setErr('');
    if (!form.amount_paid || parseFloat(form.amount_paid) <= 0) return setErr('Amount must be > 0');
    if (!form.bank_account_id) return setErr('Select a bank/cash account');
    setSaving(true);
    try {
      const r = await api(`/api/vendors/bills/${bill.id}/pay`, { method: 'POST', body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
    } catch { setErr('Network error'); setSaving(false); }
  };

  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Record Payment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{err}</p>}
          <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between text-slate-600"><span>Bill No</span><span className="font-medium">{bill.bill_number}</span></div>
            <div className="flex justify-between text-slate-600"><span>Total</span><span>{fmt(bill.total_amount)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Paid</span><span>{fmt(bill.amount_paid)}</span></div>
            <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-slate-200"><span>Balance Due</span><span>{fmt(amountDue)}</span></div>
          </div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Payment Mode *</label>
            <select value={form.payment_mode} onChange={e => handleModeChange(e.target.value)} className={inp}>
              {PAY_MODES_V.map(m => <option key={m}>{m}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Pay From Account *</label>
            <select value={form.bank_account_id || ''} onChange={e => set('bank_account_id', e.target.value)} className={inp}>
              <option value="">Select account…</option>
              {glAccounts.cashAccounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1">JE: DR AP account → CR this account</p></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Amount *</label>
              <input type="number" min="0.01" step="0.01" value={form.amount_paid} onChange={e => set('amount_paid', e.target.value)} className={inp} /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Payment Date *</label>
              <input type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} className={inp} /></div>
          </div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Transaction Reference</label>
            <input value={form.transaction_reference} onChange={e => set('transaction_reference', e.target.value)} className={inp} placeholder="UTR / Cheque no." /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} className={inp + ' resize-none'} /></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
            {saving ? 'Saving…' : 'Record Payment & Post JE'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vendor Master Sub-tab ─────────────────────────────────────────────────────
function VendorMasterSubTab() {
  const [vendors, setVendors]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null); // null | 'new' | vendor-obj

  const load = useCallback(() => {
    setLoading(true);
    api('/api/vendors').then(r => r.json())
      .then(d => { if (d.success) setVendors(d.vendors || []); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const deactivate = async (id) => {
    if (!window.confirm('Deactivate this vendor?')) return;
    await api(`/api/vendors/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <span className="text-xs text-slate-400">{vendors.length} vendors</span>
        <button onClick={() => setModal('new')}
          className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Vendor
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : vendors.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">No vendors found. Add your first vendor.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">GST Number</th>
                <th className="px-4 py-3 text-left">City / State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id} className="hover:bg-teal-50 border-b border-slate-100 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{v.vendor_code}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{v.vendor_name}</td>
                  <td className="px-4 py-3"><span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{v.vendor_type}</span></td>
                  <td className="px-4 py-3 text-slate-600">{v.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{v.gst_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{v.city}, {v.state}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setModal(v)} className="text-xs font-medium text-teal-600 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50">Edit</button>
                      <button onClick={() => deactivate(v.id)} className="text-xs font-medium text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Deactivate</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <VendorModal
          vendor={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Direct Bills Sub-tab ──────────────────────────────────────────────────────
const DIRECT_BILL_STATUS_CFG = {
  DRAFT:     { label: 'Draft',            bg: '#f1f5f9', color: '#475569' },
  SUBMITTED: { label: 'Pending Approval', bg: '#dbeafe', color: '#1e40af' },
  APPROVED:  { label: 'Approved',         bg: '#dcfce7', color: '#166534' },
  REJECTED:  { label: 'Rejected',         bg: '#fee2e2', color: '#991b1b' },
};

function DirectBillSubTab() {
  const [vendors, setVendors]             = useState([]);
  const [bills, setBills]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [vendorFilter, setVFilter]        = useState('');
  const [statusFilter, setSFilter]        = useState('');
  const [approvalFilter, setAFilter]      = useState('');
  const [glAccounts, setGlAccounts]       = useState({ apAccounts: [], expenseAccounts: [], assetAccounts: [], cashAccounts: [] });
  const [billModal, setBillModal]         = useState(false);
  const [payModal, setPayModal]           = useState(null);
  const [rejectModal, setRejectModal]     = useState(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [actionErr, setActionErr]         = useState('');
  const [actionBusy, setActionBusy]       = useState(null);

  const loadVendors = useCallback(() => {
    api('/api/vendors').then(r => r.json()).then(d => { if (d.success) setVendors(d.vendors || []); });
  }, []);

  const loadGL = useCallback(() => {
    api('/api/vendors/ap-accounts').then(r => r.json()).then(d => { if (d.success) setGlAccounts(d); });
  }, []);

  const loadBills = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (vendorFilter)  p.set('vendor_code', vendorFilter);
    if (statusFilter)  p.set('payment_status', statusFilter);
    if (approvalFilter) p.set('approval_status', approvalFilter);
    p.set('direct_only', 'true');
    api(`/api/vendors/bills?${p}`).then(r => r.json())
      .then(d => { if (d.success) setBills(d.bills || []); })
      .finally(() => setLoading(false));
  }, [vendorFilter, statusFilter, approvalFilter]);

  useEffect(() => { loadVendors(); loadGL(); }, [loadVendors, loadGL]);
  useEffect(() => { loadBills(); }, [loadBills]);

  const doApprovalAction = async (bill, action) => {
    setActionErr(''); setActionBusy(bill.id);
    try {
      const r = await api(`/api/vendors/bills/${bill.id}/${action}`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { setActionErr(d.error || `${action} failed`); }
      else loadBills();
    } catch { setActionErr('Network error'); }
    setActionBusy(null);
  };

  const doReject = async () => {
    if (!rejectReason.trim()) { setActionErr('Rejection reason required'); return; }
    setActionErr(''); setActionBusy(rejectModal.id);
    try {
      const r = await api(`/api/vendors/bills/${rejectModal.id}/reject`, {
        method: 'POST', body: JSON.stringify({ reason: rejectReason }),
      });
      const d = await r.json();
      if (!r.ok) { setActionErr(d.error || 'Rejection failed'); }
      else { setRejectModal(null); setRejectReason(''); loadBills(); }
    } catch { setActionErr('Network error'); }
    setActionBusy(null);
  };

  const totalBilled      = bills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
  const totalPaid        = bills.reduce((s, b) => s + parseFloat(b.amount_paid || 0), 0);
  const totalOutstanding = totalBilled - totalPaid;
  const pendingApproval  = bills.filter(b => b.approval_status === 'SUBMITTED').length;
  const draftCount       = bills.filter(b => b.approval_status === 'DRAFT').length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border-b border-slate-100">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-slate-800">{fmt(totalBilled)}</p>
          <p className="text-xs text-slate-500">Total Billed</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-emerald-700">{fmt(totalPaid)}</p>
          <p className="text-xs text-slate-500">Total Paid</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-amber-700">{fmt(totalOutstanding)}</p>
          <p className="text-xs text-slate-500">Outstanding</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${pendingApproval > 0 ? 'bg-blue-50' : 'bg-slate-50'}`}>
          <p className={`text-lg font-bold ${pendingApproval > 0 ? 'text-blue-700' : 'text-slate-400'}`}>{pendingApproval}</p>
          <p className="text-xs text-slate-500">Pending Approval</p>
          {draftCount > 0 && <p className="text-[10px] text-slate-400">{draftCount} draft</p>}
        </div>
      </div>

      {actionErr && <div className="mx-4 mt-3 px-3 py-2 bg-red-50 text-red-700 text-xs rounded-lg">{actionErr}</div>}

      {/* Filters + New Bill */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
        <select value={vendorFilter} onChange={e => setVFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Vendors</option>
          {vendors.map(v => <option key={v.id} value={v.vendor_code}>{v.vendor_code} — {v.vendor_name}</option>)}
        </select>
        <select value={approvalFilter} onChange={e => setAFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Approval</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Pending Approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <select value={statusFilter} onChange={e => setSFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Pay Status</option>
          <option value="PENDING">Pending</option>
          <option value="PARTIAL">Partial</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button onClick={loadBills} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium">Search</button>
        <button onClick={() => setBillModal(true)}
          className="ml-auto bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Direct Bill
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : bills.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">No direct bills found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Bill No</th>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Bill Date</th>
                <th className="px-4 py-3 text-left">Due Date</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-center">ITC</th>
                <th className="px-4 py-3 text-center">Approval</th>
                <th className="px-4 py-3 text-center">Pay Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => {
                const balance = parseFloat(b.total_amount) - parseFloat(b.amount_paid || 0);
                const overdue = b.payment_status !== 'PAID' && b.approval_status === 'APPROVED' && new Date(b.due_date) < new Date();
                const apvCfg  = DIRECT_BILL_STATUS_CFG[b.approval_status] || DIRECT_BILL_STATUS_CFG.DRAFT;
                const busy    = actionBusy === b.id;
                return (
                  <tr key={b.id} className={`border-b border-slate-100 transition-colors ${overdue ? 'hover:bg-red-50' : 'hover:bg-teal-50'}`}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.bill_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{b.vendor_name}</div>
                      <div className="text-xs text-slate-400">{b.vendor_code}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtD(b.bill_date)}</td>
                    <td className={`px-4 py-3 ${overdue ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
                      {fmtD(b.due_date)}{overdue && <span className="ml-1 text-xs">⚠ Overdue</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(b.total_amount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{fmt(b.amount_paid)}</td>
                    <td className="px-4 py-3 text-right text-amber-700 font-medium">{fmt(balance)}</td>
                    <td className="px-4 py-3 text-center">{b.itc_claimable ? <span className="text-xs text-teal-600 font-medium">Yes</span> : <span className="text-xs text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: apvCfg.bg, color: apvCfg.color }}>{apvCfg.label}</span>
                      {b.approval_status === 'REJECTED' && b.rejection_reason && (
                        <p className="text-[10px] text-red-500 mt-0.5 max-w-[120px] truncate" title={b.rejection_reason}>↩ {b.rejection_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {b.approval_status === 'APPROVED' && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${VB_STATUS_CLS[b.payment_status] || 'bg-slate-100 text-slate-600'}`}>{b.payment_status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* DRAFT: submit for approval */}
                        {b.approval_status === 'DRAFT' && (
                          <button onClick={() => doApprovalAction(b, 'submit')} disabled={busy}
                            className="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg disabled:opacity-50">
                            {busy ? '…' : 'Submit'}
                          </button>
                        )}
                        {/* SUBMITTED: approve or reject */}
                        {b.approval_status === 'SUBMITTED' && (<>
                          <button onClick={() => doApprovalAction(b, 'approve')} disabled={busy}
                            className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded-lg disabled:opacity-50">
                            {busy ? '…' : 'Approve'}
                          </button>
                          <button onClick={() => { setRejectModal(b); setRejectReason(''); setActionErr(''); }} disabled={busy}
                            className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg disabled:opacity-50">
                            Reject
                          </button>
                        </>)}
                        {/* REJECTED: resubmit */}
                        {b.approval_status === 'REJECTED' && (
                          <button onClick={() => doApprovalAction(b, 'resubmit')} disabled={busy}
                            className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-2 py-1 rounded-lg disabled:opacity-50">
                            {busy ? '…' : 'Resubmit'}
                          </button>
                        )}
                        {/* APPROVED: pay if outstanding */}
                        {b.approval_status === 'APPROVED' && ['PENDING','PARTIAL'].includes(b.payment_status) && (
                          <button onClick={() => setPayModal(b)} className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-lg">Pay</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {billModal && <DirectBillModal vendors={vendors} glAccounts={glAccounts} onClose={() => setBillModal(false)} onSaved={() => { setBillModal(false); loadBills(); }} />}
      {payModal  && <DirectPayModal  bill={payModal}  glAccounts={glAccounts} onClose={() => setPayModal(null)}  onSaved={() => { setPayModal(null);  loadBills(); }} />}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-red-600 to-red-500 rounded-t-2xl">
              <h3 className="text-base font-bold text-white">Reject Bill</h3>
              <button onClick={() => setRejectModal(null)} className="text-red-200 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-600">Bill <span className="font-mono font-semibold text-slate-800">{rejectModal.bill_number}</span> — {rejectModal.vendor_name}</p>
              <div>
                <label className={labelCls}>Rejection Reason <span className="text-red-500">*</span></label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  rows={3} className={`${inputCls} w-full`} placeholder="Explain why this bill is being rejected…" />
              </div>
              {actionErr && <p className="text-xs text-red-600">{actionErr}</p>}
              <div className="flex justify-end gap-3">
                <button onClick={() => setRejectModal(null)} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold">Cancel</button>
                <button onClick={doReject} disabled={!!actionBusy} className="px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-60">
                  {actionBusy ? 'Rejecting…' : 'Reject Bill'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountsPayableTab() {
  const [subTab, setSubTab] = useState('bills');

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {[['vendors','Vendor Master'],['bills','GRN Bills'],['direct','Direct Bills'],['payments','Payments'],['aging','AP Aging'],['telerad','Reporter Billing']].map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)}
            className={`px-5 py-2 text-sm font-semibold rounded-xl transition-colors border
              ${subTab === k
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {l}
          </button>
        ))}
      </div>
      {subTab === 'vendors'  && <VendorMasterSubTab />}
      {subTab === 'bills'    && <BillsSubTab onSwitchToPayments={() => setSubTab('payments')} />}
      {subTab === 'direct'   && <DirectBillSubTab />}
      {subTab === 'payments' && <PaymentsTab />}
      {subTab === 'aging'    && <APAgingTab />}
      {subTab === 'telerad'  && <TeleRadBillingSubTab />}
    </div>
  );
}

const TABS = [
  { key: 'overview',     label: 'Overview',          icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'accounts',     label: 'Chart of Accounts', icon: 'M4 6h16M4 10h16M4 14h16M4 18h7' },
  { key: 'journals',     label: 'Journal Entries',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key: 'trial-balance',label: 'Trial Balance',     icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { key: 'pl',           label: 'P&L',               icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v16H4z' },
  { key: 'balance-sheet',label: 'Balance Sheet',     icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3' },
  { key: 'gst',          label: 'GST',               icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
  { key: 'rcm',          label: 'RCM Liability',     icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  { key: 'bank-accounts',label: 'Bank & Cards',       icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { key: 'bank-recon',   label: 'Bank Recon',        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { key: 'depreciation', label: 'Depreciation',      icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6' },
  { key: 'reports',      label: 'More Reports',      icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { key: 'contracts',       label: 'Center Contracts',    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'reporting-payouts', label: 'Reporting Payouts', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { key: 'study-costs',      label: 'Study Cost Analysis', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { key: 'ap',               label: 'Accounts Payable',    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { key: 'fin-settings',    label: 'Finance Settings',    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

// ── Reporting Payouts Tab ──────────────────────────────────────────────────────
function ReportingPayoutsTab({ centerId = '' }) {
  const [payouts, setPayouts]   = useState([]);
  const [totals, setTotals]     = useState({ total_amount: 0, total_pending: 0, total_paid: 0 });
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('');

  const token = () => localStorage.getItem('token');
  const hdrs  = () => ({ Authorization: `Bearer ${token()}` });
  const fmtINR = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v || 0);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB') : '—';

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter)   p.set('status', filter);
    if (centerId) p.set('center_id', centerId);
    const qs = p.toString() ? `?${p}` : '';
    fetch(`/api/rad-reporting/payouts${qs}`, { headers: hdrs() })
      .then(r => r.json())
      .then(d => { if (d.success) { setPayouts(d.payouts); setTotals(d.totals); } })
      .finally(() => setLoading(false));
  }, [filter, centerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const STATUS_BADGE = {
    PENDING: 'bg-amber-100 text-amber-700',
    PAID:    'bg-emerald-100 text-emerald-700',
    PARTIAL: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-500 mb-1">Total Billed</p>
          <p className="text-2xl font-bold text-slate-800">{fmtINR(totals.total_amount)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-500 mb-1">Pending Payout</p>
          <p className="text-2xl font-bold text-amber-600">{fmtINR(totals.total_pending)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-500 mb-1">Total Paid</p>
          <p className="text-2xl font-bold text-emerald-600">{fmtINR(totals.total_paid)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">Reporter AP Bills</h2>
          <div className="flex gap-2">
            {['', 'PENDING', 'PAID'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  filter === s ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Loading…</div>
        ) : payouts.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">No reporter bills found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Bill #</th>
                  <th className="px-4 py-3 text-left">Reporter</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Due</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-teal-700">{p.payable_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{p.reporter_name ? (p.reporter_type === 'TELERADIOLOGY' ? p.reporter_name : `Dr. ${p.reporter_name}`) : '—'}</div>
                      {p.reporter_code && <div className="text-xs text-slate-400">{p.reporter_code}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {p.reporter_type && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.reporter_type === 'TELERADIOLOGY' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                        }`}>
                          {p.reporter_type === 'TELERADIOLOGY' ? 'Teleradiology' : 'Radiologist'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate" title={p.notes}>
                      {p.notes?.split('|')[1]?.trim() || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(p.due_date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtINR(p.amount)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{fmtINR(p.balance_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status] || 'bg-slate-100 text-slate-600'}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Study Cost Analysis Tab ────────────────────────────────────────────────────
// Modality colour palette (MRI, CT, X-Ray, Ultrasound, etc.)
const MODALITY_COLORS = {
  MRI:        { bg: '#ede9fe', text: '#5b21b6', bar: '#7c3aed' },
  CT:         { bg: '#dbeafe', text: '#1e40af', bar: '#2563eb' },
  'X-RAY':    { bg: '#fef3c7', text: '#92400e', bar: '#f59e0b' },
  XRAY:       { bg: '#fef3c7', text: '#92400e', bar: '#f59e0b' },
  ULTRASOUND: { bg: '#d1fae5', text: '#065f46', bar: '#10b981' },
  USG:        { bg: '#d1fae5', text: '#065f46', bar: '#10b981' },
  MAMMOGRAPHY:{ bg: '#fce7f3', text: '#831843', bar: '#ec4899' },
  PET:        { bg: '#ffedd5', text: '#7c2d12', bar: '#f97316' },
  DEXA:       { bg: '#e0f2fe', text: '#0c4a6e', bar: '#0284c7' },
  FLUOROSCOPY:{ bg: '#f0fdf4', text: '#14532d', bar: '#16a34a' },
};
const modalityColor = m => MODALITY_COLORS[(m || '').toUpperCase()] || { bg: '#f1f5f9', text: '#475569', bar: '#64748b' };

function StudyCostAnalysisTab({ centerId = '' }) {
  const [rows, setRows]       = useState([]);
  const [totals, setTotals]   = useState({ total_revenue: 0, total_consumables: 0, total_reporter: 0, total_margin: 0 });
  const [loading, setLoading] = useState(true);
  const [from, setFrom]       = useState(fyStart());
  const [to, setTo]           = useState(today());
  const [search, setSearch]   = useState('');
  const [view, setView]       = useState('rollup');   // 'rollup' | 'detail'

  const fmtINR  = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ from, to });
    if (centerId) p.set('center_id', centerId);
    fetch(`/api/rad-reporting/study-costs?${p}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => r.json())
      .then(d => { if (d.success) { setRows(d.studies); setTotals(d.totals); } })
      .finally(() => setLoading(false));
  }, [from, to, centerId]);

  useEffect(() => { load(); }, [load]);

  // ── Modality rollup (client-side aggregation) ──────────────────────────────
  const modalityRollup = useMemo(() => {
    const map = {};
    for (const r of rows) {
      const m = (r.modality || 'Unknown').toUpperCase();
      if (!map[m]) map[m] = { modality: m, count: 0, revenue: 0, consumables: 0, reporter: 0, margin: 0 };
      map[m].count        += 1;
      map[m].revenue      += parseFloat(r.net_revenue      || 0);
      map[m].consumables  += parseFloat(r.consumables_cost || 0);
      map[m].reporter     += parseFloat(r.reporter_cost    || 0);
      map[m].margin       += parseFloat(r.gross_margin     || 0);
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  const filtered = search.trim()
    ? rows.filter(r => [r.patient_name, r.bill_number, r.study_name, r.modality, r.reporter_name]
        .some(f => (f || '').toLowerCase().includes(search.toLowerCase())))
    : rows;

  const marginColor = pct => pct >= 60 ? 'text-emerald-600' : pct >= 30 ? 'text-amber-600' : 'text-red-600';
  const marginBg    = pct => pct >= 60 ? 'bg-emerald-500' : pct >= 30 ? 'bg-amber-500' : 'bg-red-500';
  const overallMarginPct = totals.total_revenue > 0
    ? ((totals.total_margin / totals.total_revenue) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase font-semibold">Total Revenue</p>
          <p className="text-xl font-bold text-teal-700 mt-1">{fmtINR(totals.total_revenue)}</p>
          <p className="text-xs text-slate-400 mt-1">{rows.length} studies · {modalityRollup.length} modalities</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase font-semibold">Consumables Cost</p>
          <p className="text-xl font-bold text-orange-600 mt-1">{fmtINR(totals.total_consumables)}</p>
          <p className="text-xs text-slate-400 mt-1">
            {totals.total_revenue > 0 ? ((totals.total_consumables / totals.total_revenue) * 100).toFixed(1) : 0}% of revenue
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase font-semibold">Reporter Cost</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{fmtINR(totals.total_reporter)}</p>
          <p className="text-xs text-slate-400 mt-1">
            {totals.total_revenue > 0 ? ((totals.total_reporter / totals.total_revenue) * 100).toFixed(1) : 0}% of revenue
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase font-semibold">Gross Margin</p>
          <p className={`text-xl font-bold mt-1 ${marginColor(parseFloat(overallMarginPct))}`}>{fmtINR(totals.total_margin)}</p>
          <p className="text-xs text-slate-400 mt-1">{overallMarginPct}% margin</p>
        </div>
      </div>

      {/* Filters + view toggle */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <button onClick={load} className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700">Apply</button>

          {/* View toggle */}
          <div className="ml-auto flex gap-1 bg-slate-100 rounded-xl p-1">
            {[['rollup','Modality Rollup'],['detail','Study Detail']].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors
                  ${view === k ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <Spin /> : view === 'rollup' ? (

        /* ── MODALITY ROLLUP VIEW ── */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
            <h2 className="font-bold text-slate-800 text-sm">Cost & Margin by Modality</h2>
            <span className="text-xs text-slate-400">{from} → {to}</span>
          </div>
          {modalityRollup.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">No data for this period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">Modality</th>
                    <th className="px-4 py-3 text-right">Studies</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Consumables</th>
                    <th className="px-4 py-3 text-right">Reporter Fee</th>
                    <th className="px-4 py-3 text-right">Total Cost</th>
                    <th className="px-4 py-3 text-right">Gross Margin</th>
                    <th className="px-5 py-3 text-left w-40">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {modalityRollup.map(m => {
                    const totalCost  = m.consumables + m.reporter;
                    const marginPct  = m.revenue > 0 ? (m.margin / m.revenue * 100) : 0;
                    const clr        = modalityColor(m.modality);
                    const revShare   = totals.total_revenue > 0 ? (m.revenue / totals.total_revenue * 100).toFixed(1) : 0;
                    return (
                      <tr key={m.modality} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3.5">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold"
                            style={{ background: clr.bg, color: clr.text }}>
                            {m.modality}
                          </span>
                          <span className="ml-2 text-xs text-slate-400">{revShare}% of revenue</span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-slate-700">{m.count}</td>
                        <td className="px-4 py-3.5 text-right font-semibold text-slate-800">{fmtINR(m.revenue)}</td>
                        <td className="px-4 py-3.5 text-right text-orange-600">{fmtINR(m.consumables)}</td>
                        <td className="px-4 py-3.5 text-right text-purple-600">{fmtINR(m.reporter)}</td>
                        <td className="px-4 py-3.5 text-right text-red-600 font-medium">{fmtINR(totalCost)}</td>
                        <td className={`px-4 py-3.5 text-right font-bold ${marginColor(marginPct)}`}>{fmtINR(m.margin)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className={`h-2 rounded-full ${marginBg(marginPct)}`}
                                style={{ width: `${Math.min(Math.max(marginPct, 0), 100)}%` }} />
                            </div>
                            <span className={`text-xs font-bold w-10 text-right ${marginColor(marginPct)}`}>
                              {marginPct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-teal-50 font-semibold text-sm border-t-2 border-teal-200">
                    <td className="px-5 py-3 text-teal-800">Total</td>
                    <td className="px-4 py-3 text-right text-teal-800">{rows.length}</td>
                    <td className="px-4 py-3 text-right text-teal-700">{fmtINR(totals.total_revenue)}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{fmtINR(totals.total_consumables)}</td>
                    <td className="px-4 py-3 text-right text-purple-600">{fmtINR(totals.total_reporter)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{fmtINR(totals.total_consumables + totals.total_reporter)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${marginColor(parseFloat(overallMarginPct))}`}>{fmtINR(totals.total_margin)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-teal-100 rounded-full h-2 overflow-hidden">
                          <div className={`h-2 rounded-full ${marginBg(parseFloat(overallMarginPct))}`}
                            style={{ width: `${Math.min(Math.max(parseFloat(overallMarginPct), 0), 100)}%` }} />
                        </div>
                        <span className={`text-xs font-bold w-10 text-right ${marginColor(parseFloat(overallMarginPct))}`}>
                          {overallMarginPct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

      ) : (

        /* ── STUDY DETAIL VIEW ── */
        <div className="space-y-3">
          {/* Search bar */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search patient, study, modality, reporter…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">No studies found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Bill #</th>
                      <th className="px-4 py-3 text-left">Patient</th>
                      <th className="px-4 py-3 text-left">Study</th>
                      <th className="px-4 py-3 text-left">Reporter</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                      <th className="px-4 py-3 text-right">Consumables</th>
                      <th className="px-4 py-3 text-right">Reporter Fee</th>
                      <th className="px-4 py-3 text-right">Gross Margin</th>
                      <th className="px-4 py-3 text-right">Margin %</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(r => {
                      const margin    = parseFloat(r.gross_margin || 0);
                      const marginPct = parseFloat(r.margin_pct || 0);
                      const clr       = modalityColor(r.modality);
                      return (
                        <tr key={r.bill_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(r.bill_date)}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{r.bill_number}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{r.patient_name}</div>
                            {r.patient_phone && <div className="text-xs text-slate-400">{r.patient_phone}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-700">{r.study_name}</div>
                            {r.modality && (
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                                style={{ background: clr.bg, color: clr.text }}>{r.modality}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{r.reporter_name || '—'}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-700">{fmtINR(r.net_revenue)}</td>
                          <td className="px-4 py-3 text-right text-orange-600">{fmtINR(r.consumables_cost)}</td>
                          <td className="px-4 py-3 text-right text-purple-600">{fmtINR(r.reporter_cost)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${marginColor(marginPct)}`}>{fmtINR(margin)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div className={`h-1.5 rounded-full ${marginBg(marginPct)}`}
                                  style={{ width: `${Math.min(Math.max(marginPct, 0), 100)}%` }} />
                              </div>
                              <span className={`text-xs font-bold ${marginColor(marginPct)}`}>{marginPct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              r.exam_status === 'REPORT_COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                              r.exam_status === 'EXAM_COMPLETED'   ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'}`}>
                              {r.exam_status === 'REPORT_COMPLETED' ? 'Reported' :
                               r.exam_status === 'EXAM_COMPLETED'   ? 'Exam Done' : 'Scheduled'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold text-sm border-t-2 border-slate-200">
                      <td colSpan={5} className="px-4 py-3 text-slate-600">Total ({filtered.length} studies)</td>
                      <td className="px-4 py-3 text-right text-teal-700">{fmtINR(filtered.reduce((s,r) => s + parseFloat(r.net_revenue||0), 0))}</td>
                      <td className="px-4 py-3 text-right text-orange-600">{fmtINR(filtered.reduce((s,r) => s + parseFloat(r.consumables_cost||0), 0))}</td>
                      <td className="px-4 py-3 text-right text-purple-600">{fmtINR(filtered.reduce((s,r) => s + parseFloat(r.reporter_cost||0), 0))}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{fmtINR(filtered.reduce((s,r) => s + parseFloat(r.gross_margin||0), 0))}</td>
                      <td colSpan={2} className="px-4 py-3 text-right text-slate-500">
                        {(() => {
                          const rev = filtered.reduce((s,r) => s + parseFloat(r.net_revenue||0), 0);
                          const mar = filtered.reduce((s,r) => s + parseFloat(r.gross_margin||0), 0);
                          return rev > 0 ? `${((mar/rev)*100).toFixed(1)}% avg` : '—';
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Finance() {
  const [tab, setTab]           = useState('overview');
  const [centerId, setCenterId] = useState('');   // '' = all centers (Feenixtech consolidated)
  const [centers, setCenters]   = useState([]);

  useEffect(() => {
    api('/api/centers').then(r => r.json()).then(d => {
      setCenters(Array.isArray(d) ? d : (d.centers || []));
    }).catch(() => {});
  }, []);

  const selectedCenterName = centerId
    ? (centers.find(c => String(c.id) === String(centerId))?.name || 'Center')
    : 'All Centers';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-0"
        style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f766e 60%,#0d9488 100%)' }}>
        <div className="max-w-screen-xl mx-auto">

          {/* Title row + Entity/Center selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Finance</h1>
                <p className="text-teal-200 text-xs sm:text-sm mt-0.5">
                  Feenixtech &nbsp;·&nbsp;
                  <span className="text-white font-semibold">{selectedCenterName}</span>
                </p>
              </div>
            </div>

            {/* Entity / Center selector */}
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-teal-200 flex-shrink-0 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <select
                value={centerId}
                onChange={e => setCenterId(e.target.value)}
                className="w-full sm:w-auto bg-white/15 text-white border border-white/30 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white/40 sm:min-w-[200px] cursor-pointer"
              >
                <option value="" style={{ color: '#1e3a5f', background: 'white', fontWeight: 700 }}>
                  Feenixtech — All Centers
                </option>
                {centers.filter(c => c.active !== false).map(c => (
                  <option key={c.id} value={c.id} style={{ color: '#1e3a5f', background: 'white' }}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: 'none' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap flex-shrink-0"
                style={tab === t.key
                  ? { background: '#f8fafc', color: '#0d9488' }
                  : { background: 'transparent', color: 'rgba(255,255,255,0.75)' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {tab === 'overview'      && <OverviewTab      centerId={centerId} centerName={selectedCenterName} />}
        {tab === 'accounts'      && <AccountsTab />}
        {tab === 'journals'      && <JournalsTab      centerId={centerId} centerName={selectedCenterName} />}
        {tab === 'trial-balance' && <TrialBalanceTab  centerId={centerId} centerName={selectedCenterName} />}
        {tab === 'pl'            && <ProfitLossTab    centerId={centerId} centerName={selectedCenterName} />}
        {tab === 'balance-sheet' && <BalanceSheetTab  centerId={centerId} centerName={selectedCenterName} />}
        {tab === 'gst'           && <GSTReconciliationTab centerId={centerId} />}
        {tab === 'rcm'           && <RCMLiabilityTab />}
        {tab === 'bank-accounts' && <BankAccountsTab />}
        {tab === 'bank-recon'    && <BankReconciliationTab />}
        {tab === 'depreciation'  && <AssetDepreciationTab centerId={centerId} />}
        {tab === 'reports'       && <ReportsTab centerId={centerId} centerName={selectedCenterName} />}
        {tab === 'contracts'          && <CenterContractsTab centerId={centerId} centerName={selectedCenterName} />}
        {tab === 'reporting-payouts'  && <ReportingPayoutsTab centerId={centerId} />}
        {tab === 'study-costs'        && <StudyCostAnalysisTab centerId={centerId} />}
        {tab === 'ap'                  && <AccountsPayableTab />}
        {tab === 'fin-settings'        && <FinanceSettingsTab />}
      </div>
    </div>
  );
}
