import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

const API = '/api';
const authH = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TYPE_META = {
  CAPITAL_CONTRIBUTION:    { label: 'Capital Contribution',    color: 'teal',   badge: 'bg-teal-50 text-teal-700 border-teal-200',   icon: '↑' },
  CAPITAL_RESERVE:         { label: 'Capital Reserve',         color: 'blue',   badge: 'bg-blue-50 text-blue-700 border-blue-200',   icon: '↑' },
  DRAWING:                 { label: 'Drawing / Distribution',  color: 'amber',  badge: 'bg-amber-50 text-amber-700 border-amber-200',icon: '↓' },
  DIRECTOR_LOAN_IN:        { label: 'Director Loan (In)',      color: 'purple', badge: 'bg-purple-50 text-purple-700 border-purple-200', icon: '↑' },
  DIRECTOR_LOAN_REPAYMENT: { label: 'Loan Repayment',          color: 'rose',   badge: 'bg-rose-50 text-rose-700 border-rose-200',   icon: '↓' },
};

const PAYMENT_MODES = ['BANK_TRANSFER','NEFT','RTGS','CHEQUE','CASH','UPI'];

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, accent, icon }) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-start gap-4">
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
      <span className="text-lg">{icon}</span>
    </div>
    <div className="min-w-0">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-slate-800 mt-0.5 truncate">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Form Field ────────────────────────────────────────────────────────────────
const Field = ({ label, required, children, error }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1">
      {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="text-rose-500 text-xs mt-1">{error}</p>}
  </div>
);

const inputCls = 'w-full text-sm rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-50 transition-all';
const selectCls = inputCls;

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Equity() {
  const [summary,      setSummary]      = useState({});
  const [partners,     setPartners]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [total,        setTotal]        = useState(0);
  const [directors,    setDirectors]    = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [activeTab,    setActiveTab]    = useState('overview'); // overview | history

  // Filters
  const [filterDirector, setFilterDirector] = useState('');
  const [filterType,     setFilterType]     = useState('');
  const [filterFrom,     setFilterFrom]     = useState('');
  const [filterTo,       setFilterTo]       = useState('');

  // Form
  const EMPTY_FORM = {
    director_id: '', transaction_type: 'CAPITAL_CONTRIBUTION',
    amount: '', transaction_date: new Date().toLocaleDateString('en-CA'),
    payment_mode: 'BANK_TRANSFER', bank_reference: '',
    bank_account_id: '',
    notes: '',
  };
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  // ── Load reference data ─────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`${API}/equity/directors`,          { headers: authH() }).then(r => r.json()),
      fetch(`${API}/finance/accounts?flat=true`, { headers: authH() }).then(r => r.json()),
    ]).then(([dRes, aRes]) => {
      setDirectors(dRes.directors || []);
      const allAccounts = aRes.accounts || [];
      // Only leaf bank/cash accounts (exclude parent groups like 1100, 1000)
      setBankAccounts(allAccounts.filter(a =>
        a.account_type === 'BALANCE_SHEET' &&
        (a.account_code.startsWith('111') || a.account_code.startsWith('112') ||
         a.account_code === '1100' && !allAccounts.some(b => b.parent_account_id === a.id))
      ));
    }).catch(() => toast.error('Failed to load directors or accounts'));
  }, []);

  // ── Load summary + transactions ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDirector) params.set('director_id', filterDirector);
      if (filterType)     params.set('type', filterType);
      if (filterFrom)     params.set('from', filterFrom);
      if (filterTo)       params.set('to', filterTo);

      const [sRes, tRes] = await Promise.all([
        fetch(`${API}/equity/summary`, { headers: authH() }).then(r => r.json()),
        fetch(`${API}/equity/transactions?${params}`, { headers: authH() }).then(r => r.json()),
      ]);

      setSummary(sRes.summary || {});
      setPartners(sRes.partners || []);
      setTransactions(tRes.transactions || []);
      setTotal(tRes.total || 0);
    } catch {
      toast.error('Failed to load equity data');
    } finally {
      setLoading(false);
    }
  }, [filterDirector, filterType, filterFrom, filterTo]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Form handlers ───────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.director_id)      e.director_id      = 'Select a director/partner';
    if (!form.transaction_type) e.transaction_type  = 'Select transaction type';
    if (!form.amount || parseFloat(form.amount) <= 0) e.amount = 'Enter a valid amount';
    if (!form.transaction_date) e.transaction_date  = 'Date is required';
    if (!form.bank_account_id)  e.bank_account_id   = 'Select bank/cash account';

    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const res  = await fetch(`${API}/equity/transactions`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(`${TYPE_META[form.transaction_type]?.label} recorded — JE ${data.je_number}`);
      setShowModal(false);
      setForm(EMPTY_FORM);
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Derived display ─────────────────────────────────────────────────────
  const s = summary;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Equity Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track partner capital contributions, drawings, and director loans
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all"
          style={{ background: 'linear-gradient(135deg,#0a3d3a,#0d9488)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Equity Entry
        </button>
      </div>

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Capital Invested"
          value={fmt(s.total_capital)}
          sub="Partners' contributions (COA 3100 + 3400)"
          accent="bg-teal-50 text-teal-600"
          icon="💰" />
        <StatCard
          label="Total Drawings"
          value={fmt(s.total_drawings)}
          sub="Distributions to partners (COA 3500)"
          accent="bg-amber-50 text-amber-600"
          icon="📤" />
        <StatCard
          label="Net Equity"
          value={fmt((s.total_capital || 0) - (s.total_drawings || 0))}
          sub="Capital less distributions"
          accent="bg-emerald-50 text-emerald-600"
          icon="📊" />
        <StatCard
          label="Director Loans Outstanding"
          value={fmt((s.total_loan_in || 0) - (s.total_loan_repaid || 0))}
          sub="Net director loans (COA 2230)"
          accent="bg-purple-50 text-purple-600"
          icon="🏦" />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[['overview','Partner Overview'],['history','Transaction History']].map(([key,label]) => (
          <button key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === key
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PARTNER OVERVIEW TAB                                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Equity Register — Partners & Directors</h2>
            <span className="text-xs text-slate-400">{fmtD(new Date())}</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">Loading…</div>
          ) : !partners.length ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-slate-500 font-medium">No equity transactions yet</p>
              <p className="text-slate-400 text-sm mt-1">Record the first capital contribution to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-semibold">Partner / Director</th>
                    <th className="text-right px-4 py-3 font-semibold">Capital Invested</th>
                    <th className="text-right px-4 py-3 font-semibold">Drawings</th>
                    <th className="text-right px-4 py-3 font-semibold">Net Equity</th>
                    <th className="text-right px-4 py-3 font-semibold">Director Loans</th>
                    <th className="text-right px-4 py-3 font-semibold">% Stake</th>
                    <th className="text-right px-4 py-3 font-semibold">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {partners.map(p => (
                    <tr key={p.director_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm flex-shrink-0">
                            {p.director_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{p.director_name}</p>
                            <p className="text-xs text-slate-400">{p.designation || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-teal-700">{fmt(p.total_capital)}</td>
                      <td className="px-4 py-4 text-right text-amber-600">{fmt(p.total_drawings)}</td>
                      <td className="px-4 py-4 text-right">
                        <span className={`font-bold ${p.net_equity >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmt(p.net_equity)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-purple-600">{fmt(p.net_loan_owed)}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5">
                            <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${Math.min(parseFloat(p.stake_pct), 100)}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-600">{p.stake_pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right text-xs text-slate-400">{fmtD(p.last_txn_date)}</td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr className="bg-teal-50 border-t-2 border-teal-100 font-bold text-sm">
                    <td className="px-6 py-3 text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-teal-700">{fmt(s.total_capital)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{fmt(s.total_drawings)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{fmt(s.net_equity)}</td>
                    <td className="px-4 py-3 text-right text-purple-600">{fmt(s.net_loan_owed)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">100.00%</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TRANSACTION HISTORY TAB                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-36">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Partner</label>
              <select value={filterDirector} onChange={e => setFilterDirector(e.target.value)} className={selectCls}>
                <option value="">All partners</option>
                {directors.map(d => <option key={d.id} value={d.id}>{d.director_name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-44">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selectCls}>
                <option value="">All types</option>
                {Object.entries(TYPE_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">From</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">To</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className={inputCls} />
            </div>
            <button onClick={loadData} className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors">
              Search
            </button>
            <button onClick={() => { setFilterDirector(''); setFilterType(''); setFilterFrom(''); setFilterTo(''); }}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors">
              Clear
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Transactions</h2>
              <span className="text-xs text-slate-400">{total} records</span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading…</div>
            ) : !transactions.length ? (
              <div className="p-12 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-slate-500">No transactions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                      <th className="text-left px-6 py-3 font-semibold">Ref No</th>
                      <th className="text-left px-4 py-3 font-semibold">Date</th>
                      <th className="text-left px-4 py-3 font-semibold">Partner</th>
                      <th className="text-left px-4 py-3 font-semibold">Type</th>
                      <th className="text-right px-4 py-3 font-semibold">Amount</th>
                      <th className="text-left px-4 py-3 font-semibold">Bank Account</th>
                      <th className="text-left px-4 py-3 font-semibold">Equity A/C</th>
                      <th className="text-left px-4 py-3 font-semibold">Payment</th>
                      <th className="text-left px-4 py-3 font-semibold">JE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {transactions.map(t => {
                      const meta = TYPE_META[t.transaction_type] || {};
                      const isCredit = ['CAPITAL_CONTRIBUTION','CAPITAL_RESERVE','DIRECTOR_LOAN_IN'].includes(t.transaction_type);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3">
                            <span className="font-mono text-xs font-semibold text-slate-600">{t.transaction_no}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{fmtD(t.transaction_date)}</td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-800">{t.director_name || '—'}</span>
                            {t.designation && <p className="text-xs text-slate-400">{t.designation}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${meta.badge}`}>
                              {meta.icon} {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold ${isCredit ? 'text-teal-700' : 'text-amber-600'}`}>
                              {isCredit ? '+' : '−'}{fmt(t.amount)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {t.bank_account_code && <span className="font-mono">{t.bank_account_code}</span>}
                            {t.bank_account_name && <span className="ml-1 text-slate-400">· {t.bank_account_name}</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {t.equity_account_code && <span className="font-mono">{t.equity_account_code}</span>}
                            {t.equity_account_name && <span className="ml-1 text-slate-400">· {t.equity_account_name}</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {t.payment_mode && (
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">{t.payment_mode}</span>
                            )}
                            {t.bank_reference && <p className="text-slate-400 mt-0.5 font-mono">{t.bank_reference}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {t.je_number && (
                              <span className="font-mono text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-lg border border-teal-100">
                                {t.je_number}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ADD TRANSACTION MODAL                                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">

            {/* Modal header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="text-base font-bold text-slate-800">New Equity Entry</h2>
                <p className="text-xs text-slate-400 mt-0.5">Auto-posts to the correct COA on save</p>
              </div>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setErrors({}); }}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              {/* Transaction type — visual selector */}
              <Field label="Transaction Type" required error={errors.transaction_type}>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(TYPE_META).map(([key, meta]) => (
                    <label key={key}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        form.transaction_type === key
                          ? 'border-teal-400 bg-teal-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <input type="radio" name="transaction_type" value={key}
                        checked={form.transaction_type === key} onChange={handleChange}
                        className="accent-teal-600" />
                      <span className={`text-lg ${meta.badge.includes('teal') ? 'text-teal-600' : ''}`}>{meta.icon}</span>
                      <div>
                        <p className={`text-sm font-semibold ${form.transaction_type === key ? 'text-teal-700' : 'text-slate-700'}`}>
                          {meta.label}
                        </p>
                        <p className="text-xs text-slate-400">
                          {key === 'CAPITAL_CONTRIBUTION'    && 'DR Bank → CR 3100 Partners\' Capital'}
                          {key === 'CAPITAL_RESERVE'         && 'DR Bank → CR 3400 Capital Reserve'}
                          {key === 'DRAWING'                 && 'DR 3500 Drawings → CR Bank'}
                          {key === 'DIRECTOR_LOAN_IN'        && 'DR Bank → CR 2230 Director Loans'}
                          {key === 'DIRECTOR_LOAN_REPAYMENT' && 'DR 2230 Director Loans → CR Bank'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </Field>

              {/* Partner */}
              <Field label="Partner / Director" required error={errors.director_id}>
                <select name="director_id" value={form.director_id} onChange={handleChange} className={selectCls}>
                  <option value="">Select partner…</option>
                  {directors.map(d => (
                    <option key={d.id} value={d.id}>{d.director_name}{d.designation ? ` — ${d.designation}` : ''}</option>
                  ))}
                </select>
                {!directors.length && (
                  <p className="text-xs text-amber-600 mt-1">
                    No directors found. Add them in Settings → Company Info.
                  </p>
                )}
              </Field>

              {/* Amount + Date in a row */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount (₹)" required error={errors.amount}>
                  <input type="number" name="amount" min="1" step="0.01"
                    value={form.amount} onChange={handleChange}
                    placeholder="0.00" className={inputCls} />
                </Field>
                <Field label="Date" required error={errors.transaction_date}>
                  <input type="date" name="transaction_date"
                    value={form.transaction_date} onChange={handleChange}
                    className={inputCls} />
                </Field>
              </div>

              {/* Bank/Cash account */}
              <Field label="Bank / Cash Account" required error={errors.bank_account_id}>
                <select name="bank_account_id" value={form.bank_account_id} onChange={handleChange} className={selectCls}>
                  <option value="">Select account…</option>
                  {bankAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
                  ))}
                </select>
              </Field>


              {/* Payment mode + Reference */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Payment Mode">
                  <select name="payment_mode" value={form.payment_mode} onChange={handleChange} className={selectCls}>
                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Cheque / UTR / Reference">
                  <input type="text" name="bank_reference" value={form.bank_reference} onChange={handleChange}
                    placeholder="UTR / Cheque no." className={inputCls} />
                </Field>
              </div>

              {/* Notes */}
              <Field label="Notes">
                <textarea name="notes" value={form.notes} onChange={handleChange} rows={2}
                  placeholder="Optional remarks…"
                  className={`${inputCls} resize-none`} />
              </Field>

              {/* JE preview */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
                <p className="font-semibold text-slate-600 mb-2">Journal Entry Preview</p>
                {(() => {
                  const bankName = bankAccounts.find(a => a.id === parseInt(form.bank_account_id))?.account_name || 'Bank / Cash A/C';
                  const equityLabel = { CAPITAL_CONTRIBUTION:'3100 Partners\' Capital', CAPITAL_RESERVE:'3400 Capital Reserve', DRAWING:'3500 Drawings', DIRECTOR_LOAN_IN:'2230 Director Loans', DIRECTOR_LOAN_REPAYMENT:'2230 Director Loans' }[form.transaction_type] || 'Equity A/C';
                  const isDebitBank = !['DRAWING','DIRECTOR_LOAN_REPAYMENT'].includes(form.transaction_type);
                  return (<>
                    <div className="flex justify-between text-slate-500">
                      <span>DR {isDebitBank ? bankName : equityLabel}</span>
                      <span className="font-semibold text-slate-700">{form.amount ? fmt(parseFloat(form.amount) || 0) : '—'}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 mt-1">
                      <span className="pl-4">CR {isDebitBank ? equityLabel : bankName}</span>
                      <span className="font-semibold text-slate-700">{form.amount ? fmt(parseFloat(form.amount) || 0) : '—'}</span>
                    </div>
                  </>);
                })()}
                <p className="text-slate-400 mt-2">Status: <span className="text-emerald-600 font-semibold">Auto-POSTED</span></p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button type="button"
                  onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setErrors({}); }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#0a3d3a,#0d9488)', boxShadow: '0 4px 14px rgba(13,148,136,0.3)' }}>
                  {saving ? 'Posting…' : 'Post Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
