import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmtINR = (n) => {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${Math.round(n || 0)}`;
};
const fmtINRFull = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtNum = (n) => new Intl.NumberFormat('en-IN').format(n || 0);

// ── Modality palette ───────────────────────────────────────────────────────────
const MOD_COLOR = {
  CT:           '#0d9488',
  MRI:          '#6366f1',
  XRAY:         '#f59e0b',
  ULTRASOUND:   '#10b981',
  MAMMOGRAPHY:  '#ec4899',
  Other:        '#94a3b8',
};
const colorFor = (m) => MOD_COLOR[m] || '#94a3b8';
const CHART_PALETTE = ['#0d9488','#6366f1','#f59e0b','#10b981','#ec4899','#94a3b8'];

// ── Change pill ────────────────────────────────────────────────────────────────
const ChangePill = ({ pct }) => {
  if (pct === null || pct === undefined) return null;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full
      ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
};

// ── KPI Card ───────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, change, changeSub, icon, accent, linkTo }) => (
  <Link to={linkTo || '#'} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col gap-2 group">
    <div className="flex items-center justify-between">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${accent}`}>{icon}</span>
      <ChangePill pct={change} />
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-800 tracking-tight">{value}</p>
      <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
    </div>
    {sub && <p className="text-xs text-slate-400 border-t border-slate-50 pt-2">{sub}</p>}
    {changeSub && <p className="text-xs text-slate-400">{changeSub}</p>}
  </Link>
);

// ── Section Card wrapper ───────────────────────────────────────────────────────
const Card = ({ title, subtitle, children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4 ${className}`}>
    {title && (
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
      </div>
    )}
    {children}
  </div>
);

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
const RevenueTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name === 'revenue' ? fmtINRFull(p.value) : `${p.value} bills`}
        </p>
      ))}
    </div>
  );
};

const ModalityTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-slate-700">{d.modality}</p>
      <p className="text-slate-500 mt-1">{fmtNum(d.studies)} studies</p>
      <p className="text-teal-700 font-semibold">{fmtINRFull(d.revenue)}</p>
    </div>
  );
};

// ── Donut centre label ─────────────────────────────────────────────────────────
const DonutLabel = ({ cx, cy, total }) => (
  <>
    <text x={cx} y={cy - 8}  textAnchor="middle" className="fill-slate-800" style={{ fontSize: 18, fontWeight: 700 }}>
      {fmtINR(total)}
    </text>
    <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 11 }}>
      Revenue
    </text>
  </>
);

// ── Alert chip ─────────────────────────────────────────────────────────────────
const AlertChip = ({ count, label, color, linkTo, icon }) => (
  <Link to={linkTo}
    className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm
      ${count > 0 ? color : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
    <span className="text-xl">{icon}</span>
    <div className="min-w-0">
      <p className={`text-lg font-bold leading-tight ${count > 0 ? '' : 'text-slate-400'}`}>{count}</p>
      <p className="text-xs truncate">{label}</p>
    </div>
  </Link>
);

// ── Skeleton loader ────────────────────────────────────────────────────────────
const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-100 rounded-xl ${className}`} />
);

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const H = { Authorization: `Bearer ${token}` };
      const r = await fetch('/api/dashboard-reports/bi-summary', { headers: H });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Failed');
      setData(d);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const kpi  = data?.kpis                || {};
  const pnl  = data?.pnl                 || {};
  const daily = data?.daily_trend        || [];
  const mods  = data?.modality_mix       || [];
  const ctrs  = data?.center_performance || [];
  const alrt  = data?.alerts             || {};

  const modalityTotal = mods.reduce((s, m) => s + m.revenue, 0);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-screen-2xl space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Operations Command Centre</h1>
          <p className="text-xs text-slate-400 mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-slate-400">
              Updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error} — <button onClick={load} className="underline font-medium">Retry</button>
        </div>
      )}

      {/* ── KPI Row ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            icon="💰" accent="bg-teal-50"
            label="Today's Revenue"
            value={fmtINR(kpi.today_revenue)}
            change={kpi.today_revenue_change}
            sub={`${fmtNum(kpi.today_patients)} patients today`}
            changeSub={`Yesterday ${fmtINR(kpi.yesterday_revenue)}`}
            linkTo="/billing"
          />
          <KpiCard
            icon="📈" accent="bg-indigo-50"
            label="Monthly Revenue"
            value={fmtINR(kpi.month_revenue)}
            change={kpi.month_revenue_change}
            sub={`${fmtNum(kpi.month_patients)} patients this month`}
            changeSub={`Last month ${fmtINR(kpi.last_month_revenue)}`}
            linkTo="/billing"
          />
          <KpiCard
            icon="🔬" accent="bg-amber-50"
            label="Studies This Month"
            value={fmtNum(kpi.month_studies)}
            sub={`Across all modalities`}
            linkTo="/study-reporting"
          />
          <KpiCard
            icon="✅" accent="bg-emerald-50"
            label="Collection Rate"
            value={`${kpi.collection_rate ?? 100}%`}
            sub="Paid vs total billed"
            changeSub={`₹ Outstanding: ${fmtINR(Math.max(0, kpi.month_revenue / ((kpi.collection_rate || 100) / 100) - kpi.month_revenue))}`}
            linkTo="/billing"
          />
          <KpiCard
            icon="🏦" accent="bg-purple-50"
            label="Gross Profit (MTD)"
            value={fmtINR(kpi.gross_profit)}
            sub={`Margin ${kpi.profit_margin ?? 0}%`}
            changeSub={`Rad cost ${fmtINR(kpi.month_rad_cost)}`}
            linkTo="/finance"
          />
        </div>
      )}

      {/* ── Revenue Trend + Modality Mix ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Area Chart — 30-day daily revenue */}
        <Card title="30-Day Revenue Trend" subtitle="daily collections" className="lg:col-span-2">
          {loading ? <Skeleton className="h-56" /> : daily.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">No billing data in the last 30 days</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0d9488" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                  interval={Math.max(0, Math.floor(daily.length / 7) - 1)} />
                <YAxis tickFormatter={v => fmtINR(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={55} />
                <Tooltip content={<RevenueTooltip />} />
                <Area type="monotone" dataKey="revenue" name="revenue" stroke="#0d9488" strokeWidth={2.5}
                  fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: '#0d9488', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Donut — modality mix */}
        <Card title="Modality Mix" subtitle="last 30 days">
          {loading ? <Skeleton className="h-56" /> : mods.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">No data</div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={mods} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                    dataKey="revenue" nameKey="modality" paddingAngle={2}
                    labelLine={false}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, payload }) => {
                      if (percent < 0.005) return null;
                      const RAD = Math.PI / 180;
                      const pct = Math.round(percent * 100);
                      if (percent >= 0.06) {
                        // Inside the slice
                        const r = innerRadius + (outerRadius - innerRadius) / 2;
                        const x = cx + r * Math.cos(-midAngle * RAD);
                        const y = cy + r * Math.sin(-midAngle * RAD);
                        return (
                          <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                            fontSize={9} fontWeight="800" fill="#fff">
                            {`${pct}%`}
                          </text>
                        );
                      }
                      // Outside with a short line for small slices
                      const sx = cx + outerRadius * Math.cos(-midAngle * RAD);
                      const sy = cy + outerRadius * Math.sin(-midAngle * RAD);
                      const ex = cx + (outerRadius + 14) * Math.cos(-midAngle * RAD);
                      const ey = cy + (outerRadius + 14) * Math.sin(-midAngle * RAD);
                      const color = colorFor(payload.modality);
                      return (
                        <g>
                          <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={1} />
                          <text x={ex + (ex > cx ? 3 : -3)} y={ey} textAnchor={ex > cx ? 'start' : 'end'}
                            dominantBaseline="central" fontSize={9} fontWeight="700" fill={color}>
                            {`${pct}%`}
                          </text>
                        </g>
                      );
                    }}>
                    {mods.map((m, i) => (
                      <Cell key={i} fill={colorFor(m.modality)} />
                    ))}
                    <DonutLabel cx="50%" cy="50%" total={modalityTotal} />
                  </Pie>
                  <Tooltip content={<ModalityTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="w-full space-y-1">
                {mods.map((m, i) => {
                  const color = colorFor(m.modality);
                  const pct   = modalityTotal > 0 ? Math.round(m.revenue / modalityTotal * 100) : 0;
                  return (
                    <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                      style={{ borderLeft: `4px solid ${color}`, background: color + '12' }}>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-slate-700 font-semibold text-xs flex-1">{m.modality}</span>
                      <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
                      <span className="text-slate-500 text-xs">{fmtNum(m.studies)} · {fmtINR(m.revenue)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Center Performance + P&L + Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Center horizontal bar */}
        <Card title="Centre Performance" subtitle="revenue last 30 days" className="lg:col-span-2">
          {loading ? <Skeleton className="h-44" /> : ctrs.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No centre data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(140, ctrs.length * 52)}>
              <BarChart data={ctrs} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtINR(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="center" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} width={110} />
                <Tooltip formatter={(v) => [fmtINRFull(v), 'Revenue']} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {ctrs.map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* EBITDA waterfall */}
        <Card title="P&L / EBITDA" subtitle="month to date">
          {loading ? (
            <div className="space-y-3">{[...Array(6)].map((_,i) => <Skeleton key={i} className="h-5" />)}</div>
          ) : (
            <div className="space-y-0">
              {/* Waterfall rows */}
              {[
                { label: 'Revenue',          value: pnl.revenue,       color: 'bg-teal-500',   indent: 0,  bold: true },
                { label: '− Rad Fees',        value: pnl.rad_cost,      color: 'bg-rose-400',   indent: 1,  sign: '-' },
                { label: '− Staff Cost',      value: pnl.staff_cost,    color: 'bg-orange-400', indent: 1,  sign: '-' },
                { label: '− Overheads',       value: pnl.overhead_cost, color: 'bg-amber-400',  indent: 1,  sign: '-' },
                { label: '− Consumables',     value: pnl.consumables,   color: 'bg-yellow-400', indent: 1,  sign: '-' },
              ].map((row, i) => (
                <div key={i} className={`py-2 ${i > 0 ? 'border-t border-slate-50' : ''}`}
                  style={{ paddingLeft: row.indent * 12 }}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={`${row.bold ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>{row.label}</span>
                    <span className={`font-semibold ${row.sign === '-' ? 'text-slate-600' : 'text-slate-800'}`}>
                      {row.sign === '-' ? '−' : ''}{fmtINR(row.value)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${row.color}`}
                      style={{ width: `${pnl.revenue > 0 ? Math.max(2, Math.round((row.value / pnl.revenue) * 100)) : 0}%` }} />
                  </div>
                </div>
              ))}

              {/* EBITDA highlight */}
              <div className="mt-2 pt-3 border-t-2 border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">EBITDA</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                      ${(kpi.ebitda_margin||0) >= 35 ? 'bg-emerald-100 text-emerald-700' :
                        (kpi.ebitda_margin||0) >= 20 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                      {kpi.ebitda_margin ?? 0}%
                    </span>
                    <span className="text-sm font-bold text-slate-800">{fmtINR(pnl.ebitda)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>− Depreciation</span>
                  <span className="font-medium">−{fmtINR(pnl.depreciation)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-700">EBIT</span>
                  <span className={`text-sm font-bold ${(kpi.ebit_margin||0) >= 20 ? 'text-emerald-600' : (kpi.ebit_margin||0) >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                    {fmtINR(pnl.ebit)} <span className="text-xs font-normal">({kpi.ebit_margin ?? 0}%)</span>
                  </span>
                </div>
              </div>

              <Link to="/finance" className="block text-center text-xs text-teal-600 hover:text-teal-700 font-medium pt-3">
                Full Finance Report →
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* ── Alerts ── */}
      <Card title="Action Required" subtitle="items needing attention">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AlertChip
              count={alrt.pending_reports || 0}
              label="Pending Reports"
              icon="📋"
              linkTo="/study-reporting"
              color="bg-amber-50 border-amber-200 text-amber-700"
            />
            <AlertChip
              count={alrt.low_stock || 0}
              label="Low Stock Items"
              icon="📦"
              linkTo="/stock"
              color="bg-red-50 border-red-200 text-red-700"
            />
            <AlertChip
              count={alrt.pending_pos || 0}
              label="Pending POs"
              icon="🛒"
              linkTo="/procurement"
              color="bg-orange-50 border-orange-200 text-orange-700"
            />
            <AlertChip
              count={alrt.pending_leaves || 0}
              label="Leave Requests"
              icon="🗓"
              linkTo="/hr"
              color="bg-purple-50 border-purple-200 text-purple-700"
            />
          </div>
        )}
      </Card>

    </div>
  );
}
