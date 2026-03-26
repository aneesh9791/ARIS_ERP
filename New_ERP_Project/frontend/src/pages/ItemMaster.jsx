import { useState, useEffect, useCallback, useMemo } from 'react';

const token = () => localStorage.getItem('token');
const hdrs  = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });
const api   = (url, opts = {}) => fetch(url, { headers: hdrs(), ...opts });

const fmtINR = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);

// ─── Constants ────────────────────────────────────────────────────────────────
const GST_RATES = [0, 5, 12, 18, 28];
const LEGACY_UOMS = ['PIECES','BOXES','BOTTLES','PACKETS','KGS','LITERS','SETS','COVER','KIT'];

const ITEM_TYPES = [
  { value: 'STOCK',       label: 'Stock Item',          desc: 'Inventory tracked',        catType: 'STOCK',       color: 'emerald', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { value: 'EXPENSE',     label: 'Expense & Service',   desc: 'Services & consumables',   catType: 'EXPENSE',     color: 'blue',    icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { value: 'FIXED_ASSET', label: 'Fixed Asset',         desc: 'Capital equipment',        catType: 'FIXED_ASSET', color: 'purple',  icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18' },
];


const TYPE_BADGE_CLS = {
  STOCK:       'bg-emerald-100 text-emerald-700',
  EXPENSE:     'bg-blue-100 text-blue-700',
  FIXED_ASSET: 'bg-purple-100 text-purple-700',
};
const TYPE_LABEL = {
  STOCK: 'Stock', EXPENSE: 'Expense & Service', FIXED_ASSET: 'Fixed Asset',
};


// ─── Shared UI ────────────────────────────────────────────────────────────────
const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500';
const sel = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white';

const TypeBadge = ({ type }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE_CLS[type] || 'bg-slate-100 text-slate-600'}`}>
    {TYPE_LABEL[type] || type}
  </span>
);

const StatCard = ({ label, value, sub, color }) => {
  const cls = {
    teal:    'bg-teal-50    border-teal-100    text-teal-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    blue:    'bg-blue-50    border-blue-100    text-blue-700',
    purple:  'bg-purple-50  border-purple-100  text-purple-700',
    slate:   'bg-slate-50   border-slate-200   text-slate-700',
  }[color] || 'bg-slate-50 border-slate-200 text-slate-700';
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-0.5 opacity-60">{sub}</p>}
    </div>
  );
};


// ─── Sub-Category picker with COA preview ────────────────────────────────────
// The three item-type tabs (Stock / Expense / Fixed Asset) are the main category.
// This shows only the L2 sub-categories for the active type, grouped by L1 parent.
const CategorySelect = ({ value, onChange, categories, itemType }) => {
  const procCats = categories.filter(c => c.show_in_item_master !== false && c.item_type === itemType);

  // Build L1 → L2 tree
  const l1Map = {};
  const l1s   = [];
  for (const c of procCats) {
    if (c.level === 1) { const node = { ...c, children: [] }; l1s.push(node); l1Map[c.id] = node; }
  }
  for (const c of procCats) {
    if (c.level === 2 && l1Map[c.parent_id]) l1Map[c.parent_id].children.push(c);
  }

  const selected = categories.find(c => c.id === parseInt(value));

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Sub-Category <span className="text-red-500">*</span>
        </label>
        <select value={value || ''} onChange={e => {
          const id = e.target.value;
          const node = categories.find(c => c.id === parseInt(id));
          onChange(id, node);
        }} className={sel}>
          <option value="">— Select sub-category —</option>
          {l1s.map(l1 => l1.children.length === 0 ? (
            <option key={l1.id} value={l1.id}>{l1.name}</option>
          ) : (
            <optgroup key={l1.id} label={l1.name}>
              {l1.children.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* COA preview */}
      {selected && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GL Accounts — {selected.name}</p>
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
          {selected.ap_account_code && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-orange-600 w-24 flex-shrink-0">AP Account</span>
              <span className="text-xs font-mono text-slate-700">{selected.ap_account_code}</span>
              <span className="text-xs text-slate-500 truncate">· {selected.ap_account_name}</span>
            </div>
          )}
          {!selected.asset_gl_code && !selected.expense_gl_code && !selected.ap_account_code && (
            <p className="text-xs text-amber-600">⚠ No GL accounts mapped — edit this category to link COA accounts</p>
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

// ═══════════════════════════════════════════════════════════════════════════════
// ITEM MODAL — Add / Edit
// ═══════════════════════════════════════════════════════════════════════════════
const EMPTY_ITEM = {
  item_code: '', item_name: '', item_type: 'STOCK', category_id: '',
  uom: 'PCS', gst_rate: 0, standard_rate: 0,
  reorder_level: 0, minimum_stock: 0, description: '', hsn_sac_code: '',
  consumption_uom: '', uom_conversion: 1,
};

const ItemModal = ({ item, categories, onClose, onSaved }) => {
  const [form, setForm]     = useState(item ? { ...item, category_id: item.category_id || '' } : EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setType = v => setForm(f => ({ ...f, item_type: v, category_id: '' })); // reset category when type changes

  // Default UOM for services
  useEffect(() => {
    if (form.item_type === 'SERVICE' && ['PCS','BOX','KG'].includes(form.uom)) {
      setForm(f => ({ ...f, uom: 'SESSION' }));
    }
  }, [form.item_type]);

  const submit = async () => {
    setErr('');
    if (!form.item_code.trim()) { setErr('Item code is required'); return; }
    if (!form.item_name.trim()) { setErr('Item name is required'); return; }
    if (!form.category_id)      { setErr('Category is required'); return; }
    if (!form.uom)              { setErr('Unit of measure is required'); return; }

    setSaving(true);
    try {
      const method = item ? 'PUT' : 'POST';
      const url    = item ? `/api/item-master/${item.id}` : '/api/item-master';
      const r = await api(url, {
        method,
        body: JSON.stringify({
          ...form,
          item_code:       form.item_code.trim().toUpperCase(),
          item_name:       form.item_name.trim(),
          category_id:     parseInt(form.category_id),
          gst_rate:        parseFloat(form.gst_rate)        || 0,
          standard_rate:   parseFloat(form.standard_rate)   || 0,
          reorder_level:   parseFloat(form.reorder_level)   || 0,
          minimum_stock:   parseFloat(form.minimum_stock)   || 0,
          consumption_uom: form.consumption_uom?.trim() || form.uom,
          uom_conversion:  parseFloat(form.uom_conversion)  || 1,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || d.errors?.[0]?.msg || 'Save failed'); setSaving(false); return; }
      onSaved();
    } catch { setErr('Network error'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between rounded-t-2xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
          <div>
            <p className="text-white font-bold text-sm">{item ? 'Edit Item' : 'Add Item'}</p>
            <p className="text-teal-200 text-xs mt-0.5">{item ? item.item_code : 'New entry in Item Master'}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-5 flex-1">
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

          {/* Item Type — 4-button toggle */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Item Type <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              {ITEM_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setType(t.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                    form.item_type === t.value
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400 hover:text-teal-700'
                  }`}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
                  </svg>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Code + UOM */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Item Code <span className="text-red-500">*</span></label>
              <input value={form.item_code} onChange={e => set('item_code', e.target.value)}
                disabled={!!item}
                className={`${inp} uppercase font-mono ${item ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
                placeholder="e.g. SVC-001" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Purchase UOM <span className="text-red-500">*</span></label>
              <select value={form.uom} onChange={e => set('uom', e.target.value)} className={sel}>
                <optgroup label="Physical">
                  {['PCS','BOX','BOTTLE','VIAL','ML','MG','GM','KG','LTR','ROLL','SHEET','PAIR','SET','PACKET','REAM','UNIT'].map(u =>
                    <option key={u} value={u}>{u}</option>)}
                </optgroup>
                <optgroup label="Service / Time">
                  {['HRS','SESSION','VISIT','MONTH','YEAR'].map(u =>
                    <option key={u} value={u}>{u}</option>)}
                </optgroup>
                <optgroup label="Digital / Credits">
                  {['CREDITS','STUDIES','SCANS'].map(u =>
                    <option key={u} value={u}>{u}</option>)}
                </optgroup>
                <optgroup label="Legacy">
                  {LEGACY_UOMS.map(u => <option key={u} value={u}>{u}</option>)}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Consumption UOM + Conversion Factor (shown only for STOCK items) */}
          {form.item_type === 'STOCK' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Consumption UOM</label>
                <select value={form.consumption_uom || form.uom} onChange={e => set('consumption_uom', e.target.value)} className={sel}>
                  <optgroup label="Physical">
                    {['PCS','BOX','BOTTLE','VIAL','ML','MG','GM','KG','LTR','ROLL','SHEET','PAIR','SET','PACKET','REAM','UNIT'].map(u =>
                      <option key={u} value={u}>{u}</option>)}
                  </optgroup>
                  <optgroup label="Service / Time">
                    {['HRS','SESSION','VISIT','MONTH','YEAR'].map(u =>
                      <option key={u} value={u}>{u}</option>)}
                  </optgroup>
                  <optgroup label="Digital / Credits">
                    {['CREDITS','STUDIES','SCANS'].map(u =>
                      <option key={u} value={u}>{u}</option>)}
                  </optgroup>
                  <optgroup label="Legacy">
                    {['PIECES','BOXES','BOTTLES','PACKETS','KGS','LITERS','SETS'].map(u =>
                      <option key={u} value={u}>{u}</option>)}
                  </optgroup>
                </select>
                <p className="text-xs text-slate-400 mt-1">Unit used when issuing to studies</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">UOM Conversion Factor</label>
                <input
                  type="number"
                  min="0.0001"
                  step="0.001"
                  value={form.uom_conversion || 1}
                  onChange={e => set('uom_conversion', e.target.value)}
                  className={inp}
                />
                <p className="text-xs text-slate-400 mt-1">
                  {parseFloat(form.uom_conversion) > 1
                    ? `1 ${form.uom} = ${form.uom_conversion} ${form.consumption_uom || form.uom}`
                    : `How many ${form.consumption_uom || 'consumption units'} per 1 ${form.uom}`}
                </p>
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Item / Service Name <span className="text-red-500">*</span></label>
            <input value={form.item_name} onChange={e => set('item_name', e.target.value)} className={inp}
              placeholder="e.g. MRI Scan – Brain with Contrast" />
          </div>

          {/* Category with COA preview */}
          <CategorySelect
            key={form.item_type}
            value={form.category_id}
            onChange={(v, node) => setForm(f => ({
              ...f,
              category_id: v,
              gst_rate: node?.gst_rate ?? f.gst_rate,
              hsn_sac_code: f.hsn_sac_code || node?.hsn_code || node?.sac_code || '',
            }))}
            categories={categories}
            itemType={form.item_type}
          />

          {/* Pricing */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                GST Rate %
                <span className="ml-1 font-normal text-slate-400">(from category)</span>
              </label>
              <select value={form.gst_rate} onChange={e => set('gst_rate', e.target.value)} className={sel}>
                {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Standard Rate ₹</label>
              <input type="number" min="0" step="0.01" value={form.standard_rate}
                onChange={e => set('standard_rate', e.target.value)} className={inp} />
            </div>
            {form.item_type === 'STOCK' ? (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Reorder Level</label>
                <input type="number" min="0" value={form.reorder_level}
                  onChange={e => set('reorder_level', e.target.value)} className={inp} />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  HSN / SAC Code
                  <span className="ml-1 font-normal text-slate-400">(override only)</span>
                </label>
                <input value={form.hsn_sac_code || ''} onChange={e => set('hsn_sac_code', e.target.value)}
                  className={inp} placeholder="Leave blank to use category default" />
              </div>
            )}
          </div>

          {form.item_type === 'STOCK' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Minimum Stock Level</label>
                <input type="number" min="0" value={form.minimum_stock}
                  onChange={e => set('minimum_stock', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <input value={form.description || ''} onChange={e => set('description', e.target.value)}
                  className={inp} placeholder="Optional notes" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : item ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// ITEMS TAB
// ═══════════════════════════════════════════════════════════════════════════════
const ItemsTab = ({ categories }) => {
  const [items,    setItems]   = useState([]);
  const [loading,  setLoading] = useState(true);
  const [filter,   setFilter]  = useState('ALL');
  const [search,   setSearch]  = useState('');
  const [modal,    setModal]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/api/item-master?active=all');
      const d = await r.json();
      setItems(d.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleActive = async item => {
    const action = item.active === false ? 'Reactivate' : 'Deactivate';
    if (!window.confirm(`${action} "${item.item_name}"?`)) return;
    if (item.active === false) {
      await api(`/api/item-master/${item.id}`, { method: 'PUT', body: JSON.stringify({ ...item, active: true }) });
    } else {
      await api(`/api/item-master/${item.id}`, { method: 'DELETE' });
    }
    load();
  };

  const filtered = useMemo(() => items.filter(it => {
    if (filter !== 'ALL' && it.item_type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return it.item_code?.toLowerCase().includes(q) || it.item_name?.toLowerCase().includes(q);
    }
    return true;
  }), [items, filter, search]);

  const counts = useMemo(() => ({
    total:       items.filter(i => i.active !== false).length,
    STOCK:       items.filter(i => i.item_type === 'STOCK'       && i.active !== false).length,
    EXPENSE:     items.filter(i => i.item_type === 'EXPENSE'     && i.active !== false).length,
    FIXED_ASSET: items.filter(i => i.item_type === 'FIXED_ASSET' && i.active !== false).length,
  }), [items]);

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Items"      value={counts.total}       color="teal"    />
        <StatCard label="Stock Items"      value={counts.STOCK}       color="emerald" />
        <StatCard label="Expense & Service" value={counts.EXPENSE}    color="blue"    />
        <StatCard label="Fixed Assets"     value={counts.FIXED_ASSET} color="purple"  />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {['ALL', ...ITEM_TYPES.map(t => t.value)].map(v => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === v
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {v === 'ALL' ? 'All' : TYPE_LABEL[v]}
              {v !== 'ALL' && <span className="ml-1 opacity-70">({counts[v]})</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search code or name…"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-52 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <button onClick={() => setModal('add')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            {search || filter !== 'ALL' ? 'No items match your filter.' : 'No items yet — click "+ Add Item" to get started.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">UOM</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">GST%</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(it => (
                <tr key={it.id} className={`transition-colors ${it.active === false ? 'bg-slate-50 opacity-60' : 'hover:bg-teal-50/30'}`}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{it.item_code}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate">{it.item_name}</td>
                  <td className="px-4 py-3"><TypeBadge type={it.item_type} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{it.category_name || it.l1_category_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {it.uom_conversion > 1
                      ? <span title={`1 ${it.uom} = ${it.uom_conversion} ${it.consumption_uom}`}>{it.uom} → {it.uom_conversion} {it.consumption_uom}</span>
                      : it.uom}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 text-right font-medium">{fmtINR(it.standard_rate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 text-right">{it.gst_rate}%</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 justify-end items-center">
                      {it.active === false && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-500 rounded-full">Inactive</span>
                      )}
                      <button onClick={() => setModal(it)}
                        className="px-2 py-1 text-[11px] font-semibold text-teal-600 border border-teal-200 bg-white hover:bg-teal-50 rounded-lg transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleToggleActive(it)}
                        className={`px-2 py-1 text-[11px] font-semibold border rounded-lg transition-colors ${
                          it.active === false
                            ? 'text-emerald-600 border-emerald-200 bg-white hover:bg-emerald-50'
                            : 'text-red-500 border-red-200 bg-white hover:bg-red-50'
                        }`}>
                        {it.active === false ? 'Activate' : 'Deactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <ItemModal
          item={modal === 'add' ? null : modal}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function ItemMaster() {
  const [categories, setCategories] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const catRes = await api('/api/item-categories').then(r => r.json());
      setCategories(catRes.categories || []);
    } catch (e) {
      console.error('Meta load error:', e);
    }
    setLoadingMeta(false);
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  if (loadingMeta) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading Item Master…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Item Master</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Stock items · Services · Consumables · Fixed Assets — all mapped to Chart of Accounts
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="bg-slate-100 px-2.5 py-1 rounded-full font-medium">{categories.length} categories</span>
        </div>
      </div>

      <ItemsTab categories={categories} />
    </div>
  );
}
