import { useState, useEffect, useCallback } from 'react';
import { getPermissions } from '../utils/permissions';

const AUTH_HEADER = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const fmt = (v) =>
  v != null ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Constants ──────────────────────────────────────────────────────────────────

const CONTRACT_TYPES = [
  { code: 'AMC',               label: 'AMC',           full: 'Annual Maintenance Contract',        color: 'blue',   sla: false },
  { code: 'CMC',               label: 'CMC',           full: 'Comprehensive Maintenance Contract',  color: 'teal',   sla: false },
  { code: 'SLA',               label: 'SLA',           full: 'Service Level Agreement',            color: 'violet', sla: true  },
  { code: 'CMS',               label: 'CMS',           full: 'Corrective Maintenance Service',     color: 'orange', sla: false },
  { code: 'WARRANTY',          label: 'Warranty',      full: 'Manufacturer Warranty',              color: 'green',  sla: false },
  { code: 'EXTENDED_WARRANTY', label: 'Ext. Warranty', full: 'Extended Warranty',                  color: 'green',  sla: false },
  { code: 'CALIBRATION',       label: 'Calibration',   full: 'Calibration Contract',               color: 'slate',  sla: false },
];

const MAINT_TYPES = [
  { code: 'PREVENTIVE',  label: 'Preventive',  color: 'blue'   },
  { code: 'CORRECTIVE',  label: 'Corrective',  color: 'orange' },
  { code: 'BREAKDOWN',   label: 'Breakdown',   color: 'red'    },
  { code: 'CALIBRATION', label: 'Calibration', color: 'violet' },
  { code: 'INSPECTION',  label: 'Inspection',  color: 'teal'   },
  { code: 'UPGRADE',     label: 'Upgrade',     color: 'slate'  },
];

const MAINT_STATUSES = [
  { code: 'OPEN',        label: 'Open',        color: 'bg-amber-100 text-amber-700'  },
  { code: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-700'   },
  { code: 'COMPLETED',   label: 'Completed',   color: 'bg-green-100 text-green-700' },
  { code: 'CANCELLED',   label: 'Cancelled',   color: 'bg-slate-100 text-slate-500' },
];

const CONTRACT_STATUS_STYLE = {
  ACTIVE:        'bg-emerald-100 text-emerald-700',
  EXPIRING_SOON: 'bg-amber-100 text-amber-700',
  EXPIRED:       'bg-red-100 text-red-600',
};

const CAT_ICONS = {
  MODALITY:      '🩻',
  SCANNER:       '📡',
  EQUIPMENT:     '🔬',
  SOFTWARE:      '💾',
  FURNITURE:     '🪑',
  APPLIANCE:     '⚡',
  ELECTRONICS:   '🖥️',
  WORKSTATION:   '💻',
  SSL_CERT:      '🔒',
  CLOUD_SERVICE: '☁️',
};

const TYPE_DOT = {
  PREVENTIVE:  'bg-blue-400',
  CORRECTIVE:  'bg-orange-400',
  BREAKDOWN:   'bg-red-500',
  CALIBRATION: 'bg-violet-400',
  INSPECTION:  'bg-teal-400',
  UPGRADE:     'bg-slate-400',
};

const TYPE_BADGE = {
  PREVENTIVE:  'bg-blue-50 text-blue-700 border border-blue-200',
  CORRECTIVE:  'bg-orange-50 text-orange-700 border border-orange-200',
  BREAKDOWN:   'bg-red-50 text-red-700 border border-red-200',
  CALIBRATION: 'bg-violet-50 text-violet-700 border border-violet-200',
  INSPECTION:  'bg-teal-50 text-teal-700 border border-teal-200',
  UPGRADE:     'bg-slate-50 text-slate-600 border border-slate-200',
};

const STATUS_BADGE = {
  OPEN:        'bg-amber-50 text-amber-700 border border-amber-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border border-blue-200',
  COMPLETED:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  CANCELLED:   'bg-slate-50 text-slate-500 border border-slate-200',
};

const colorMap = {
  blue:   'bg-blue-100 text-blue-700',
  teal:   'bg-teal-100 text-teal-700',
  violet: 'bg-violet-100 text-violet-700',
  orange: 'bg-orange-100 text-orange-700',
  green:  'bg-emerald-100 text-emerald-700',
  red:    'bg-red-100 text-red-700',
  slate:  'bg-slate-100 text-slate-600',
  amber:  'bg-amber-100 text-amber-700',
};

const GST_RATES = [0, 5, 12, 18, 28];
const EMPTY_PART = { part_code: '', part_name: '', quantity: 1, unit_cost: '', gst_rate: 18, notes: '' };

// ── Form styles ────────────────────────────────────────────────────────────────
const inputCls  = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent placeholder:text-slate-400 transition-all';
const labelCls  = 'block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide';
const logInputCls = 'w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent placeholder:text-slate-400 transition-all';

// ── Empty forms ────────────────────────────────────────────────────────────────
const EMPTY_CONTRACT = {
  contract_type: 'AMC', contract_number: '', vendor_name: '', vendor_contact: '',
  vendor_email: '', start_date: '', end_date: '', contract_value: '',
  response_time_hours: '', resolution_time_hours: '', uptime_guarantee_pct: '',
  penalty_per_hour: '', parts_included: false, labor_included: true,
  onsite_support: true, remote_support: true, preventive_visits_yr: '',
  coverage_scope: '', notes: '',
};

const EMPTY_LOG = {
  maintenance_type: 'PREVENTIVE', reference_number: '', reported_date: '',
  start_date: '', completion_date: '', downtime_hours: '',
  technician_name: '', vendor_name: '', problem_description: '',
  work_performed: '', observations: '', next_service_date: '',
  labor_cost: '', other_cost: '', contract_id: '', status: 'OPEN',
  parts: [],
};

// ── Tiny components ────────────────────────────────────────────────────────────
const Badge = ({ children, cls }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{children}</span>
);

const StatCard = ({ label, value, sub, icon, gradient }) => (
  <div className={`relative rounded-2xl p-4 ${gradient} text-white overflow-hidden shadow-sm`}>
    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
    <p className="text-xl mb-1">{icon}</p>
    <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{label}</p>
    <p className="text-base font-bold mt-0.5 truncate">{value}</p>
    {sub && <p className="text-xs text-white/60 mt-0.5">{sub}</p>}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
const AssetMaintenance = () => {
  const { has } = getPermissions();
  const [assets,        setAssets]        = useState([]);
  const [selected,      setSelected]      = useState(null);
  const [contracts,     setContracts]     = useState([]);
  const [logs,          setLogs]          = useState([]);
  const [activeTab,     setActiveTab]     = useState('contracts');
  const [loading,       setLoading]       = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search,        setSearch]        = useState('');
  const [filterType,    setFilterType]    = useState('');
  const [filterCenter,  setFilterCenter]  = useState('');

  const [contractModal,   setContractModal]   = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [contractForm,    setContractForm]    = useState(EMPTY_CONTRACT);

  const [logModal,   setLogModal]   = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [logForm,    setLogForm]    = useState(EMPTY_LOG);

  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState('');

  // ── Data fetching ────────────────────────────────────────────────────────────
  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/asset-maintenance/assets', { headers: AUTH_HEADER() });
      const data = await res.json();
      setAssets(data.assets || []);
    } catch (_) {}
    setLoading(false);
  }, []);

  const fetchDetail = useCallback(async (assetId) => {
    setLoadingDetail(true);
    try {
      const [ovRes, logsRes] = await Promise.all([
        fetch(`/api/asset-maintenance/${assetId}/overview`, { headers: AUTH_HEADER() }),
        fetch(`/api/asset-maintenance/${assetId}/logs`,     { headers: AUTH_HEADER() }),
      ]);
      const ovData   = await ovRes.json();
      const logsData = await logsRes.json();
      setSelected(ovData.overview);
      setContracts(ovData.contracts || []);
      setLogs(logsData.logs || []);
    } catch (_) {}
    setLoadingDetail(false);
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const selectAsset = (a) => {
    fetchDetail(a.asset_id);
    setActiveTab('contracts');
  };

  const uniqueTypes   = [...new Set(assets.map(a => a.asset_type).filter(Boolean))].sort();
  const uniqueCenters = [...new Set(assets.map(a => a.center_name).filter(Boolean))].sort();

  const filteredAssets = assets.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.asset_name.toLowerCase().includes(q) ||
      a.asset_code.toLowerCase().includes(q) ||
      (a.center_name || '').toLowerCase().includes(q);
    const matchType   = !filterType   || a.asset_type   === filterType;
    const matchCenter = !filterCenter || a.center_name  === filterCenter;
    return matchSearch && matchType && matchCenter;
  });

  const activeFilterCount = [filterType, filterCenter].filter(Boolean).length;

  // ── Contract helpers ─────────────────────────────────────────────────────────
  const openAddContract = () => {
    setEditingContract(null); setContractForm(EMPTY_CONTRACT); setSaveErr(''); setContractModal(true);
  };
  const openEditContract = (c) => {
    setEditingContract(c);
    setContractForm({
      contract_type: c.contract_type, contract_number: c.contract_number || '',
      vendor_name: c.vendor_name, vendor_contact: c.vendor_contact || '',
      vendor_email: c.vendor_email || '',
      start_date: c.start_date?.split('T')[0] || '', end_date: c.end_date?.split('T')[0] || '',
      contract_value: c.contract_value || '',
      response_time_hours: c.response_time_hours || '', resolution_time_hours: c.resolution_time_hours || '',
      uptime_guarantee_pct: c.uptime_guarantee_pct || '', penalty_per_hour: c.penalty_per_hour || '',
      parts_included: !!c.parts_included, labor_included: !!c.labor_included,
      onsite_support: !!c.onsite_support, remote_support: !!c.remote_support,
      preventive_visits_yr: c.preventive_visits_yr || '',
      coverage_scope: c.coverage_scope || '', notes: c.notes || '',
    });
    setSaveErr(''); setContractModal(true);
  };
  const setC = (f) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setContractForm(p => ({ ...p, [f]: val }));
  };
  const handleContractSubmit = async (ev) => {
    ev.preventDefault();
    if (!contractForm.vendor_name || !contractForm.start_date || !contractForm.end_date) {
      setSaveErr('Vendor, start date and end date are required'); return;
    }
    setSaving(true); setSaveErr('');
    try {
      const url    = editingContract ? `/api/asset-maintenance/contracts/${editingContract.id}` : `/api/asset-maintenance/${selected.asset_id}/contracts`;
      const method = editingContract ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: AUTH_HEADER(), body: JSON.stringify({
        ...contractForm,
        contract_value:        parseFloat(contractForm.contract_value)        || 0,
        response_time_hours:   parseInt(contractForm.response_time_hours)     || null,
        resolution_time_hours: parseInt(contractForm.resolution_time_hours)   || null,
        uptime_guarantee_pct:  parseFloat(contractForm.uptime_guarantee_pct)  || null,
        penalty_per_hour:      parseFloat(contractForm.penalty_per_hour)      || 0,
        preventive_visits_yr:  parseInt(contractForm.preventive_visits_yr)    || 0,
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors?.[0]?.msg || data.error || 'Save failed');
      await fetchDetail(selected.asset_id); await fetchAssets();
      setContractModal(false);
    } catch (e) { setSaveErr(e.message); }
    setSaving(false);
  };
  const handleDeleteContract = async (id) => {
    if (!window.confirm('Remove this contract?')) return;
    await fetch(`/api/asset-maintenance/contracts/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    await fetchDetail(selected.asset_id); await fetchAssets();
  };

  // ── Log helpers ──────────────────────────────────────────────────────────────
  const openAddLog = () => {
    setEditingLog(null);
    setLogForm({ ...EMPTY_LOG, reported_date: new Date().toISOString().split('T')[0] });
    setSaveErr(''); setLogModal(true);
  };
  const openEditLog = (l) => {
    setEditingLog(l);
    setLogForm({
      maintenance_type: l.maintenance_type, reference_number: l.reference_number || '',
      reported_date: l.reported_date?.split('T')[0] || '',
      start_date: l.start_date?.split('T')[0] || '',
      completion_date: l.completion_date?.split('T')[0] || '',
      downtime_hours: l.downtime_hours || '', technician_name: l.technician_name || '',
      vendor_name: l.vendor_name || '', problem_description: l.problem_description || '',
      work_performed: l.work_performed || '', observations: l.observations || '',
      next_service_date: l.next_service_date?.split('T')[0] || '',
      labor_cost: l.labor_cost || '', other_cost: l.other_cost || '',
      contract_id: l.contract_id || '', status: l.status,
      parts: (l.parts || []).map(p => ({
        part_code: p.part_code || '', part_name: p.part_name,
        quantity: p.quantity, unit_cost: p.unit_cost,
        gst_rate: p.gst_rate != null ? p.gst_rate : 18,
        notes: p.notes || '',
      })),
    });
    setSaveErr(''); setLogModal(true);
  };
  const setL = (f) => (e) => setLogForm(p => ({ ...p, [f]: e.target.value }));
  const addPart    = () => setLogForm(p => ({ ...p, parts: [...p.parts, { ...EMPTY_PART }] }));
  const removePart = (i) => setLogForm(p => ({ ...p, parts: p.parts.filter((_, idx) => idx !== i) }));
  const setPart    = (i, f) => (e) => setLogForm(p => {
    const parts = [...p.parts]; parts[i] = { ...parts[i], [f]: e.target.value }; return { ...p, parts };
  });
  const handleLogSubmit = async (ev) => {
    ev.preventDefault();
    if (!logForm.reported_date || !logForm.maintenance_type) {
      setSaveErr('Reported date and type are required'); return;
    }
    setSaving(true); setSaveErr('');
    try {
      const url    = editingLog ? `/api/asset-maintenance/logs/${editingLog.id}` : `/api/asset-maintenance/${selected.asset_id}/logs`;
      const method = editingLog ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: AUTH_HEADER(), body: JSON.stringify({
        ...logForm,
        labor_cost:     parseFloat(logForm.labor_cost)     || 0,
        other_cost:     parseFloat(logForm.other_cost)     || 0,
        downtime_hours: parseFloat(logForm.downtime_hours) || 0,
        contract_id:    logForm.contract_id || null,
        parts: logForm.parts.map(p => ({
          ...p,
          quantity:  parseFloat(p.quantity)  || 1,
          unit_cost: parseFloat(p.unit_cost) || 0,
        })).filter(p => p.part_name.trim()),
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors?.[0]?.msg || data.error || 'Save failed');
      await fetchDetail(selected.asset_id); await fetchAssets();
      setLogModal(false);
    } catch (e) { setSaveErr(e.message); }
    setSaving(false);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const isSLA               = CONTRACT_TYPES.find(c => c.code === contractForm.contract_type)?.sla;
  const selectedContractMeta = CONTRACT_TYPES.find(c => c.code === contractForm.contract_type);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-teal-600 via-teal-600 to-teal-700 px-6 py-5 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <div className="w-11 h-11 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center text-2xl shadow-inner">
            🔧
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Asset Maintenance</h1>
            <p className="text-sm text-teal-200 mt-0.5">Lifecycle cost · Contracts · Service history · Spare parts</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">

        {/* ═══ ASSET LIST VIEW (no selection) ══════════════════════════════ */}
        {!selected && (
          <div className="space-y-3">

            {/* Filter bar */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex flex-col sm:flex-row gap-3">

                {/* Search */}
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name, code or center…"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent focus:bg-white transition-all"
                  />
                </div>

                {/* Type */}
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                  className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all sm:w-44">
                  <option value="">All Types</option>
                  {uniqueTypes.map(t => <option key={t} value={t}>{CAT_ICONS[t]} {t}</option>)}
                </select>

                {/* Center */}
                <select value={filterCenter} onChange={e => setFilterCenter(e.target.value)}
                  className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all sm:w-48">
                  <option value="">All Centers</option>
                  {uniqueCenters.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {activeFilterCount > 0 && (
                  <button onClick={() => { setSearch(''); setFilterType(''); setFilterCenter(''); }}
                    className="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap">
                    ✕ Clear
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-400 mt-2">
                {loading ? 'Loading assets…' : `${filteredAssets.length} of ${assets.length} assets`}
              </p>
            </div>

            {/* Asset table */}
            {loading ? (
              <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 gap-3 text-slate-400">
                <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                Loading assets…
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 text-center">
                <p className="text-slate-500 font-medium">No assets match your filters</p>
                <p className="text-slate-400 text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table style={{ minWidth: 780 }} className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Asset</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Code</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Center</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Lifecycle Cost</th>
                        <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Tickets</th>
                        <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAssets.map(a => {
                        const hasMaint   = parseInt(a.open_tickets) > 0;
                        const nearExpiry = a.nearest_contract_expiry &&
                          (new Date(a.nearest_contract_expiry) - new Date()) < 30 * 86400000;
                        return (
                          <tr key={a.asset_id} onClick={() => selectAsset(a)}
                            className="hover:bg-teal-50 cursor-pointer transition-colors group">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{CAT_ICONS[a.asset_type] || '🔧'}</span>
                                <span className="font-semibold text-slate-800 group-hover:text-teal-700 transition-colors">{a.asset_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{a.asset_code}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-600">{a.asset_type}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-600">{a.center_name}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-teal-700">{fmt(a.total_lifecycle_cost)}</td>
                            <td className="px-4 py-2.5 text-center">
                              {hasMaint ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-bold">{a.open_tickets} open</span>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {a.status === 'DISPOSED' ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">🗑 Disposed</span>
                              ) : a.status === 'UNDER_MAINTENANCE' || hasMaint ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-bold">🔧 Maintenance</span>
                              ) : nearExpiry ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-bold">⚠ Expiring</span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">✓ Active</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ DETAIL VIEW (asset selected) ════════════════════════════════ */}
        {selected && (
          <div className="space-y-4">

            {/* ── Selected asset bar (back + summary) ──────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
              <button onClick={() => setSelected(null)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                All Assets
              </button>

              <div className="w-px h-8 bg-slate-200 hidden sm:block" />

              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                  {CAT_ICONS[selected.asset_type] || '🔧'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800">{selected.asset_name}</p>
                    <span className="font-mono text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg">{selected.asset_code}</span>
                    <span className="text-xs text-slate-400">{selected.asset_type}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{selected.center_name}</p>
                </div>
              </div>

              {selected.nearest_contract_expiry && (
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-400">Contract expires</p>
                  <p className={`text-sm font-bold ${
                    new Date(selected.nearest_contract_expiry) < new Date(Date.now() + 30 * 86400000)
                      ? 'text-red-500' : 'text-slate-700'
                  }`}>{fmtDate(selected.nearest_contract_expiry)}</p>
                </div>
              )}
            </div>

            {loadingDetail ? (
              <div className="flex items-center justify-center bg-white rounded-2xl border border-slate-200 py-24 gap-3 text-slate-400">
                <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="space-y-4">

                {/* ── Asset overview card ──────────────────────────────── */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* Card header strip */}
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                          {CAT_ICONS[selected.asset_type] || '🔧'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold text-white">{selected.asset_name}</h2>
                            <span className="font-mono text-xs bg-white/10 text-slate-300 px-2 py-0.5 rounded-lg">
                              {selected.asset_code}
                            </span>
                          </div>
                          <p className="text-sm text-slate-400 mt-0.5">
                            {selected.center_name} · Acquired {fmtDate(selected.acquisition_date)}
                          </p>
                        </div>
                      </div>
                      {selected.nearest_contract_expiry && (
                        <div className="bg-white/10 rounded-xl px-4 py-2 text-right">
                          <p className="text-xs text-slate-400">Nearest expiry</p>
                          <p className={`text-sm font-bold mt-0.5 ${
                            new Date(selected.nearest_contract_expiry) < new Date(Date.now() + 30 * 86400000)
                              ? 'text-red-400' : 'text-white'
                          }`}>
                            {fmtDate(selected.nearest_contract_expiry)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stat cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
                    <StatCard icon="🏷️" label="Acquisition"     gradient="bg-gradient-to-br from-slate-600 to-slate-700"   value={fmt(selected.acquisition_cost)} />
                    <StatCard icon="📋" label="Contracts"       gradient="bg-gradient-to-br from-blue-500 to-blue-600"     value={fmt(selected.total_contract_cost)}   sub={`${selected.contract_count} contracts`} />
                    <StatCard icon="🔧" label="Repair & Labour" gradient="bg-gradient-to-br from-orange-500 to-orange-600" value={fmt(selected.total_maintenance_cost)} sub={`${selected.maintenance_count} events`} />
                    <StatCard icon="🔩" label="Parts Used"      gradient="bg-gradient-to-br from-amber-500 to-amber-600"   value={fmt(selected.total_parts_cost)} />
                    <StatCard icon="📊" label="Total Lifecycle" gradient="bg-gradient-to-br from-teal-500 to-teal-600"     value={fmt(selected.total_lifecycle_cost)} sub={`${selected.total_downtime_hours}h downtime`} />
                  </div>
                </div>

                {/* ── Tabs card ─────────────────────────────────────────── */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

                  {/* Tab bar */}
                  <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-slate-100">
                    {[
                      { key: 'contracts', label: 'Contracts', count: contracts.length },
                      { key: 'logs',      label: 'Service Log', count: logs.length },
                    ].map(t => (
                      <button key={t.key} onClick={() => setActiveTab(t.key)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-all ${
                          activeTab === t.key
                            ? 'border-teal-500 text-teal-600 bg-teal-50/50'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}>
                        {t.label}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                          activeTab === t.key ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
                        }`}>{t.count}</span>
                      </button>
                    ))}
                    <div className="flex-1" />
                    {activeTab === 'contracts' && has('ASSET_MAINTENANCE_WRITE') && (
                      <button onClick={openAddContract}
                        className="mb-2 flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-xl hover:bg-teal-700 shadow-sm transition-colors">
                        <span className="text-base leading-none">+</span> Add Contract
                      </button>
                    )}
                    {activeTab === 'logs' && has('ASSET_MAINTENANCE_WRITE') && (
                      <button onClick={openAddLog}
                        className="mb-2 flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-xl hover:bg-teal-700 shadow-sm transition-colors">
                        <span className="text-base leading-none">+</span> Log Event
                      </button>
                    )}
                  </div>

                  {/* ── Contracts tab ──────────────────────────────────── */}
                  {activeTab === 'contracts' && (
                    contracts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-2xl mb-3">📋</div>
                        <p className="font-semibold text-slate-600">No contracts yet</p>
                        <p className="text-sm text-slate-400 mt-1">Add AMC, CMC, SLA, or CMS contracts</p>
                      </div>
                    ) : (
                      <div className="p-4 grid gap-3 sm:grid-cols-2">
                        {contracts.map(c => {
                          const ct = CONTRACT_TYPES.find(t => t.code === c.contract_type);
                          return (
                            <div key={c.id} className="rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all duration-200 bg-white">
                              {/* Contract header */}
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge cls={colorMap[ct?.color || 'slate']}>{ct?.label || c.contract_type}</Badge>
                                  {c.contract_number && (
                                    <span className="font-mono text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg">
                                      {c.contract_number}
                                    </span>
                                  )}
                                </div>
                                <Badge cls={CONTRACT_STATUS_STYLE[c.computed_status] || 'bg-slate-100 text-slate-500'}>
                                  {c.computed_status === 'EXPIRING_SOON' ? '⚠ Expiring' : c.computed_status}
                                </Badge>
                              </div>

                              {/* Vendor */}
                              <p className="font-semibold text-slate-800 text-sm">{c.vendor_name}</p>
                              {c.vendor_contact && <p className="text-xs text-slate-400 mt-0.5">{c.vendor_contact}</p>}

                              {/* Dates + Value */}
                              <div className="flex items-end justify-between mt-3 pt-3 border-t border-slate-100">
                                <div className="text-xs text-slate-500">
                                  <p className="font-medium">{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</p>
                                  {c.days_remaining > 0 && c.days_remaining <= 60 && (
                                    <p className="text-amber-600 font-bold mt-0.5">⚠ {c.days_remaining} days left</p>
                                  )}
                                </div>
                                <p className="text-lg font-bold text-slate-800">{fmt(c.contract_value)}</p>
                              </div>

                              {/* Coverage + SLA */}
                              <div className="flex flex-wrap gap-1 mt-3">
                                {c.labor_included  && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium">Labour</span>}
                                {c.parts_included  && <span className="px-2 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-full text-xs font-medium">Parts</span>}
                                {c.onsite_support  && <span className="px-2 py-0.5 bg-teal-50 text-teal-600 border border-teal-100 rounded-full text-xs font-medium">Onsite</span>}
                                {c.remote_support  && <span className="px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded-full text-xs font-medium">Remote</span>}
                                {c.preventive_visits_yr > 0 && <span className="px-2 py-0.5 bg-green-50 text-green-600 border border-green-100 rounded-full text-xs font-medium">{c.preventive_visits_yr} PM/yr</span>}
                              </div>

                              {/* SLA info */}
                              {c.response_time_hours && (
                                <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-3">
                                  <span>Response: <span className="text-slate-600 font-medium">{c.response_time_hours}h</span></span>
                                  {c.resolution_time_hours && <span>Resolution: <span className="text-slate-600 font-medium">{c.resolution_time_hours}h</span></span>}
                                  {c.uptime_guarantee_pct  && <span>Uptime: <span className="text-emerald-600 font-semibold">{c.uptime_guarantee_pct}%</span></span>}
                                </div>
                              )}

                              {/* Actions */}
                              {has('ASSET_MAINTENANCE_WRITE') && (
                              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                                <button onClick={() => openEditContract(c)}
                                  className="flex-1 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors">
                                  Edit
                                </button>
                                <button onClick={() => handleDeleteContract(c.id)}
                                  className="flex-1 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors">
                                  Delete
                                </button>
                              </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}

                  {/* ── Service log tab ────────────────────────────────── */}
                  {activeTab === 'logs' && (
                    logs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-2xl mb-3">📝</div>
                        <p className="font-semibold text-slate-600">No service records yet</p>
                        <p className="text-sm text-slate-400 mt-1">Log the first maintenance event</p>
                      </div>
                    ) : (
                      <div className="p-4 space-y-1">
                        {logs.map((l, idx) => {
                          const mt = MAINT_TYPES.find(t => t.code === l.maintenance_type);
                          const ms = MAINT_STATUSES.find(s => s.code === l.status);
                          const dotCls    = TYPE_DOT[l.maintenance_type]   || 'bg-slate-400';
                          const typeBadge = TYPE_BADGE[l.maintenance_type] || 'bg-slate-50 text-slate-600 border border-slate-200';
                          const stBadge   = STATUS_BADGE[l.status]         || 'bg-slate-50 text-slate-500 border border-slate-200';
                          return (
                            <div key={l.id} className="relative pl-8 pb-4">
                              {/* Timeline line */}
                              {idx < logs.length - 1 && (
                                <div className="absolute left-[13px] top-5 bottom-0 w-0.5 bg-slate-200" />
                              )}
                              {/* Timeline dot */}
                              <div className={`absolute left-2.5 top-3.5 w-3 h-3 rounded-full ring-2 ring-white shadow-sm ${dotCls}`} />

                              {/* Log card */}
                              <div className="bg-slate-50 hover:bg-white border border-slate-200 hover:shadow-md rounded-xl p-4 transition-all duration-200">
                                <div className="flex flex-col sm:flex-row sm:items-start gap-3">

                                  {/* Left: details */}
                                  <div className="flex-1 min-w-0">
                                    {/* Badges row */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${typeBadge}`}>
                                        {mt?.label || l.maintenance_type}
                                      </span>
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${stBadge}`}>
                                        {ms?.label || l.status}
                                      </span>
                                      {l.reference_number && (
                                        <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                                          #{l.reference_number}
                                        </span>
                                      )}
                                      {l.downtime_hours > 0 && (
                                        <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-lg">
                                          ⏱ {l.downtime_hours}h downtime
                                        </span>
                                      )}
                                    </div>

                                    {/* Meta grid */}
                                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-0.5 text-xs text-slate-500">
                                      <span>📅 <span className="text-slate-700 font-medium">{fmtDate(l.reported_date)}</span></span>
                                      {l.completion_date && <span>✅ <span className="text-slate-700 font-medium">{fmtDate(l.completion_date)}</span></span>}
                                      {l.technician_name && <span>👷 <span className="text-slate-700 font-medium">{l.technician_name}</span></span>}
                                      {l.vendor_name     && <span>🏢 <span className="text-slate-700 font-medium">{l.vendor_name}</span></span>}
                                    </div>

                                    {/* Descriptions */}
                                    {l.problem_description && (
                                      <div className="mt-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                                        <p className="text-xs font-semibold text-red-600 mb-0.5">Problem</p>
                                        <p className="text-xs text-slate-700">{l.problem_description}</p>
                                      </div>
                                    )}
                                    {l.work_performed && (
                                      <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                                        <p className="text-xs font-semibold text-emerald-700 mb-0.5">Work Done</p>
                                        <p className="text-xs text-slate-700">{l.work_performed}</p>
                                      </div>
                                    )}

                                    {/* Spare parts */}
                                    {l.parts?.length > 0 && (
                                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                                        <div className="px-3 py-1.5 bg-amber-100 border-b border-amber-200">
                                          <p className="text-xs font-bold text-amber-800">🔩 Spare Parts Used</p>
                                        </div>
                                        <div className="px-3 py-2 space-y-1.5">
                                          {l.parts.map((p, i) => {
                                            const base   = p.base_cost   != null ? Number(p.base_cost)   : (Number(p.quantity) * Number(p.unit_cost));
                                            const gstAmt = p.gst_amount  != null ? Number(p.gst_amount)  : (base * (Number(p.gst_rate) || 0) / 100);
                                            const total  = p.total_cost  != null ? Number(p.total_cost)  : (base + gstAmt);
                                            return (
                                              <div key={i} className="flex items-start justify-between gap-2 text-xs">
                                                <div>
                                                  <span className="font-semibold text-amber-900">
                                                    {p.part_name}{p.part_code ? ` (${p.part_code})` : ''} × {p.quantity}
                                                  </span>
                                                  {p.gst_rate > 0 && (
                                                    <p className="text-amber-600 mt-0.5">
                                                      Base {fmt(base)} + GST {p.gst_rate}%: {fmt(gstAmt)}
                                                    </p>
                                                  )}
                                                </div>
                                                <span className="font-bold text-amber-900 flex-shrink-0">{fmt(total)}</span>
                                              </div>
                                            );
                                          })}
                                          {l.parts.length > 1 && (
                                            <div className="flex justify-between text-xs font-bold text-amber-900 border-t border-amber-200 pt-1.5 mt-1">
                                              <span>Parts Total (incl. GST)</span>
                                              <span>{fmt(l.parts_cost)}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {l.next_service_date && (
                                      <p className="mt-2 text-xs text-blue-600 font-semibold">
                                        📆 Next service: {fmtDate(l.next_service_date)}
                                      </p>
                                    )}
                                  </div>

                                  {/* Right: cost + action */}
                                  <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 flex-shrink-0">
                                    <div className="text-right">
                                      <p className="text-lg font-bold text-slate-800">{fmt(l.total_cost)}</p>
                                      {l.labor_cost > 0 && <p className="text-xs text-slate-400">Labour: {fmt(l.labor_cost)}</p>}
                                      {l.parts_cost > 0 && <p className="text-xs text-amber-600">Parts: {fmt(l.parts_cost)}</p>}
                                      {l.other_cost > 0 && <p className="text-xs text-slate-400">Other: {fmt(l.other_cost)}</p>}
                                    </div>
                                    {has('ASSET_MAINTENANCE_WRITE') && (
                                    <button onClick={() => openEditLog(l)}
                                      className="px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-colors whitespace-nowrap">
                                      Update
                                    </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Contract Modal ───────────────────────────────────────────────────── */}
      {contractModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]">
            {/* Modal header */}
            <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-5 py-4 rounded-t-2xl flex justify-between items-start flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingContract ? 'Edit Contract' : 'Add Contract'}
                </h3>
                <p className="text-sm text-teal-200 mt-0.5">{selected?.asset_name} · {selected?.asset_code}</p>
              </div>
              <button onClick={() => setContractModal(false)}
                className="text-white/60 hover:text-white text-xl leading-none mt-0.5 transition-colors">✕</button>
            </div>

            <form onSubmit={handleContractSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {saveErr && (
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <span>⚠</span> {saveErr}
                  </div>
                )}

                {/* Type + Contract# */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Contract Type <span className="text-red-500">*</span></label>
                    <select value={contractForm.contract_type} onChange={setC('contract_type')} className={inputCls}>
                      {CONTRACT_TYPES.map(t => <option key={t.code} value={t.code}>{t.label} — {t.full}</option>)}
                    </select>
                    {selectedContractMeta && (
                      <p className="mt-1 text-xs text-slate-400">{selectedContractMeta.full}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Contract / Reference Number</label>
                    <input value={contractForm.contract_number} onChange={setC('contract_number')} className={inputCls} placeholder="e.g. AMC-2024-001" />
                  </div>
                </div>

                {/* Vendor */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Vendor / Service Provider <span className="text-red-500">*</span></label>
                    <input value={contractForm.vendor_name} onChange={setC('vendor_name')} className={inputCls} placeholder="Company name" />
                  </div>
                  <div>
                    <label className={labelCls}>Contact Person</label>
                    <input value={contractForm.vendor_contact} onChange={setC('vendor_contact')} className={inputCls} placeholder="Name / Phone" />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input type="email" value={contractForm.vendor_email} onChange={setC('vendor_email')} className={inputCls} placeholder="vendor@email.com" />
                  </div>
                </div>

                {/* Dates + Value */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Commencement Date <span className="text-red-500">*</span></label>
                    <input type="date" value={contractForm.start_date} onChange={setC('start_date')} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Expiry Date <span className="text-red-500">*</span></label>
                    <input type="date" value={contractForm.end_date} onChange={setC('end_date')} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Contract Value (₹) <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">₹</span>
                      <input type="number" min="0" step="0.01" value={contractForm.contract_value} onChange={setC('contract_value')}
                        className={`${inputCls} pl-7`} placeholder="0" />
                    </div>
                  </div>
                </div>

                {/* SLA terms */}
                <div className={`rounded-xl border p-4 space-y-3 ${isSLA ? 'border-violet-200 bg-violet-50' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`text-xs font-bold uppercase tracking-wide ${isSLA ? 'text-violet-700' : 'text-slate-500'}`}>
                    SLA / Uptime Terms {isSLA ? '(Required for SLA)' : '(Optional)'}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      ['response_time_hours',   'Response Time (hrs)',        'e.g. 4'],
                      ['resolution_time_hours', 'Resolution Time (hrs)',      'e.g. 24'],
                      ['uptime_guarantee_pct',  'Uptime Guarantee (%)',       'e.g. 99.5'],
                      ['penalty_per_hour',      'Penalty/hr downtime (₹)',   '0'],
                    ].map(([f, lbl, ph]) => (
                      <div key={f}>
                        <label className={labelCls}>{lbl}</label>
                        <input type="number" min="0" value={contractForm[f]} onChange={setC(f)} className={inputCls} placeholder={ph} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Coverage + Visits */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Preventive Maintenance Visits / Year</label>
                    <input type="number" min="0" value={contractForm.preventive_visits_yr} onChange={setC('preventive_visits_yr')} className={inputCls} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelCls}>Coverage Flags</label>
                    <div className="flex flex-wrap gap-3 pt-2">
                      {[
                        ['labor_included', 'Labour'],
                        ['parts_included', 'Parts'],
                        ['onsite_support', 'Onsite'],
                        ['remote_support', 'Remote'],
                      ].map(([f, lbl]) => (
                        <label key={f} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input type="checkbox" checked={!!contractForm[f]} onChange={setC(f)} className="accent-teal-600 w-4 h-4 rounded" />
                          {lbl}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Scope + Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Coverage Scope</label>
                    <textarea value={contractForm.coverage_scope} onChange={setC('coverage_scope')} rows={2}
                      className={inputCls} placeholder="What is covered…" />
                  </div>
                  <div>
                    <label className={labelCls}>Notes</label>
                    <textarea value={contractForm.notes} onChange={setC('notes')} rows={2}
                      className={inputCls} placeholder="Additional notes…" />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 rounded-b-2xl flex-shrink-0">
                <button type="button" onClick={() => setContractModal(false)}
                  className="px-5 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-6 py-2 text-sm font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 shadow-sm transition-colors">
                  {saving ? 'Saving…' : editingContract ? 'Update Contract' : 'Add Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Maintenance Log Modal ────────────────────────────────────────────── */}
      {logModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col" style={{ maxHeight: '96vh' }}>

            {/* Modal header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4 rounded-t-2xl flex justify-between items-start flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingLog ? 'Update Maintenance Record' : 'Log Maintenance Event'}
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">{selected?.asset_name} · {selected?.asset_code}</p>
              </div>
              <button onClick={() => setLogModal(false)}
                className="text-white/50 hover:text-white text-xl leading-none mt-0.5 transition-colors">✕</button>
            </div>

            <form onSubmit={handleLogSubmit} className="flex flex-col flex-1 min-h-0">

              {/* ── TOP: two columns ─────────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 flex-shrink-0 border-b border-slate-200">

                {/* LEFT: event info */}
                <div className="px-4 py-3 space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Event Info</p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Type <span className="text-red-500">*</span></label>
                      <select value={logForm.maintenance_type} onChange={setL('maintenance_type')} className={logInputCls}>
                        {MAINT_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Status</label>
                      <select value={logForm.status} onChange={setL('status')} className={logInputCls}>
                        {MAINT_STATUSES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Ref / WO #</label>
                      <input value={logForm.reference_number} onChange={setL('reference_number')} className={logInputCls} placeholder="WO-001" />
                    </div>
                    <div>
                      <label className={labelCls}>Contract</label>
                      <select value={logForm.contract_id} onChange={setL('contract_id')} className={logInputCls}>
                        <option value="">— None —</option>
                        {contracts.map(c => {
                          const ct = CONTRACT_TYPES.find(t => t.code === c.contract_type);
                          return <option key={c.id} value={c.id}>{ct?.label} · {c.vendor_name}</option>;
                        })}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={labelCls}>Reported <span className="text-red-500">*</span></label>
                      <input type="date" value={logForm.reported_date} onChange={setL('reported_date')} className={logInputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Completed</label>
                      <input type="date" value={logForm.completion_date} onChange={setL('completion_date')} className={logInputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Next Service</label>
                      <input type="date" value={logForm.next_service_date} onChange={setL('next_service_date')} className={logInputCls} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className={labelCls}>Technician</label>
                      <input value={logForm.technician_name} onChange={setL('technician_name')} className={logInputCls} placeholder="Engineer name" />
                    </div>
                    <div>
                      <label className={labelCls}>Downtime (h)</label>
                      <input type="number" min="0" step="0.5" value={logForm.downtime_hours} onChange={setL('downtime_hours')} className={logInputCls} placeholder="0" />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Service Vendor</label>
                    <input value={logForm.vendor_name} onChange={setL('vendor_name')} className={logInputCls} placeholder="Vendor / company" />
                  </div>
                </div>

                {/* RIGHT: notes + costs */}
                <div className="px-4 py-3 space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Notes & Costs</p>

                  <div>
                    <label className={labelCls}>Problem Description</label>
                    <textarea value={logForm.problem_description} onChange={setL('problem_description')}
                      className={`${logInputCls} resize-none`} rows={2} placeholder="Describe the fault or issue reported…" />
                  </div>
                  <div>
                    <label className={labelCls}>Work Performed</label>
                    <textarea value={logForm.work_performed} onChange={setL('work_performed')}
                      className={`${logInputCls} resize-none`} rows={2} placeholder="Actions taken, repairs done…" />
                  </div>
                  <div>
                    <label className={labelCls}>Observations</label>
                    <textarea value={logForm.observations} onChange={setL('observations')}
                      className={`${logInputCls} resize-none`} rows={1} placeholder="Findings, next steps…" />
                  </div>

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className={labelCls}>Labour (₹)</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-2 flex items-center text-slate-400 text-xs">₹</span>
                        <input type="number" min="0" step="0.01" value={logForm.labor_cost} onChange={setL('labor_cost')}
                          className={`${logInputCls} pl-5`} placeholder="0" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className={labelCls}>Other (₹)</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-2 flex items-center text-slate-400 text-xs">₹</span>
                        <input type="number" min="0" step="0.01" value={logForm.other_cost} onChange={setL('other_cost')}
                          className={`${logInputCls} pl-5`} placeholder="0" />
                      </div>
                    </div>
                    <div className="shrink-0">
                      <div className="bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-0.5 flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-xs text-teal-500 font-medium">Sub:</span>
                        <span className="text-xs font-bold text-teal-800">
                          {fmt((parseFloat(logForm.labor_cost)||0) + (parseFloat(logForm.other_cost)||0))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {saveErr && (
                    <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      ⚠ {saveErr}
                    </div>
                  )}
                </div>
              </div>

              {/* ── BOTTOM: spare parts ──────────────────────────────────── */}
              <div className="flex flex-col flex-1 min-h-0">

                {/* Parts header */}
                <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🔩</span>
                    <div>
                      <p className="text-xs font-bold text-amber-900">Spare Parts Used</p>
                      <p className="text-xs text-amber-500">Cost + GST auto-adds to lifecycle</p>
                    </div>
                  </div>
                  <button type="button" onClick={addPart}
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm transition-colors">
                    + Add Part
                  </button>
                </div>

                {/* Column headers + rows (horizontal scroll on mobile) */}
                <div className="flex-1 overflow-y-auto overflow-x-auto bg-white flex flex-col min-h-0">
                  <div className="min-w-[580px]">
                    {logForm.parts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <span className="text-3xl mb-2">📦</span>
                        <p className="text-sm font-semibold text-amber-700">No spare parts yet</p>
                        <p className="text-xs text-amber-400 mt-0.5">Click <strong>+ Add Part</strong> to record components used</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs font-bold text-amber-700 sticky top-0"
                          style={{ gridTemplateColumns: '80px 1fr 60px 90px 58px 70px 80px 26px', gap: '6px' }}>
                          <span>Part #</span>
                          <span>Part Name</span>
                          <span className="text-center">Qty</span>
                          <span className="text-right">Unit Rate (₹)</span>
                          <span className="text-center">GST%</span>
                          <span className="text-right">Base</span>
                          <span className="text-right">Total (GST)</span>
                          <span />
                        </div>
                        {logForm.parts.map((p, i) => {
                          const base   = (parseFloat(p.quantity)||0) * (parseFloat(p.unit_cost)||0);
                          const gstAmt = base * (parseFloat(p.gst_rate)||0) / 100;
                          const total  = base + gstAmt;
                          return (
                            <div key={i} className="grid px-4 py-1.5 border-b border-slate-100 items-center hover:bg-amber-50 transition-colors"
                              style={{ gridTemplateColumns: '80px 1fr 60px 90px 58px 70px 80px 26px', gap: '6px' }}>
                              <input value={p.part_code} onChange={setPart(i, 'part_code')}
                                className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent w-full font-mono"
                                placeholder="Code" />
                              <input value={p.part_name} onChange={setPart(i, 'part_name')}
                                className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent w-full"
                                placeholder="Part name *" />
                              <input type="number" min="0.01" step="0.01" value={p.quantity} onChange={setPart(i, 'quantity')}
                                className="px-1 py-1 text-xs border border-slate-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent w-full"
                                placeholder="1" />
                              <input type="number" min="0" step="0.01" value={p.unit_cost} onChange={setPart(i, 'unit_cost')}
                                className="px-1 py-1 text-xs border border-slate-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent w-full"
                                placeholder="0.00" />
                              <select value={p.gst_rate} onChange={setPart(i, 'gst_rate')}
                                className="px-1 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-center w-full">
                                {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                              </select>
                              <span className="text-xs text-slate-500 text-right font-medium">{fmt(base)}</span>
                              <div className="text-right">
                                <span className="text-xs font-bold text-amber-800">{fmt(total)}</span>
                                {gstAmt > 0 && <p className="text-amber-400 leading-none" style={{ fontSize: '9px' }}>+₹{gstAmt.toFixed(0)} GST</p>}
                              </div>
                              <button type="button" onClick={() => removePart(i)}
                                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg text-xs font-bold transition-colors">
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>

                {/* Parts totals */}
                {logForm.parts.length > 0 && (() => {
                  const baseTotal = logForm.parts.reduce((s, p) => s + (parseFloat(p.quantity)||0) * (parseFloat(p.unit_cost)||0), 0);
                  const gstTotal  = logForm.parts.reduce((s, p) => {
                    const b = (parseFloat(p.quantity)||0) * (parseFloat(p.unit_cost)||0);
                    return s + b * (parseFloat(p.gst_rate)||0) / 100;
                  }, 0);
                  return (
                    <div className="flex justify-end items-center gap-4 px-4 py-2 bg-amber-100 border-t border-amber-300 text-xs font-semibold flex-shrink-0">
                      <span className="text-amber-700">Base: <span className="font-bold">{fmt(baseTotal)}</span></span>
                      <span className="text-amber-700">GST: <span className="font-bold">{fmt(gstTotal)}</span></span>
                      <span className="text-amber-900 font-bold border-l border-amber-400 pl-4">Parts Total: {fmt(baseTotal + gstTotal)}</span>
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 flex-shrink-0">
                {(() => {
                  const labour = parseFloat(logForm.labor_cost)||0;
                  const other  = parseFloat(logForm.other_cost)||0;
                  const parts  = logForm.parts.reduce((s, p) => {
                    const b = (parseFloat(p.quantity)||0) * (parseFloat(p.unit_cost)||0);
                    return s + b * (1 + (parseFloat(p.gst_rate)||0) / 100);
                  }, 0);
                  return (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Labour: <span className="font-bold text-slate-700">{fmt(labour)}</span></span>
                      <span>Parts (incl. GST): <span className="font-bold text-amber-700">{fmt(parts)}</span></span>
                      <span>Other: <span className="font-bold text-slate-700">{fmt(other)}</span></span>
                      <span className="text-sm font-bold text-slate-800 border-l border-slate-300 pl-4">
                        Total: {fmt(labour + parts + other)}
                      </span>
                    </div>
                  );
                })()}
                <div className="flex gap-2 flex-shrink-0">
                  <button type="button" onClick={() => setLogModal(false)}
                    className="px-5 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving}
                    className="px-6 py-2 text-sm font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 shadow-sm transition-colors">
                    {saving ? 'Saving…' : editingLog ? 'Update Record' : 'Save Record'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetMaintenance;
