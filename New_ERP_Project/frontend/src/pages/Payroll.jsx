import { useState, useEffect, useCallback } from 'react';
import { getPermissions } from '../utils/permissions';

const AUTH_HEADER = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const api = (url, opts = {}) => fetch(url, { headers: AUTH_HEADER(), ...opts });

const fmt = (v) =>
  v != null ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const CATEGORY_COLORS = {
  MEDICAL:     'bg-blue-100 text-blue-700',
  TECHNICAL:   'bg-cyan-100 text-cyan-700',
  NURSING:     'bg-teal-100 text-teal-700',
  LABORATORY:  'bg-violet-100 text-violet-700',
  ADMIN:       'bg-amber-100 text-amber-700',
  ACCOUNTS:    'bg-orange-100 text-orange-700',
  RECEPTION:   'bg-pink-100 text-pink-700',
  SUPPORT:     'bg-slate-100 text-slate-700',
  MAINTENANCE: 'bg-gray-100 text-gray-700',
  HOUSEKEEPING:'bg-stone-100 text-stone-700',
};

const catBadge = (cat) =>
  CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-600';

// ── Stat card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color }) => (
  <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
    <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${color || 'text-slate-800'}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const Payroll = () => {
  const { has } = getPermissions();
  const now = new Date();
  const [centers,       setCenters]       = useState([]);
  const [centerId,      setCenterId]      = useState('');
  const [month,         setMonth]         = useState(now.getMonth() + 1);
  const [year,          setYear]          = useState(now.getFullYear());
  const [activeTab,     setActiveTab]     = useState('register');

  // Register tab
  const [register,      setRegister]      = useState([]);
  const [regLoading,    setRegLoading]    = useState(false);

  // Calculate tab
  const [calcResult,    setCalcResult]    = useState(null);
  const [calcLoading,   setCalcLoading]   = useState(false);
  const [calcError,     setCalcError]     = useState('');

  // Approve
  const [approving,     setApproving]     = useState(false);
  const [approveResult, setApproveResult] = useState(null);
  const [approveError,  setApproveError]  = useState('');

  // ── Load centers ────────────────────────────────────────────────────────────
  useEffect(() => {
    api('/api/centers').then(r => r.json()).then(d => {
      const list = d.centers || d || [];
      setCenters(list);
      if (list.length) setCenterId(String(list[0].id));
    }).catch(() => {});
  }, []);

  // ── Load payroll register ────────────────────────────────────────────────────
  const loadRegister = useCallback(async () => {
    if (!centerId) return;
    setRegLoading(true);
    try {
      const r = await api(`/api/payroll/payroll/register?center_id=${centerId}&year=${year}&month=${month}`);
      const d = await r.json();
      setRegister(d.records || []);
    } catch (_e) { setRegister([]); }
    finally { setRegLoading(false); }
  }, [centerId, year, month]);

  useEffect(() => {
    if (activeTab === 'register') loadRegister();
  }, [activeTab, loadRegister]);

  // ── Calculate payroll ────────────────────────────────────────────────────────
  const handleCalculate = async () => {
    if (!centerId) { setCalcError('Select a center first'); return; }
    setCalcLoading(true); setCalcError(''); setCalcResult(null); setApproveResult(null);
    try {
      const r = await api('/api/payroll/payroll/calculate', {
        method: 'POST',
        body: JSON.stringify({ center_id: parseInt(centerId), month, year }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Calculation failed');
      setCalcResult(d.payroll);
    } catch (err) { setCalcError(err.message); }
    finally { setCalcLoading(false); }
  };

  // ── Approve payroll ──────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!centerId) return;
    setApproving(true); setApproveError(''); setApproveResult(null);
    try {
      const r = await api('/api/payroll/payroll/approve', {
        method: 'POST',
        body: JSON.stringify({ center_id: parseInt(centerId), month, year }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Approval failed');
      setApproveResult(d);
      setCalcResult(null);
      loadRegister();
    } catch (err) { setApproveError(err.message); }
    finally { setApproving(false); }
  };

  // ── Derived stats from register ──────────────────────────────────────────────
  const approved = register.filter(r => r.status === 'APPROVED');
  const draft    = register.filter(r => r.status === 'DRAFT');
  const totalNet = approved.reduce((s, r) => s + parseFloat(r.net_salary || 0), 0);
  const totalGross = approved.reduce((s, r) => s + parseFloat(r.gross_salary || 0), 0);

  const periodLabel = `${MONTHS[month - 1]} ${year}`;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="px-6 pt-4 pb-0"
        style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 60%,#2563eb 100%)' }}>
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Payroll Management</h1>
                <p className="text-blue-200 text-xs mt-0.5">Calculate · Approve · GL posting</p>
              </div>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-0.5">
            {[
              { key: 'register', label: 'Register' },
              { key: 'run',      label: 'Run Payroll' },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-5 py-2 text-sm font-semibold rounded-t-xl transition-colors ${
                  activeTab === t.key
                    ? 'bg-slate-50 text-blue-700'
                    : 'text-blue-200 hover:text-white'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-5 space-y-5">

        {/* Period / Center selectors */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Center</label>
            <select value={centerId} onChange={e => setCenterId(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]">
              <option value="">— Select center —</option>
              {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
            <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
            <select value={year} onChange={e => setYear(parseInt(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <span className="text-sm font-semibold text-slate-600 ml-auto self-center">{periodLabel}</span>
        </div>

        {/* ── REGISTER TAB ── */}
        {activeTab === 'register' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Approved Records" value={approved.length} sub={`${draft.length} draft`} />
              <StatCard label="Total Gross"      value={fmt(totalGross)} sub="approved" color="text-blue-700" />
              <StatCard label="Total Net Pay"    value={fmt(totalNet)}   sub="take-home" color="text-green-700" />
              <StatCard label="Total Deductions" value={fmt(totalGross - totalNet)} sub="PF + ESI + PT" color="text-orange-600" />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-sm font-semibold text-gray-800">Payroll Register — {periodLabel}</h2>
                <button onClick={loadRegister}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">Refresh</button>
              </div>
              {regLoading ? (
                <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
              ) : register.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  No payroll records for {periodLabel}.
                  <button onClick={() => setActiveTab('run')}
                    className="block mx-auto mt-2 text-blue-600 text-sm font-medium hover:underline">
                    Run payroll for this period →
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['Employee','Department','Gross','PF (Emp)','ESI (Emp)','PT','Total Deductions','Net Pay','Status'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {register.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            <div>{r.employee_name}</div>
                            <div className="text-xs text-gray-400">{r.employee_code}</div>
                          </td>
                          <td className="px-4 py-3">
                            {r.department && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${catBadge(r.department?.toUpperCase())}`}>
                                {r.department}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-gray-800">{fmt(r.gross_salary)}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{fmt(r.pf_deduction)}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{fmt(r.esi_deduction)}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{fmt(r.professional_tax)}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{fmt(r.total_deductions)}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-green-700">{fmt(r.net_salary)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              r.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── RUN PAYROLL TAB ── */}
        {activeTab === 'run' && (
          <div className="space-y-5">
            {/* Step 1 — Calculate */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Step 1 — Calculate Payroll</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Calculates gross, PF, ESI, PT for all active employees at selected center</p>
                </div>
                {has('PAYROLL_WRITE') && (
                <button onClick={handleCalculate} disabled={calcLoading || !centerId}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {calcLoading ? 'Calculating…' : 'Calculate'}
                </button>
                )}
              </div>

              {calcError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{calcError}</p>
              )}

              {calcResult && (
                <div className="space-y-4 mt-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Employees',    value: calcResult.calculations?.length || 0, color: 'text-blue-700' },
                      { label: 'Total Gross',  value: fmt(calcResult.summary?.total_gross_salary), color: 'text-slate-800' },
                      { label: 'Deductions',   value: fmt(calcResult.summary?.total_deductions), color: 'text-orange-600' },
                      { label: 'Net Payable',  value: fmt(calcResult.summary?.total_net_salary), color: 'text-green-700' },
                    ].map(s => (
                      <div key={s.label} className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
                        <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                        <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-employee breakdown */}
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Employee','Dept','Attendance','Basic','HRA','DA','Gross','PF','ESI','PT','Net'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(calcResult.calculations || []).map((emp, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                              <div>{emp.employee_name}</div>
                              <div className="text-xs text-gray-400">{emp.employee_code}</div>
                            </td>
                            <td className="px-3 py-2">
                              {emp.department && (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${catBadge(emp.department?.toUpperCase())}`}>
                                  {emp.department}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">
                              {emp.attendance_summary?.present_days}d
                              <span className="text-gray-400"> ({emp.attendance_summary?.attendance_percentage}%)</span>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-700">{fmt(emp.earnings?.basic_salary)}</td>
                            <td className="px-3 py-2 text-xs text-gray-700">{fmt(emp.earnings?.hra)}</td>
                            <td className="px-3 py-2 text-xs text-gray-700">{fmt(emp.earnings?.da)}</td>
                            <td className="px-3 py-2 text-xs font-semibold text-slate-800">{fmt(emp.earnings?.prorated_gross_salary)}</td>
                            <td className="px-3 py-2 text-xs text-gray-600">{fmt(emp.deductions?.pf)}</td>
                            <td className="px-3 py-2 text-xs text-gray-600">{fmt(emp.deductions?.esi)}</td>
                            <td className="px-3 py-2 text-xs text-gray-600">{fmt(emp.deductions?.professional_tax)}</td>
                            <td className="px-3 py-2 text-xs font-semibold text-green-700">{fmt(emp.net_salary)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2 — Approve */}
            {calcResult && (
              <div className="bg-white rounded-xl border border-blue-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">Step 2 — Approve & Post to GL</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Posts journal entry: DR Salary Expense (by dept) / CR Salaries Payable</p>
                  </div>
                  {has('PAYROLL_APPROVE') && (
                  <button onClick={handleApprove} disabled={approving}
                    className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                    {approving ? 'Approving…' : 'Approve & Post JE'}
                  </button>
                  )}
                </div>
                {approveError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{approveError}</p>
                )}
              </div>
            )}

            {/* Approve result */}
            {approveResult && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="font-semibold text-green-700 text-sm">{approveResult.message}</p>
                  {approveResult.summary?.journal_entry_id && (
                    <span className="ml-auto text-xs font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded">
                      JE #{approveResult.summary.journal_entry_id}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Employees Paid',  value: approveResult.summary?.total_employees },
                    { label: 'Total Gross',      value: fmt(approveResult.summary?.total_gross) },
                    { label: 'Total Net Pay',    value: fmt(approveResult.summary?.total_net) },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-lg px-4 py-3 border border-green-100">
                      <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                      <p className="text-lg font-bold text-slate-800 mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Category breakdown — shown if backend returns it */}
                {approveResult.summary?.by_category?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">GL Posting by Department</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {approveResult.summary.by_category.map(c => (
                        <div key={c.category} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-100 text-xs">
                          <span className={`px-1.5 py-0.5 rounded font-semibold ${catBadge(c.category)}`}>{c.category}</span>
                          <span className="font-semibold text-slate-700">{fmt(c.gross)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Payroll;
