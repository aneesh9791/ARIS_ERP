import { useState, useEffect, useCallback } from 'react';

const token = () => localStorage.getItem('token');
const apiFetch = (path, opts = {}) => fetch(path, {
  ...opts,
  headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...opts.headers },
});

// ─── Shared styles ─────────────────────────────────────────────────────────────
const inp  = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white';
const lbl  = 'block text-xs font-medium text-slate-600 mb-1';

const TYPE_TABS = [
  { key: 'STOCK',       label: 'Stock Item',       color: 'emerald' },
  { key: 'EXPENSE',     label: 'Expense & Service', color: 'blue'    },
  { key: 'FIXED_ASSET', label: 'Fixed Asset',       color: 'purple'  },
];

const TAB_STYLE = {
  emerald: { active: 'border-emerald-600 text-emerald-700', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700', header: 'bg-emerald-50 border-emerald-200', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  blue:    { active: 'border-blue-600 text-blue-700',       dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700',       header: 'bg-blue-50 border-blue-200',       btn: 'bg-blue-600 hover:bg-blue-700'       },
  purple:  { active: 'border-purple-600 text-purple-700',   dot: 'bg-purple-500',  badge: 'bg-purple-50 text-purple-700',   header: 'bg-purple-50 border-purple-200',   btn: 'bg-purple-600 hover:bg-purple-700'   },
};

// ─── GL Badge ──────────────────────────────────────────────────────────────────
const GlBadge = ({ code, name, color = 'slate' }) => {
  if (!code) return <span className="text-slate-300 text-xs">—</span>;
  const cls = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    blue:    'bg-blue-50 text-blue-700 border-blue-100',
    orange:  'bg-orange-50 text-orange-700 border-orange-100',
    slate:   'bg-slate-100 text-slate-600 border-slate-200',
  }[color];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border rounded text-[11px] font-mono whitespace-nowrap ${cls}`} title={name}>
      {code}
    </span>
  );
};

// ─── Searchable COA Dropdown ───────────────────────────────────────────────────
function CoaSelect({ value, onChange, accounts, placeholder = '— None —' }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);

  const selected = accounts.find(a => a.id === parseInt(value));
  const filtered = accounts.filter(a => {
    if (!query) return true;
    const q = query.toLowerCase();
    return a.account_code?.toLowerCase().includes(q) || a.account_name?.toLowerCase().includes(q);
  }).slice(0, 100);

  return (
    <div className="relative" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <div
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm cursor-pointer bg-white flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[38px]"
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? <><span className="font-mono text-xs text-slate-400 mr-1.5">{selected.account_code}</span>{selected.account_name}</> : placeholder}
        </span>
        <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 flex flex-col">
          <div className="p-2 border-b border-slate-100 flex-shrink-0">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="Type account code or name…" />
          </div>
          <div className="overflow-y-auto flex-1">
            <button type="button" onMouseDown={() => { onChange(null); setOpen(false); setQuery(''); }}
              className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-50">— None —</button>
            {filtered.map(a => (
              <button key={a.id} type="button"
                onMouseDown={() => { onChange(a.id); setOpen(false); setQuery(''); }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-teal-50 ${a.id === parseInt(value) ? 'bg-teal-50 font-semibold text-teal-700' : 'text-slate-700'}`}>
                <span className="font-mono text-[10px] text-slate-400 mr-2">{a.account_code}</span>
                {a.account_name}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-xs text-slate-400 text-center">No accounts match</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Depreciation Config section (FIXED_ASSET only) ───────────────────────────
function DeprConfigSection({ assetGlId, accounts }) {
  const [cfg,     setCfg]     = useState(null);
  const [deprForm, setDeprForm] = useState({ useful_life_years: '', accum_depr_account_id: null, depr_expense_account_id: null });
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [deprErr, setDeprErr] = useState('');

  useEffect(() => {
    if (!assetGlId) { setCfg(null); return; }
    setLoading(true);
    apiFetch(`/api/finance/accounts/${assetGlId}/depreciation-config`)
      .then(r => r.json())
      .then(d => {
        if (d.config) {
          setCfg(d.config);
          setDeprForm({
            useful_life_years:       d.config.useful_life_years || '',
            accum_depr_account_id:   d.config.accum_depr_account_id   || null,
            depr_expense_account_id: d.config.depr_expense_account_id || null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assetGlId]);

  const handleSaveDepr = async () => {
    const life = parseInt(deprForm.useful_life_years);
    if (!life || life < 1 || life > 50) { setDeprErr('Useful life must be 1–50 years'); return; }
    setSaving(true); setDeprErr('');
    try {
      const r = await apiFetch(`/api/finance/accounts/${assetGlId}/depreciation-config`, {
        method: 'PUT',
        body: JSON.stringify({
          useful_life_years:       life,
          accum_depr_account_id:   deprForm.accum_depr_account_id   || null,
          depr_expense_account_id: deprForm.depr_expense_account_id || null,
        }),
      });
      const d = await r.json();
      if (!d.config) throw new Error(d.error || 'Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (ex) { setDeprErr(ex.message); }
    setSaving(false);
  };

  if (!assetGlId) return (
    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      Set an Asset GL account above to configure depreciation parameters.
    </p>
  );

  if (loading) return <p className="text-xs text-slate-400">Loading depreciation config…</p>;

  // Filter to contra-asset accounts for accumulated depr (account_code starts with 12)
  // and expense accounts for depr expense (account_code starts with 59)
  const accumAccounts   = accounts.filter(a => a.account_code?.startsWith('12') && a.normal_balance === 'credit');
  const expenseAccounts = accounts.filter(a => a.account_code?.startsWith('59'));

  return (
    <div className="border-t border-purple-200 pt-3 space-y-3">
      <p className="text-[10px] font-bold text-purple-700 uppercase tracking-widest">
        Depreciation Parameters
        {cfg && <span className="ml-2 normal-case font-normal text-purple-500">linked to {cfg.account_code} — {cfg.account_name}</span>}
      </p>
      {deprErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deprErr}</p>}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={lbl}>
            Useful Life (years)
            <span className="ml-1 text-[10px] text-purple-600 normal-case font-normal">(straight-line)</span>
          </label>
          <input type="number" min="1" max="50"
            className={inp}
            value={deprForm.useful_life_years}
            onChange={e => setDeprForm(f => ({ ...f, useful_life_years: e.target.value }))}
            placeholder="e.g. 10" />
        </div>
        <div>
          <label className={lbl}>
            Accum. Depreciation Account
            <span className="ml-1 text-[10px] text-slate-500 normal-case font-normal">(credit on run)</span>
          </label>
          <CoaSelect
            value={deprForm.accum_depr_account_id}
            onChange={v => setDeprForm(f => ({ ...f, accum_depr_account_id: v }))}
            accounts={accumAccounts}
            placeholder="— e.g. 1291 —" />
        </div>
        <div>
          <label className={lbl}>
            Depreciation Expense Account
            <span className="ml-1 text-[10px] text-slate-500 normal-case font-normal">(debit on run)</span>
          </label>
          <CoaSelect
            value={deprForm.depr_expense_account_id}
            onChange={v => setDeprForm(f => ({ ...f, depr_expense_account_id: v }))}
            accounts={expenseAccounts}
            placeholder="— e.g. 5910 —" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={handleSaveDepr} disabled={saving}
          className="px-4 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-60 transition-colors">
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Depreciation Config'}
        </button>
        {cfg?.useful_life_years && (
          <span className="text-[11px] text-slate-500">
            Current: {cfg.useful_life_years} yrs · {cfg.accum_depr_code || '—'} / {cfg.depr_expense_code || '—'}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Edit Form (inline) ────────────────────────────────────────────────────────
function EditForm({ cat, accounts, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:                 cat.name,
    asset_gl_id:          cat.asset_gl_id    || null,
    expense_gl_id:        cat.expense_gl_id  || null,
    ap_account_id:        cat.ap_account_id  || null,
    sort_order:           cat.sort_order     ?? 0,
    active:               cat.active !== false,
    show_in_item_master:  cat.show_in_item_master !== false,
    useful_life_years:    cat.useful_life_years || '',
    gst_rate:             cat.gst_rate ?? 0,
    hsn_code:             cat.hsn_code || '',
    sac_code:             cat.sac_code || '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { ...form };
      if (cat.item_type === 'FIXED_ASSET') {
        payload.useful_life_years = form.useful_life_years ? parseInt(form.useful_life_years) : null;
      }
      const r = await apiFetch(`/api/item-categories/${cat.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Save failed');
      onSave(d.category);
    } catch (ex) { setErr(ex.message); }
    setSaving(false);
  };

  const isExpense    = cat.item_type === 'EXPENSE';
  const isFixedAsset = cat.item_type === 'FIXED_ASSET';

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mt-2 space-y-4">
      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <div>
        <label className={lbl}>Category Name</label>
        <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} />
      </div>

      <div className="border-t border-teal-200 pt-3">
        <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3">Chart of Accounts Mapping</p>
        <div className="grid grid-cols-3 gap-3">
          {!isExpense && (
            <div>
              <label className={lbl}>
                Asset / Inventory GL
                <span className="ml-1 text-[10px] text-emerald-600 normal-case font-normal">(Debit on purchase)</span>
              </label>
              <CoaSelect value={form.asset_gl_id} onChange={v => set('asset_gl_id', v)} accounts={accounts} placeholder="— Asset GL —" />
            </div>
          )}
          {!isFixedAsset && (
            <div>
              <label className={lbl}>
                Expense GL
                <span className="ml-1 text-[10px] text-blue-600 normal-case font-normal">(Debit on expense/issue)</span>
              </label>
              <CoaSelect value={form.expense_gl_id} onChange={v => set('expense_gl_id', v)} accounts={accounts} placeholder="— Expense GL —" />
            </div>
          )}
          <div>
            <label className={lbl}>
              AP Account
              <span className="ml-1 text-[10px] text-orange-600 normal-case font-normal">(Credit on purchase)</span>
            </label>
            <CoaSelect value={form.ap_account_id} onChange={v => set('ap_account_id', v)} accounts={accounts} placeholder="— AP Account —" />
          </div>
        </div>
      </div>

      {isFixedAsset && (
        <div className="border-t border-teal-200 pt-3">
          <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-2">
            Useful Life Override
            <span className="ml-1.5 normal-case font-normal text-teal-500">for this category specifically</span>
          </p>
          <div className="flex items-center gap-3">
            <input type="number" min="1" max="50"
              className={`${inp} w-28`}
              value={form.useful_life_years}
              onChange={e => set('useful_life_years', e.target.value)}
              placeholder="e.g. 5" />
            <span className="text-sm text-slate-500">years</span>
            {form.useful_life_years && (
              <span className="text-xs text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded">
                {(100 / parseInt(form.useful_life_years)).toFixed(1)}% p.a. straight-line
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Overrides the COA account default. Leave blank to use the COA account's useful life.
          </p>
        </div>
      )}

      {isFixedAsset && (
        <DeprConfigSection assetGlId={form.asset_gl_id} accounts={accounts} />
      )}

      <div className="border-t border-teal-200 pt-3">
        <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3">Tax Configuration</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={lbl}>GST Rate %</label>
            <select className={inp} value={form.gst_rate}
              onChange={e => set('gst_rate', parseFloat(e.target.value))}>
              {[0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28].map(r =>
                <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>HSN Code</label>
            <input className={inp} value={form.hsn_code}
              onChange={e => set('hsn_code', e.target.value)}
              placeholder="e.g. 9022" />
          </div>
          <div>
            <label className={lbl}>SAC Code</label>
            <input className={inp} value={form.sac_code}
              onChange={e => set('sac_code', e.target.value)}
              placeholder="e.g. 9985" />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          HSN for goods, SAC for services. This rate auto-fills when creating items in this category.
        </p>
      </div>

      <div className="border-t border-teal-200 pt-3 flex items-center gap-6">
        <div>
          <label className={lbl}>Sort Order</label>
          <input type="number" min="0" className={`${inp} w-24`} value={form.sort_order}
            onChange={e => set('sort_order', parseInt(e.target.value) || 0)} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer mt-4">
          <input type="checkbox" checked={form.show_in_item_master}
            onChange={e => set('show_in_item_master', e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
          <div>
            <p className="text-xs font-medium text-slate-700">Show in Item Master</p>
            <p className="text-[11px] text-slate-400">Items can be assigned to this category</p>
          </div>
        </label>
        <label className="flex items-center gap-2 cursor-pointer mt-4">
          <input type="checkbox" checked={form.active}
            onChange={e => set('active', e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
          <div>
            <p className="text-xs font-medium text-slate-700">Active</p>
            <p className="text-[11px] text-slate-400">Show in all dropdowns</p>
          </div>
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60 transition-colors">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Add Category Form ─────────────────────────────────────────────────────────
function AddCategoryForm({ parentL1, itemType, accounts, onSave, onCancel }) {
  const [form, setForm] = useState({
    code: '', name: '',
    level:     parentL1 ? 2 : 1,
    parent_id: parentL1?.id || null,
    asset_gl_id: null, expense_gl_id: null, ap_account_id: null,
    sort_order: 0,
    show_in_item_master: true,
    useful_life_years: '',
    gst_rate: 18, hsn_code: '', sac_code: '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.code.trim()) { setErr('Code is required'); return; }
    if (!form.name.trim()) { setErr('Name is required'); return; }
    setSaving(true); setErr('');
    try {
      const r = await apiFetch('/api/item-categories', {
        method: 'POST',
        body: JSON.stringify({ ...form, item_type: itemType }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.errors?.[0]?.msg || d.error || 'Save failed');
      onSave(d.category);
    } catch (ex) { setErr(ex.message); }
    setSaving(false);
  };

  const isExpense    = itemType === 'EXPENSE';
  const isFixedAsset = itemType === 'FIXED_ASSET';

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mt-2 space-y-4">
      <p className="text-xs font-bold text-teal-700">
        {parentL1 ? `Add sub-category under "${parentL1.name}"` : `Add new category`}
      </p>
      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Code <span className="text-red-500">*</span></label>
          <input className={`${inp} uppercase font-mono`} value={form.code}
            onChange={e => set('code', e.target.value.toUpperCase())}
            placeholder="e.g. ST_MY_CAT" />
        </div>
        <div>
          <label className={lbl}>Name <span className="text-red-500">*</span></label>
          <input className={inp} value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="e.g. My Category" />
        </div>
      </div>

      <div className="border-t border-teal-200 pt-3">
        <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3">COA Mapping</p>
        <div className="grid grid-cols-3 gap-3">
          {!isExpense && (
            <div>
              <label className={lbl}>Asset / Inventory GL</label>
              <CoaSelect value={form.asset_gl_id} onChange={v => set('asset_gl_id', v)} accounts={accounts} placeholder="— Asset GL —" />
            </div>
          )}
          {!isFixedAsset && (
            <div>
              <label className={lbl}>Expense GL</label>
              <CoaSelect value={form.expense_gl_id} onChange={v => set('expense_gl_id', v)} accounts={accounts} placeholder="— Expense GL —" />
            </div>
          )}
          <div>
            <label className={lbl}>AP Account</label>
            <CoaSelect value={form.ap_account_id} onChange={v => set('ap_account_id', v)} accounts={accounts} placeholder="— AP Account —" />
          </div>
        </div>
      </div>

      {isFixedAsset && (
        <div className="border-t border-teal-200 pt-3">
          <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-2">Useful Life</p>
          <div className="flex items-center gap-3">
            <input type="number" min="1" max="50"
              className={`${inp} w-28`}
              value={form.useful_life_years}
              onChange={e => set('useful_life_years', e.target.value)}
              placeholder="e.g. 10" />
            <span className="text-sm text-slate-500">years (straight-line)</span>
            {form.useful_life_years && (
              <span className="text-xs text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded">
                {(100 / parseInt(form.useful_life_years)).toFixed(1)}% p.a.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-teal-200 pt-3">
        <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3">Tax Configuration</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={lbl}>GST Rate %</label>
            <select className={inp} value={form.gst_rate}
              onChange={e => set('gst_rate', parseFloat(e.target.value))}>
              {[0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28].map(r =>
                <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>HSN Code</label>
            <input className={inp} value={form.hsn_code}
              onChange={e => set('hsn_code', e.target.value)}
              placeholder="e.g. 9022" />
          </div>
          <div>
            <label className={lbl}>SAC Code</label>
            <input className={inp} value={form.sac_code}
              onChange={e => set('sac_code', e.target.value)}
              placeholder="e.g. 9985" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 border-t border-teal-200 pt-3">
        <div>
          <label className={lbl}>Sort Order</label>
          <input type="number" min="0" className={`${inp} w-24`} value={form.sort_order}
            onChange={e => set('sort_order', parseInt(e.target.value) || 0)} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer mt-4">
          <input type="checkbox" checked={form.show_in_item_master}
            onChange={e => set('show_in_item_master', e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
          <div>
            <p className="text-xs font-medium text-slate-700">Show in Item Master</p>
            <p className="text-[11px] text-slate-400">Uncheck for payroll/finance-only categories</p>
          </div>
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60 transition-colors">
          {saving ? 'Saving…' : 'Add Sub Category'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════════════════════════
function CategoryMappingSettings() {
  const [activeType, setActiveType] = useState('STOCK');
  const [tree,       setTree]       = useState({});
  const [accounts,   setAccounts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editingId,    setEditingId]    = useState(null);
  const [showAddL1,    setShowAddL1]    = useState(false);
  const [addL2Parent,  setAddL2Parent]  = useState(null);  // l1 node or null
  const [expanded,     setExpanded]     = useState({});
  const [toast,      setToast]      = useState('');
  const [loadErr,    setLoadErr]    = useState('');

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadData = useCallback(async () => {
    setLoading(true); setLoadErr('');
    try {
      const [treeRes, accRes] = await Promise.all([
        apiFetch('/api/item-categories/tree').then(r => r.json()),
        apiFetch('/api/chart-of-accounts/accounts').then(r => r.json()),
      ]);
      setTree(treeRes.tree || {});
      // /api/chart-of-accounts/accounts returns { success, data: [...] }
      const rows = accRes.data || accRes.accounts || accRes.rows || [];
      setAccounts(Array.isArray(rows) ? rows : []);
      if (!Array.isArray(rows) || rows.length === 0) {
        setLoadErr('No COA accounts loaded — check that /api/chart-of-accounts/accounts is accessible.');
      }
    } catch (e) {
      setLoadErr('Failed to load data: ' + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveEdit = updated => {
    setTree(prev => {
      const next = { ...prev };
      for (const type of Object.keys(next)) {
        next[type] = next[type].map(l1 => {
          if (l1.id === updated.id) return { ...l1, ...updated, children: l1.children };
          return { ...l1, children: (l1.children || []).map(l2 => l2.id === updated.id ? { ...l2, ...updated } : l2) };
        });
      }
      return next;
    });
    setEditingId(null);
    showToast('Saved successfully');
  };

  const handleAddSave = () => { loadData(); setShowAddL1(false); setAddL2Parent(null); showToast('Category added'); };

  const handleDelete = async cat => {
    if (!window.confirm(`Deactivate "${cat.name}"?`)) return;
    try {
      const r = await apiFetch(`/api/item-categories/${cat.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Failed');
      loadData(); showToast('Category deactivated');
    } catch (ex) { alert(ex.message); }
  };

  const toggleExpand = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const tabCfg  = TYPE_TABS.find(t => t.key === activeType);
  const style   = TAB_STYLE[tabCfg?.color] || TAB_STYLE.emerald;
  const l1Nodes = tree[activeType] || [];

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-teal-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Category &amp; COA Mapping</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Map item categories to Chart of Accounts GL entries. Used for automated Journal Entry posting when GRNs are completed.
          </p>
        </div>
        <button onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {loadErr && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{loadErr}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TYPE_TABS.map(t => {
          const s = TAB_STYLE[t.color];
          const isActive = activeType === t.key;
          return (
            <button key={t.key}
              onClick={() => { setActiveType(t.key); setEditingId(null); setShowAddL1(false); setAddL2Parent(null); }}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive ? `${s.active} bg-white` : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}>
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isActive ? s.badge : 'bg-slate-100 text-slate-400'}`}>
                {(tree[t.key] || []).reduce((n, l1) => n + 1 + (l1.children?.length || 0), 0)}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">

          {/* Add L1 button */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {l1Nodes.length} groups · {l1Nodes.reduce((n, l) => n + (l.children?.length || 0), 0)} sub-categories ·
              {' '}{accounts.length} COA accounts available
            </p>
            <button onClick={() => { setShowAddL1(true); setAddL2Parent(null); setEditingId(null); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors ${style.btn}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              + Sub Category
            </button>
          </div>

          {showAddL1 && (
            <AddCategoryForm parentL1={null} itemType={activeType} accounts={accounts}
              onSave={handleAddSave} onCancel={() => setShowAddL1(false)} />
          )}

          {l1Nodes.length === 0 && (
            <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
              No categories yet. Click "+ Sub Category" to get started.
            </div>
          )}

          {/* L1 accordion groups */}
          {l1Nodes.map(l1 => {
            const isJournalOnly = l1.show_in_item_master === false;
            return (
            <div key={l1.id} className={`border rounded-xl overflow-hidden ${isJournalOnly ? 'border-slate-300 opacity-80' : style.header}`}>

              {/* Journal-only warning banner */}
              {isJournalOnly && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-100 border-b border-slate-200">
                  <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span className="text-[11px] font-semibold text-slate-600">Journal-only — hidden from Item Master &amp; purchase dropdowns</span>
                </div>
              )}

              {/* L1 header row */}
              <div className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none ${isJournalOnly ? 'bg-slate-50' : ''}`}
                onClick={() => toggleExpand(l1.id)}>
                <div className="flex items-center gap-3 min-w-0">
                  <svg className={`w-4 h-4 flex-shrink-0 transition-transform text-slate-400 ${expanded[l1.id] === false ? '' : 'rotate-90'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className={`font-bold text-sm ${isJournalOnly ? 'text-slate-500' : 'text-slate-800'}`}>{l1.name}</span>
                  <span className="font-mono text-[10px] text-slate-400 bg-white/70 px-1.5 py-0.5 rounded border border-slate-200">{l1.code}</span>
                  <span className="text-xs text-slate-400">{(l1.children || []).length} sub-categories</span>

                  {/* L1 GL badges */}
                  <div className="flex items-center gap-1.5 ml-2">
                    {l1.asset_gl_code   && <GlBadge code={l1.asset_gl_code}   name={l1.asset_gl_name}   color="emerald" />}
                    {l1.expense_gl_code && <GlBadge code={l1.expense_gl_code} name={l1.expense_gl_name} color="blue"    />}
                    {l1.ap_account_code && <GlBadge code={l1.ap_account_code} name={l1.ap_account_name} color="orange"  />}
                    {!l1.asset_gl_code && !l1.expense_gl_code && !l1.ap_account_code && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">no GL mapped</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-4" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setEditingId(editingId === l1.id ? null : l1.id); setShowAddL1(false); setAddL2Parent(null); }}
                    className="px-2.5 py-1 text-[11px] font-semibold text-teal-600 border border-teal-200 bg-white hover:bg-teal-50 rounded-lg transition-colors">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(l1)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-red-500 border border-red-200 bg-white hover:bg-red-50 rounded-lg transition-colors">
                    Deactivate
                  </button>
                </div>
              </div>

              {/* Inline edit form for L1 */}
              {editingId === l1.id && (
                <div className="px-4 pb-4 bg-white border-t border-slate-200">
                  <EditForm cat={l1} accounts={accounts} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} />
                </div>
              )}

              {/* L2 table */}
              {expanded[l1.id] !== false && (
                <div className="bg-white border-t border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sub-category</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Code</th>
                        {activeType !== 'EXPENSE' && (
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Asset GL</th>
                        )}
                        {activeType !== 'FIXED_ASSET' && (
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Expense GL</th>
                        )}
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">AP Account</th>
                        {activeType === 'FIXED_ASSET' && (
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Useful Life</th>
                        )}
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Item Master</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">Active</th>
                        <th className="px-4 py-2 w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(l1.children || []).length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-5 text-slate-400 text-center text-xs italic">
                            No sub-categories yet — add one below
                          </td>
                        </tr>
                      )}
                      {(l1.children || []).map(l2 => (
                        <tr key={l2.id} className={`hover:bg-slate-50 transition-colors ${!l2.active ? 'opacity-50' : ''}`}>
                          {editingId === l2.id ? (
                            <td colSpan={8} className="px-4 py-3">
                              <EditForm cat={l2} accounts={accounts} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} />
                            </td>
                          ) : (
                            <>
                              <td className="px-4 py-2.5 text-xs font-semibold text-slate-800">
                                {l2.name}
                                {!l2.asset_gl_code && !l2.expense_gl_code && !l2.ap_account_code && (
                                  <span className="ml-2 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded">no GL</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{l2.code}</span>
                              </td>
                              {activeType !== 'EXPENSE' && (
                                <td className="px-4 py-2.5">
                                  <GlBadge code={l2.asset_gl_code} name={l2.asset_gl_name} color="emerald" />
                                </td>
                              )}
                              {activeType !== 'FIXED_ASSET' && (
                                <td className="px-4 py-2.5">
                                  <GlBadge code={l2.expense_gl_code} name={l2.expense_gl_name} color="blue" />
                                </td>
                              )}
                              <td className="px-4 py-2.5">
                                <GlBadge code={l2.ap_account_code} name={l2.ap_account_name} color="orange" />
                              </td>
                              {activeType === 'FIXED_ASSET' && (
                                <td className="px-4 py-2.5">
                                  {l2.useful_life_years ? (
                                    <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded whitespace-nowrap">
                                      {l2.useful_life_years} yrs
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-300">—</span>
                                  )}
                                </td>
                              )}
                              <td className="px-4 py-2.5">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${l2.show_in_item_master !== false ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-slate-100 text-slate-400'}`}>
                                  {l2.show_in_item_master !== false ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${l2.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                  {l2.active ? 'Active' : 'Off'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1.5">
                                  <button onClick={() => { setEditingId(l2.id); setShowAddL1(false); setAddL2Parent(null); }}
                                    className="px-2 py-1 text-[11px] font-semibold text-teal-600 border border-teal-200 bg-white hover:bg-teal-50 rounded-lg transition-colors">
                                    Edit
                                  </button>
                                  <button onClick={() => handleDelete(l2)}
                                    className="px-2 py-1 text-[11px] font-semibold text-red-500 border border-red-200 bg-white hover:bg-red-50 rounded-lg transition-colors">
                                    Del
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Add L2 */}
                  <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
                    {addL2Parent?.id === l1.id ? (
                      <AddCategoryForm parentL1={l1} itemType={activeType} accounts={accounts}
                        onSave={handleAddSave} onCancel={() => setAddL2Parent(null)} />
                    ) : (
                      <button onClick={() => { setAddL2Parent(l1); setShowAddL1(false); setEditingId(null); }}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-600 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Add sub-category under {l1.name}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CategoryMappingSettings;
export { CategoryMappingSettings };
