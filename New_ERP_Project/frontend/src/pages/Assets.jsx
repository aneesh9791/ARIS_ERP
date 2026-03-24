import { useState, useEffect, useCallback } from 'react';

const AUTH_HEADER = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const fmt = (v) =>
  v != null ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';

const CATEGORIES = [
  { code: 'FA_MED_NEW',    label: 'Medical – New',    color: 'blue',   icon: '🩻' },
  { code: 'FA_MED_REFURB', label: 'Medical – Refurb', color: 'teal',   icon: '🔧' },
  { code: 'FA_IT',         label: 'IT Equipment',     color: 'violet', icon: '🖥️' },
  { code: 'FA_FURNITURE',  label: 'Furniture',        color: 'amber',  icon: '🪑' },
  { code: 'FA_VEHICLE',    label: 'Vehicles',         color: 'orange', icon: '🚗' },
  { code: 'FA_CIVIL',      label: 'Civil & Infra',    color: 'slate',  icon: '🏗️' },
  { code: 'FA_SOFTWARE',   label: 'Software',         color: 'indigo', icon: '💾' },
  { code: 'FA_APPLIANCE',  label: 'Appliances',       color: 'green',  icon: '⚡' },
];

const CAT_COLORS = {
  blue:   { tab: 'bg-blue-600 text-white',    badge: 'bg-blue-100 text-blue-700' },
  teal:   { tab: 'bg-teal-600 text-white',    badge: 'bg-teal-100 text-teal-700' },
  violet: { tab: 'bg-violet-600 text-white',  badge: 'bg-violet-100 text-violet-700' },
  amber:  { tab: 'bg-amber-500 text-white',   badge: 'bg-amber-100 text-amber-700' },
  orange: { tab: 'bg-orange-500 text-white',  badge: 'bg-orange-100 text-orange-700' },
  slate:  { tab: 'bg-slate-600 text-white',   badge: 'bg-slate-100 text-slate-700' },
  indigo: { tab: 'bg-indigo-600 text-white',  badge: 'bg-indigo-100 text-indigo-700' },
  green:  { tab: 'bg-green-600 text-white',   badge: 'bg-green-100 text-green-700' },
};

const STATUS_COLORS = {
  ACTIVE:             'bg-green-100 text-green-700',
  UNDER_MAINTENANCE:  'bg-orange-100 text-orange-700 border border-orange-300',
  DISPOSED:           'bg-red-100 text-red-700',
};
const STATUS_LABELS = {
  ACTIVE: 'Active', UNDER_MAINTENANCE: '⚠ Maintenance', DISPOSED: 'Disposed',
};

// Maps item_category L1 code → asset_type (now the same value — L1 code IS the asset_type)
const L1_TO_ASSET_TYPE = {
  FA_MED_NEW:    'FA_MED_NEW',
  FA_MED_REFURB: 'FA_MED_REFURB',
  FA_IT:         'FA_IT',
  FA_FURNITURE:  'FA_FURNITURE',
  FA_APPLIANCE:  'FA_APPLIANCE',
  FA_VEHICLE:    'FA_VEHICLE',
  FA_CIVIL:      'FA_CIVIL',
  FA_SOFTWARE:   'FA_SOFTWARE',
};

const EMPTY_FORM = {
  asset_name: '', asset_type: 'FA_MED_NEW', center_id: '',
  manufacturer: '', model: '', serial_number: '',
  condition: 'NEW', purchase_date: '', purchase_cost: '',
  salvage_value: '', status: 'ACTIVE', notes: '',
  grn_id: '', grn_item_id: '',
  item_category_id: null,
  coa_account_id: null,
  linked_item_id: '',
};

const inputCls = (err) =>
  `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${err ? 'border-red-400 bg-red-50' : 'border-slate-300'}`;

// ── Depreciation bar ────────────────────────────────────────────────────────
const DeprecBar = ({ asset }) => {
  const pct = asset.acquisition_value > 0
    ? Math.min(100, Math.round(((asset.acquisition_value - asset.book_value) / asset.acquisition_value) * 100))
    : 0;
  const color = pct >= 80 ? 'bg-red-400' : pct >= 50 ? 'bg-orange-400' : 'bg-teal-400';
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">{pct}%</span>
    </div>
  );
};

// ── Main component ──────────────────────────────────────────────────────────
const Assets = () => {
  const [assets,        setAssets]        = useState([]);
  const [centers,       setCenters]       = useState([]);
  const [activeTab,       setActiveTab]       = useState('ALL');
  const [centerFilter,    setCenterFilter]    = useState('');
  const [statusFilter,    setStatusFilter]    = useState('');
  const [incompleteOnly,  setIncompleteOnly]  = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const [editing,       setEditing]       = useState(null);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [errors,        setErrors]        = useState({});
  const [saving,        setSaving]        = useState(false);
  const [submitError,   setSubmitError]   = useState('');
  const [success,       setSuccess]       = useState('');
  const [grnItems, setGrnItems] = useState([]);
  const [fixedAssetTree, setFixedAssetTree] = useState([]);
  const [selectedL1Id, setSelectedL1Id] = useState(null);  // UI-only L1 picker state
  const [faItems, setFaItems] = useState([]);               // item master items for selected L2
  // Dispose modal
  const [disposeModal,   setDisposeModal]   = useState(false);
  const [disposeAsset,   setDisposeAsset]   = useState(null);
  const [disposeForm,    setDisposeForm]    = useState({ disposal_date: '', sale_proceeds: '', notes: '' });
  const [disposeError,   setDisposeError]   = useState('');
  const [disposeSaving,  setDisposeSaving]  = useState(false);
  const [disposeResult,  setDisposeResult]  = useState(null);

  // ── Fetch meta (centers + categories + FA tree) ────────────────────────────
  const fetchMeta = useCallback(async () => {
    try {
      const [metaRes, treeRes] = await Promise.all([
        fetch('/api/asset-management/meta', { headers: AUTH_HEADER() }),
        fetch('/api/item-categories/tree', { headers: AUTH_HEADER() }),
      ]);
      if (metaRes.ok) {
        const data = await metaRes.json();
        setCenters(data.centers || []);
      }
      if (treeRes.ok) {
        const treeData = await treeRes.json();
        setFixedAssetTree(treeData.tree?.FIXED_ASSET || []);
      }
    } catch (_e) { /* non-critical */ }
  }, []);

  // ── Fetch assets ──────────────────────────────────────────────────────────
  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'ALL') params.set('category', activeTab);
      if (centerFilter)        params.set('center_id', centerFilter);
      if (statusFilter)        params.set('status', statusFilter);
      const res = await fetch(`/api/asset-management?${params}`, { headers: AUTH_HEADER() });
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } catch (_e) { /* ignore */ } finally {
      setLoading(false);
    }
  }, [activeTab, centerFilter, statusFilter]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchAssets(); }, [fetchAssets]);
  useEffect(() => {
    fetch('/api/grn/pending-capitalisation', { headers: AUTH_HEADER() })
      .then(r => r.json()).then(d => setGrnItems(d.items || [])).catch(() => {});
  }, []);

  // ── Fetch item master items when sub-category changes ─────────────────────
  const fetchFaItems = async (categoryId) => {
    if (!categoryId) { setFaItems([]); return; }
    try {
      const res = await fetch(
        `/api/item-master?item_type=FIXED_ASSET&category_id=${categoryId}&active=true`,
        { headers: AUTH_HEADER() }
      );
      if (res.ok) { const d = await res.json(); setFaItems(d.items || []); }
    } catch (_e) { setFaItems([]); }
  };

  // ── Derive L1 node from tree given a category_id ───────────────────────────
  const findL1ForCatId = (catId) =>
    fixedAssetTree.find(l1 =>
      l1.id === catId || (l1.children || []).some(c => c.id === catId)
    ) || null;

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setSelectedL1Id(null);
    setFaItems([]);
    setErrors({}); setSubmitError(''); setEditing(null); setShowModal(true);
  };

  const openEdit = (a) => {
    const l1 = a.item_category_id ? findL1ForCatId(a.item_category_id) : null;
    setSelectedL1Id(l1?.id ?? null);
    if (a.item_category_id) fetchFaItems(a.item_category_id);
    setForm({
      asset_name:       a.asset_name,
      asset_type:       a.category_code,
      center_id:        a.center_id ?? null,
      manufacturer:     a.manufacturer || '',
      model:            a.model        || '',
      serial_number:    a.serial_number || '',
      condition:        a.condition    || 'NEW',
      purchase_date:    a.acquisition_date?.split('T')[0] || '',
      purchase_cost:    a.acquisition_value ?? '',
      salvage_value:    a.salvage_value ?? '',
      status:           a.status || 'ACTIVE',
      notes:            a.notes  || '',
      grn_id:           a.grn_id      ? String(a.grn_id)      : '',
      grn_item_id:      a.grn_item_id ? String(a.grn_item_id) : '',
      item_category_id: a.item_category_id ?? null,
      coa_account_id:   a.coa_account_id   ?? null,
      linked_item_id:   '',
    });
    setErrors({}); setSubmitError(''); setEditing(a); setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditing(null); };

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.item_category_id)  e.item_category_id = 'Select a category and sub-category';
    if (!form.asset_name.trim()) e.asset_name = 'Name is required';
    if (!form.center_id)         e.center_id  = 'Center is required';
    if (!form.grn_item_id && !editing) e.grn_item_id = 'Select a GRN item to capitalise';
    if (!form.purchase_date)     e.purchase_date = 'Acquisition date is required';
    if (form.purchase_cost === '' || isNaN(parseFloat(form.purchase_cost)))
      e.purchase_cost = 'Acquisition value is required';
    return e;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setSubmitError('');
    const payload = {
      ...form,
      purchase_cost:  parseFloat(form.purchase_cost)  || 0,
      salvage_value:  parseFloat(form.salvage_value)  || 0,
      center_id:      parseInt(form.center_id),
      grn_id:         form.grn_id      ? parseInt(form.grn_id, 10)      : null,
      grn_item_id:    form.grn_item_id ? parseInt(form.grn_item_id, 10) : null,
    };
    try {
      const url    = editing ? `/api/asset-management/${editing.id}` : '/api/asset-management';
      const method = editing ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: AUTH_HEADER(), body: JSON.stringify(payload) });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.errors?.[0]?.msg || d.error || 'Save failed');
      }
      const data = await res.json();
      if (editing) {
        setAssets(prev => prev.map(a => a.id === editing.id ? data.asset : a));
      } else {
        setAssets(prev => [...prev, data.asset]);
      }
      setSuccess(editing ? 'Asset updated.' : 'Asset added.');
      setTimeout(() => setSuccess(''), 3000);
      closeModal();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (asset) => {
    if (!window.confirm(`Delete "${asset.asset_name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/asset-management/${asset.id}`, { method: 'DELETE', headers: AUTH_HEADER() });
      if (!res.ok) throw new Error('Delete failed');
      setAssets(prev => prev.filter(a => a.id !== asset.id));
    } catch (err) { alert(err.message); }
  };

  // ── Dispose handlers ──────────────────────────────────────────────────────
  const openDispose = (asset) => {
    setDisposeAsset(asset);
    setDisposeForm({ disposal_date: new Date().toISOString().split('T')[0], sale_proceeds: '', notes: '' });
    setDisposeError('');
    setDisposeResult(null);
    setDisposeModal(true);
  };

  const closeDispose = () => { setDisposeModal(false); setDisposeAsset(null); setDisposeResult(null); };

  const handleDispose = async () => {
    if (!disposeForm.disposal_date) { setDisposeError('Disposal date is required'); return; }
    const proceeds = parseFloat(disposeForm.sale_proceeds) || 0;
    setDisposeSaving(true); setDisposeError('');
    try {
      const res = await fetch(`/api/asset-management/${disposeAsset.id}/dispose`, {
        method: 'POST',
        headers: AUTH_HEADER(),
        body: JSON.stringify({ disposal_date: disposeForm.disposal_date, sale_proceeds: proceeds, notes: disposeForm.notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Disposal failed');
      setDisposeResult(data);
      setAssets(prev => prev.map(a => a.id === disposeAsset.id ? { ...a, status: 'DISPOSED' } : a));
    } catch (err) {
      setDisposeError(err.message);
    } finally {
      setDisposeSaving(false);
    }
  };

  // ── Incomplete check ─────────────────────────────────────────────────────
  const isIncomplete = (a) => !a.serial_number || !a.manufacturer || !a.model;
  const incompleteCount = assets.filter(isIncomplete).length;
  const displayedAssets = incompleteOnly ? assets.filter(isIncomplete) : assets;

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalAcq   = assets.reduce((s, a) => s + parseFloat(a.acquisition_value || 0), 0);
  const totalBook  = assets.reduce((s, a) => s + parseFloat(a.book_value        || 0), 0);
  const countActive = assets.filter(a => a.status === 'ACTIVE').length;
  const countMaint  = assets.filter(a => a.status === 'UNDER_MAINTENANCE').length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page Header */}
      <div className="px-6 pt-4 pb-0"
        style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f766e 60%,#0d9488 100%)' }}>
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Asset Management</h1>
                <p className="text-teal-200 text-xs mt-0.5">Track assets · Depreciation · Maintenance</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {success && <span className="text-xs text-green-300 font-medium">{success}</span>}
              <button onClick={openAdd}
                className="inline-flex items-center gap-1.5 bg-white text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
                Add Asset
              </button>
            </div>
          </div>

          {/* Single tab — Asset Registry */}
          <div className="flex gap-0.5">
            <button className="px-5 py-2 text-sm font-semibold rounded-t-xl"
              style={{ background: '#f8fafc', color: '#0d9488' }}>
              Asset Registry
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-5 space-y-5">

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Assets',      value: assets.length,  sub: 'in current view', color: 'blue'  },
          { label: 'Acquisition Value', value: fmt(totalAcq),  sub: 'total cost',      color: 'teal'  },
          { label: 'Book Value',        value: fmt(totalBook), sub: 'after depreciation', color: 'violet' },
          { label: 'Under Maintenance', value: countMaint,    sub: `${countActive} active`, color: 'orange' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{s.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Category tabs */}
        <div className="px-4 pt-4 border-b border-gray-100">
          <div className="flex flex-wrap gap-2 pb-3">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Categories
            </button>
            {CATEGORIES.map(cat => {
              const count = assets.filter(a => a.category_code === cat.code).length;
              const active = activeTab === cat.code;
              const colorKey = cat.color;
              return (
                <button
                  key={cat.code}
                  onClick={() => setActiveTab(cat.code)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    active
                      ? CAT_COLORS[colorKey].tab
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                      active ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row filter controls */}
        <div className="px-4 py-3 flex flex-wrap gap-3 items-center bg-gray-50 border-b border-gray-100">
          <select
            value={centerFilter}
            onChange={e => setCenterFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            <option value="">All Centers</option>
            {centers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="UNDER_MAINTENANCE">Under Maintenance</option>
            <option value="DISPOSED">Disposed</option>
          </select>
          <button
            onClick={() => setIncompleteOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              incompleteOnly
                ? 'bg-amber-500 text-white border-amber-500'
                : incompleteCount > 0
                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-default'
            }`}
            disabled={incompleteCount === 0}
          >
            ⚠ Needs Completion
            {incompleteCount > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${incompleteOnly ? 'bg-white/30' : 'bg-amber-200 text-amber-800'}`}>
                {incompleteCount}
              </span>
            )}
          </button>
          <span className="text-xs text-gray-400 ml-auto">
            {displayedAssets.length} asset{displayedAssets.length !== 1 ? 's' : ''} shown
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">Loading assets…</div>
          ) : displayedAssets.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-400 text-sm">No assets found.</p>
              <button onClick={openAdd} className="mt-3 text-teal-600 text-sm font-medium hover:underline">
                + Add the first asset
              </button>
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Code','Asset Name','Category','Center','Condition','Acquired','Acq. Value','Book Value','Depreciation','Status','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedAssets.map(a => {
                  const cat   = CATEGORIES.find(c => c.code === a.category_code);
                  const color = cat ? CAT_COLORS[cat.color].badge : 'bg-gray-100 text-gray-600';
                  const fullyDepr = parseFloat(a.book_value) <= parseFloat(a.salvage_value || 0);
                  const incomplete = isIncomplete(a);
                  return (
                    <tr key={a.id} className={`transition-colors ${
                      a.status === 'UNDER_MAINTENANCE' ? 'bg-orange-50 border-l-4 border-l-orange-400' :
                      incomplete ? 'bg-amber-50 border-l-4 border-l-amber-400 hover:bg-amber-100' :
                      'hover:bg-gray-50'
                    }`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                          {a.asset_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{a.asset_name}</span>
                          {incomplete && (
                            <span title="Missing serial number, manufacturer or model — click Edit to complete"
                              className="flex-shrink-0 text-xs bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded font-semibold">
                              ⚠ Incomplete
                            </span>
                          )}
                        </div>
                        {a.manufacturer
                          ? <div className="text-xs text-gray-400 truncate">{a.manufacturer}{a.model ? ` · ${a.model}` : ''}</div>
                          : <div className="text-xs text-amber-500 truncate">No manufacturer / model / SN</div>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
                          {cat?.icon} {cat?.label || a.category_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[140px] truncate">
                        {a.center_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.condition === 'NEW' ? 'bg-blue-50 text-blue-600' : 'bg-yellow-50 text-yellow-700'
                        }`}>
                          {a.condition === 'NEW' ? 'New' : 'Refurbished'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {a.acquisition_date ? new Date(a.acquisition_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-800 text-xs font-medium whitespace-nowrap">
                        {fmt(a.acquisition_value)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {fullyDepr ? (
                          <span className="text-xs text-gray-400 font-medium">Fully depreciated</span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-800">{fmt(a.book_value)}</span>
                        )}
                        <div className="text-xs text-gray-400 mt-0.5">
                          {a.years_elapsed}y / {a.useful_life_years}y
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <DeprecBar asset={a} />
                        <div className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
                          {fmt(a.annual_depreciation)}/yr
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[a.status] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[a.status] || a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {a.grn_number && (
                            <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded font-mono font-medium w-fit">
                              {a.grn_number}
                            </span>
                          )}
                          <div className="flex gap-3">
                            <button onClick={() => openEdit(a)} className="text-teal-600 hover:text-teal-800 text-xs font-medium">Edit</button>
                            {a.status !== 'DISPOSED' && (
                              <button onClick={() => openDispose(a)} className="text-orange-500 hover:text-orange-700 text-xs font-medium">Dispose</button>
                            )}
                            <button onClick={() => handleDelete(a)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h3 className="text-base font-semibold text-gray-800">
                {editing ? `Edit Asset — ${editing.asset_code}` : 'Add New Asset'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {submitError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {submitError}
                  </p>
                )}

                {/* ── Category (L1) + Sub-Category (L2) ── replaces old asset_type dropdown */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedL1Id ?? ''}
                      onChange={e => {
                        const l1id = e.target.value ? parseInt(e.target.value, 10) : null;
                        setSelectedL1Id(l1id);
                        setFaItems([]);
                        setForm(prev => ({ ...prev, item_category_id: null, coa_account_id: null, asset_type: 'MODALITY' }));
                      }}
                      className={inputCls(errors.item_category_id)}
                    >
                      <option value="">— Select category —</option>
                      {fixedAssetTree.map(l1 => (
                        <option key={l1.id} value={l1.id}>{l1.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sub-Category <span className="text-red-500">*</span>
                    </label>
                    {(() => {
                      const l1node = fixedAssetTree.find(l => l.id === selectedL1Id);
                      const l2list = l1node?.children?.length ? l1node.children : (l1node ? [l1node] : []);
                      return (
                        <select
                          value={form.item_category_id ?? ''}
                          disabled={!selectedL1Id}
                          onChange={e => {
                            const l2id = e.target.value ? parseInt(e.target.value, 10) : null;
                            const l1node2 = fixedAssetTree.find(l => l.id === selectedL1Id);
                            const selNode = l2list.find(c => c.id === l2id) || l1node2;
                            const derivedType = L1_TO_ASSET_TYPE[l1node2?.code] || 'EQUIPMENT';
                            setForm(prev => ({
                              ...prev,
                              item_category_id: l2id,
                              coa_account_id:   selNode?.asset_gl_id || null,
                              asset_type:       derivedType,
                            }));
                            fetchFaItems(l2id);
                          }}
                          className={inputCls(errors.item_category_id)}
                        >
                          <option value="">— Select sub-category —</option>
                          {l2list.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      );
                    })()}
                    {errors.item_category_id && <p className="mt-1 text-xs text-red-500">{errors.item_category_id}</p>}
                  </div>
                </div>

                {/* COA + useful life info when sub-category is selected */}
                {form.item_category_id && (() => {
                  const l1node = fixedAssetTree.find(l => l.id === selectedL1Id);
                  const l2node = (l1node?.children || []).find(c => c.id === form.item_category_id) || l1node;
                  const life   = l2node?.useful_life_years || l1node?.useful_life_years;
                  const glCode = l2node?.asset_gl_code || l1node?.asset_gl_code;
                  const glName = l2node?.asset_gl_name || l1node?.asset_gl_name;
                  return (
                    <div className="flex items-center gap-4 px-3 py-2 bg-teal-50 border border-teal-100 rounded-lg text-xs">
                      {glCode && (
                        <span className="text-teal-700">
                          <span className="font-semibold">GL:</span> {glCode} — {glName}
                        </span>
                      )}
                      {life && (
                        <span className="text-violet-700 font-semibold">
                          Useful life: {life} yrs (SLM)
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Item Master picker — optional, filters to selected sub-category */}
                {faItems.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Link to Item Master
                      <span className="text-xs text-gray-400 font-normal ml-1">optional — auto-fills name</span>
                    </label>
                    <select
                      value={form.linked_item_id}
                      onChange={e => {
                        const item = faItems.find(i => String(i.id) === e.target.value);
                        setForm(prev => ({
                          ...prev,
                          linked_item_id: e.target.value,
                          ...(item ? { asset_name: item.item_name } : {}),
                        }));
                      }}
                      className={inputCls()}
                    >
                      <option value="">— Pick from registered items —</option>
                      {faItems.map(i => (
                        <option key={i.id} value={String(i.id)}>{i.item_code} — {i.item_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Center */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Center <span className="text-red-500">*</span>
                  </label>
                  <select value={form.center_id} onChange={e => setForm(prev => ({ ...prev, center_id: parseInt(e.target.value) || '' }))} className={inputCls(errors.center_id)}>
                    <option value="">— Select center —</option>
                    {centers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {errors.center_id && <p className="mt-1 text-xs text-red-500">{errors.center_id}</p>}
                </div>

                {/* GRN Item — required for new assets */}
                {!editing && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      GRN Item to Capitalise <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.grn_item_id}
                      onChange={e => {
                        const itemId = e.target.value;
                        const gi = grnItems.find(i => String(i.grn_item_id) === itemId);
                        if (gi) {
                          // Resolve L1 node from tree using parent_id (or category_id if root)
                          const l1id = gi.cat_parent_id || gi.category_id || null;
                          const l1node = fixedAssetTree.find(l => l.id === l1id);
                          const l2node = l1node?.children?.find(c => c.id === gi.category_id) || l1node;
                          const assetType = L1_TO_ASSET_TYPE[l1node?.code] || gi.cat_code || 'FA_MED_NEW';
                          const condition = gi.cat_code?.includes('REFURB') ? 'REFURBISHED' : 'NEW';
                          setSelectedL1Id(l1id);
                          if (gi.category_id) fetchFaItems(gi.category_id);
                          setForm(prev => ({
                            ...prev,
                            grn_item_id:      String(gi.grn_item_id),
                            grn_id:           String(gi.grn_id),
                            asset_name:       gi.item_name,
                            asset_type:       assetType,
                            center_id:        gi.center_id,
                            purchase_date:    gi.receipt_date?.split('T')[0] || prev.purchase_date,
                            purchase_cost:    String(parseFloat(gi.unit_rate || 0).toFixed(2)),
                            item_category_id: gi.category_id || null,
                            coa_account_id:   l2node?.asset_gl_id || null,
                            condition,
                            linked_item_id:   gi.item_master_id ? String(gi.item_master_id) : '',
                          }));
                        } else {
                          setForm(prev => ({ ...prev, grn_item_id: '', grn_id: '' }));
                        }
                      }}
                      className={inputCls(errors.grn_item_id)}
                    >
                      <option value="">— Select GRN item —</option>
                      {grnItems.map(i => (
                        <option key={i.grn_item_id} value={i.grn_item_id}>
                          {i.grn_number} · {i.item_name} · Qty {i.received_qty} · {i.vendor_name}
                        </option>
                      ))}
                    </select>
                    {errors.grn_item_id && <p className="mt-1 text-xs text-red-500">{errors.grn_item_id}</p>}
                    {grnItems.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600">No pending fixed-asset GRN items. Post a GRN with Fixed Asset items first.</p>
                    )}
                  </div>
                )}

                {/* Asset Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Asset Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text" value={form.asset_name} onChange={set('asset_name')}
                    className={inputCls(errors.asset_name)}
                    placeholder="e.g. MRI Machine 3T, Dell Workstation, Reception Desk"
                    autoFocus
                  />
                  {errors.asset_name && <p className="mt-1 text-xs text-red-500">{errors.asset_name}</p>}
                </div>

                {/* Row 2: Manufacturer + Model */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                    <input type="text" value={form.manufacturer} onChange={set('manufacturer')}
                      className={inputCls()} placeholder="e.g. Siemens, GE, Dell" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                    <input type="text" value={form.model} onChange={set('model')}
                      className={inputCls()} placeholder="Model number" />
                  </div>
                </div>

                {/* Row 3: Serial No + Condition */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                    <input type="text" value={form.serial_number} onChange={set('serial_number')}
                      className={inputCls()} placeholder="Serial / asset tag" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Condition <span className="text-red-500">*</span>
                    </label>
                    <select value={form.condition} onChange={set('condition')} className={inputCls()}>
                      <option value="NEW">New</option>
                      <option value="REFURBISHED">Refurbished</option>
                    </select>
                  </div>
                </div>

                {/* Row 4: Acquisition Date + Value */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Acquisition Date <span className="text-red-500">*</span>
                    </label>
                    <input type="date" value={form.purchase_date} onChange={set('purchase_date')}
                      className={inputCls(errors.purchase_date)} max={new Date().toISOString().split('T')[0]} />
                    {errors.purchase_date && <p className="mt-1 text-xs text-red-500">{errors.purchase_date}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Acquisition Value (₹) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm">₹</span>
                      <input type="number" min="0" step="0.01" value={form.purchase_cost} onChange={set('purchase_cost')}
                        className={`${inputCls(errors.purchase_cost)} pl-7`} placeholder="0" />
                    </div>
                    {errors.purchase_cost && <p className="mt-1 text-xs text-red-500">{errors.purchase_cost}</p>}
                  </div>
                </div>

                {/* Row 5: Salvage Value + Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Salvage Value (₹)
                      <span className="text-xs text-gray-400 font-normal ml-1">optional, default ₹0</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm">₹</span>
                      <input type="number" min="0" step="0.01" value={form.salvage_value} onChange={set('salvage_value')}
                        className={`${inputCls()} pl-7`} placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={form.status} onChange={set('status')} className={inputCls()}>
                      <option value="ACTIVE">Active</option>
                      <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea value={form.notes} onChange={set('notes')} rows={2}
                    className={inputCls()} placeholder="Any additional notes about this asset…" />
                </div>
              </div>

              {/* Footer — outside scroll area so always visible */}
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0 bg-gray-50 rounded-b-xl">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium">
                  {saving ? 'Saving…' : editing ? 'Update Asset' : 'Add Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>

      {/* Dispose Modal */}
      {disposeModal && disposeAsset && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Dispose Asset</h3>
                <p className="text-xs text-gray-400 mt-0.5">{disposeAsset.asset_code} — {disposeAsset.asset_name}</p>
              </div>
              <button onClick={closeDispose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {disposeResult ? (
              <div className="p-6 space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm space-y-2">
                  <p className="font-semibold text-green-700">Asset disposed successfully</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-green-800">
                    <span className="text-gray-500">Book Value</span>
                    <span className="font-medium text-right">{fmt(disposeResult.book_value)}</span>
                    <span className="text-gray-500">Sale Proceeds</span>
                    <span className="font-medium text-right">{fmt(disposeResult.sale_proceeds)}</span>
                    <span className="text-gray-500">
                      {(disposeResult.sale_proceeds - disposeResult.book_value) >= 0 ? 'Gain on Disposal' : 'Loss on Disposal'}
                    </span>
                    <span className={`font-semibold text-right ${(disposeResult.sale_proceeds - disposeResult.book_value) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmt(Math.abs(disposeResult.sale_proceeds - disposeResult.book_value))}
                    </span>
                    {disposeResult.je_number && (
                      <>
                        <span className="text-gray-500">Journal Entry</span>
                        <span className="font-mono font-medium text-right">{disposeResult.je_number}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={closeDispose} className="px-5 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {disposeError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{disposeError}</p>
                )}

                {/* Book value info */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                  <span className="font-semibold">Current Book Value: </span>{fmt(disposeAsset.book_value)}
                  <span className="ml-3 text-amber-600">Acq: {fmt(disposeAsset.acquisition_value)}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Disposal Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={disposeForm.disposal_date}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={e => setDisposeForm(f => ({ ...f, disposal_date: e.target.value }))}
                      className={inputCls()}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sale Proceeds (₹)
                      <span className="text-xs text-gray-400 font-normal ml-1">0 if scrapped</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm">₹</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={disposeForm.sale_proceeds}
                        onChange={e => setDisposeForm(f => ({ ...f, sale_proceeds: e.target.value }))}
                        className={`${inputCls()} pl-7`} placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={disposeForm.notes}
                    onChange={e => setDisposeForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2} className={inputCls()} placeholder="Reason for disposal, buyer name, etc."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeDispose}
                    className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={handleDispose} disabled={disposeSaving}
                    className="px-5 py-2 text-sm text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium">
                    {disposeSaving ? 'Processing…' : 'Confirm Disposal'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Assets;
