import { useState, useEffect, useCallback } from 'react';
import { getPermissions } from '../utils/permissions';

const token = () => localStorage.getItem('token');
const hdrs = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const STATUS_BADGE = {
  OK:           'bg-emerald-100 text-emerald-700',
  LOW:          'bg-amber-100 text-amber-700',
  CRITICAL:     'bg-orange-100 text-orange-700',
  OUT_OF_STOCK: 'bg-red-100 text-red-700',
};

const MOV_BADGE = {
  STOCK_IN:   'bg-emerald-100 text-emerald-700',
  STOCK_OUT:  'bg-red-100 text-red-700',
  ADJUSTMENT: 'bg-blue-100 text-blue-700',
  OPENING:    'bg-slate-100 text-slate-600',
};

const KPICard = ({ label, value, sub, iconBg, iconColor, iconPath }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
    <div className="flex items-start justify-between">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
        </svg>
      </div>
    </div>
    <div className="mt-3">
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  </div>
);

// ── Movement Modal ─────────────────────────────────────────────────────────────
const MovementModal = ({ items, onClose, onSaved }) => {
  const [form, setForm] = useState({
    item_id: '', movement_type: 'STOCK_IN', quantity: '',
    unit_cost: '', reference_type: 'MANUAL', reference_number: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setErr('');
    if (!form.item_id || !form.quantity) { setErr('Item and quantity are required'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/item-master/movements', {
        method: 'POST',
        headers: hdrs(),
        body: JSON.stringify({
          ...form,
          item_id: parseInt(form.item_id),
          quantity: parseFloat(form.quantity),
          unit_cost: parseFloat(form.unit_cost || 0),
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
    } catch { setErr('Network error'); setSaving(false); }
  };

  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
  const lbl = 'block text-xs font-semibold text-slate-600 mb-1.5';
  const isIssue = form.movement_type === 'STOCK_OUT';
  const jeWillPost = isIssue && parseFloat(form.unit_cost || 0) > 0 && form.item_id;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between rounded-t-2xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
          <div>
            <p className="text-white font-bold text-sm">Record Stock Movement</p>
            <p className="text-teal-200 text-xs mt-0.5">Updates stock levels and posts GL entry on issue</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

          <div>
            <label className={lbl}>Item <span className="text-red-500">*</span></label>
            <select value={form.item_id} onChange={e => set('item_id', e.target.value)} className={inp}>
              <option value="">Select item…</option>
              {items.map(i => (
                <option key={i.id} value={i.id}>{i.item_code} — {i.item_name} (Stock: {i.current_stock} {i.consumption_uom || i.uom})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Movement Type <span className="text-red-500">*</span></label>
              <select value={form.movement_type} onChange={e => set('movement_type', e.target.value)} className={inp}>
                <option value="STOCK_IN">Stock In</option>
                <option value="STOCK_OUT">Stock Out / Issue</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Quantity <span className="text-red-500">*</span></label>
              <input type="number" min="0.01" step="0.01" value={form.quantity}
                onChange={e => set('quantity', e.target.value)} className={inp} placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>
                Unit Cost {isIssue && <span className="text-amber-600 font-normal">(required for JE)</span>}
              </label>
              <input type="number" min="0" step="0.01" value={form.unit_cost}
                onChange={e => set('unit_cost', e.target.value)} className={inp} placeholder="0.00" />
            </div>
            <div>
              <label className={lbl}>Reference Type</label>
              <select value={form.reference_type} onChange={e => set('reference_type', e.target.value)} className={inp}>
                <option value="MANUAL">Manual</option>
                <option value="GRN">GRN</option>
                <option value="ISSUE">Issue</option>
                <option value="RETURN">Return</option>
              </select>
            </div>
          </div>

          <div>
            <label className={lbl}>Reference Number</label>
            <input type="text" value={form.reference_number}
              onChange={e => set('reference_number', e.target.value)}
              className={inp} placeholder="e.g. GRN-2026-0001" />
          </div>

          <div>
            <label className={lbl}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              className={inp + ' resize-none'} placeholder="Optional notes…" />
          </div>

          {/* JE notice */}
          {isIssue && (
            <div className={`rounded-lg px-3 py-2 text-xs ${jeWillPost ? 'bg-teal-50 border border-teal-200 text-teal-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
              {jeWillPost
                ? '✓ Journal Entry will be posted — DR Expense GL / CR Inventory GL'
                : 'Enter unit cost to auto-post a Journal Entry (DR Expense / CR Inventory)'}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Record Movement'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Issue Modal (record consumables for a pending bill) ─────────────────────────
const IssueModal = ({ bill, onClose, onSaved }) => {
  const [rows, setRows] = useState(
    (bill.template_items || []).map(i => ({
      item_master_id: i.item_master_id,
      item_name: i.item_name,
      item_code: i.item_code,
      uom: i.uom,
      consumption_uom: i.consumption_uom || i.uom,
      uom_conversion: parseFloat(i.uom_conversion || 1),
      default_qty: parseFloat(i.default_qty || 1),
      unit_cost: parseFloat(i.unit_cost || 0),
      current_stock: parseFloat(i.current_stock || 0),
      qty_used: parseFloat(i.default_qty || 1),
      notes: '',
    }))
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const setQty = (idx, v) => setRows(r => r.map((row, i) => i === idx ? { ...row, qty_used: v } : row));
  const setNotes = (idx, v) => setRows(r => r.map((row, i) => i === idx ? { ...row, notes: v } : row));

  const submit = async () => {
    setErr('');
    const payload = rows.map(r => ({
      item_master_id: r.item_master_id,
      qty_used: parseFloat(r.qty_used) || 0,
      notes: r.notes || null,
    }));
    setSaving(true);
    try {
      const res = await fetch('/api/bill-consumables/save', {
        method: 'POST',
        headers: hdrs(),
        body: JSON.stringify({ bill_id: bill.bill_id, consumables: payload }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || 'Failed to save'); setSaving(false); return; }
      onSaved();
    } catch { setErr('Network error'); setSaving(false); }
  };

  const inp = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-full';
  const lowStock = (row) => row.current_stock < row.qty_used;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-5 py-4 flex items-start justify-between rounded-t-2xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
          <div>
            <p className="text-white font-bold text-sm">Issue Consumables</p>
            <p className="text-teal-200 text-xs mt-0.5">
              Bill {bill.bill_number} &middot; {bill.patient_name || 'Patient'} &middot; {bill.study_name}
            </p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
          <p className="text-xs text-slate-500">
            Adjust quantities as needed. Items with qty = 0 will be skipped.
            Stock deduction and GL journal entry are posted automatically.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-center">On Hand</th>
                <th className="px-3 py-2 text-center w-24">Qty to Issue</th>
                <th className="px-3 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.item_master_id} className={`border-b border-slate-100 ${lowStock(row) ? 'bg-red-50' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{row.item_name}</div>
                    <div className="text-xs text-slate-400">
                      {row.item_code} &middot; {row.consumption_uom}
                      {row.uom_conversion > 1 && (
                        <span className="ml-1 text-slate-300">(1 {row.uom} = {row.uom_conversion} {row.consumption_uom})</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs font-medium ${row.current_stock <= 0 ? 'text-red-600' : row.current_stock < row.default_qty ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {row.current_stock.toFixed(2)}
                    </span>
                    {lowStock(row) && (
                      <div className="text-xs text-red-500 mt-0.5">Low stock</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number" min="0" step="0.01"
                      value={row.qty_used}
                      onChange={e => setQty(idx, e.target.value)}
                      className={inp}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.notes}
                      onChange={e => setNotes(idx, e.target.value)}
                      className={inp}
                      placeholder="Optional…"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Confirm Issue'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const Stock = () => {
  const { has } = getPermissions();
  const [activeTab, setActiveTab] = useState('levels');

  // Stock levels
  const [stockItems, setStockItems] = useState([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [centerFilter, setCenterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Movements
  const [movements, setMovements] = useState([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movTotal, setMovTotal] = useState(0);
  const [movPage, setMovPage] = useState(1);
  const [movTypeFilter, setMovTypeFilter] = useState('');
  const [movFrom, setMovFrom] = useState('');
  const [movTo, setMovTo] = useState('');

  // Pending issues
  const [pendingItems, setPendingItems] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingCenter, setPendingCenter] = useState('');
  const [pendingFrom, setPendingFrom] = useState('');
  const [pendingTo, setPendingTo] = useState('');
  const [centers, setCenters] = useState([]);
  const [issueModal, setIssueModal] = useState(null); // bill object

  // Movement Modal
  const [showModal, setShowModal] = useState(false);

  const loadStock = useCallback(async () => {
    setStockLoading(true);
    try {
      const params = new URLSearchParams();
      if (centerFilter) params.set('center_id', centerFilter);
      const r = await fetch(`/api/item-master/stock-summary?${params}`, { headers: hdrs() });
      const d = await r.json();
      if (d.success) setStockItems(d.items || []);
    } finally { setStockLoading(false); }
  }, [centerFilter]);

  const loadMovements = useCallback(async (page = 1) => {
    setMovLoading(true);
    const params = new URLSearchParams({ page, limit: 50 });
    if (centerFilter) params.set('center_id', centerFilter);
    if (movTypeFilter) params.set('movement_type', movTypeFilter);
    if (movFrom) params.set('from', movFrom);
    if (movTo) params.set('to', movTo);
    try {
      const r = await fetch(`/api/item-master/movements?${params}`, { headers: hdrs() });
      const d = await r.json();
      if (d.success) { setMovements(d.movements || []); setMovTotal(d.total || 0); }
    } finally { setMovLoading(false); }
  }, [centerFilter, movTypeFilter, movFrom, movTo]);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    const params = new URLSearchParams({ limit: 200 });
    if (pendingCenter) params.set('center_id', pendingCenter);
    if (pendingFrom) params.set('from', pendingFrom);
    if (pendingTo) params.set('to', pendingTo);
    try {
      const r = await fetch(`/api/bill-consumables/pending-issues?${params}`, { headers: hdrs() });
      const d = await r.json();
      if (d.success) setPendingItems(d.pending || []);
    } finally { setPendingLoading(false); }
  }, [pendingCenter, pendingFrom, pendingTo]);

  const loadCenters = useCallback(async () => {
    try {
      const r = await fetch('/api/centers', { headers: hdrs() });
      const d = await r.json();
      setCenters(d.centers || d || []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadStock(); loadCenters(); }, [loadStock, loadCenters]);
  useEffect(() => { if (activeTab === 'movements') loadMovements(movPage); }, [activeTab, movPage, loadMovements]);
  useEffect(() => { if (activeTab === 'pending') loadPending(); }, [activeTab, loadPending]);

  // KPIs
  const totalItems = stockItems.length;
  const lowItems = stockItems.filter(i => ['LOW', 'CRITICAL'].includes(i.stock_status)).length;
  const outItems = stockItems.filter(i => i.stock_status === 'OUT_OF_STOCK').length;
  const totalValue = stockItems.reduce((s, i) => s + parseFloat(i.current_stock || 0) * parseFloat(i.standard_rate || 0), 0);

  // Unique categories for filter
  const categories = [...new Set(stockItems.map(i => i.category_name).filter(Boolean))].sort();

  const filteredStock = stockItems.filter(i => {
    if (statusFilter && i.stock_status !== statusFilter) return false;
    if (categoryFilter && i.category_name !== categoryFilter) return false;
    return true;
  });

  // Center stock config
  const [configCenter, setConfigCenter] = useState('');
  const [configs, setConfigs]           = useState([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configErr, setConfigErr]       = useState('');
  const [allItems, setAllItems]         = useState([]);
  const [addItemId, setAddItemId]       = useState('');
  const [addMin, setAddMin]             = useState('');
  const [addReorder, setAddReorder]     = useState('');
  const [addSaving, setAddSaving]       = useState(false);
  const [editingRow, setEditingRow]     = useState(null); // { item_id, minimum_stock, reorder_level }

  const loadConfigs = useCallback(async () => {
    if (!configCenter) { setConfigs([]); return; }
    setConfigLoading(true);
    try {
      const r = await fetch(`/api/item-master/center-config?center_id=${configCenter}`, { headers: hdrs() });
      const d = await r.json();
      if (d.success) setConfigs(d.configs || []);
    } finally { setConfigLoading(false); }
  }, [configCenter]);

  const loadAllItems = useCallback(async () => {
    try {
      const r = await fetch(`/api/item-master?item_type=STOCK&limit=500`, { headers: hdrs() });
      const d = await r.json();
      setAllItems(d.items || []);
    } catch { /* non-fatal */ }
  }, []);

  // Load all items once when configure tab first opens; reload configs when center changes
  useEffect(() => { if (activeTab === 'configure') { loadAllItems(); } }, [activeTab, loadAllItems]);
  useEffect(() => { if (activeTab === 'configure') { loadConfigs(); } }, [activeTab, loadConfigs]);

  const saveConfig = async (item_id, minimum_stock, reorder_level, is_active = true) => {
    setConfigErr('');
    try {
      const r = await fetch('/api/item-master/center-config', {
        method: 'PUT', headers: hdrs(),
        body: JSON.stringify({ center_id: parseInt(configCenter), item_id: parseInt(item_id),
          minimum_stock: minimum_stock !== '' ? parseFloat(minimum_stock) : null,
          reorder_level: reorder_level !== '' ? parseFloat(reorder_level) : null,
          is_active }),
      });
      const d = await r.json();
      if (!r.ok) { setConfigErr(d.error || 'Failed to save configuration'); return false; }
      await loadConfigs();
      return true;
    } catch { setConfigErr('Network error — configuration not saved'); return false; }
  };

  const removeConfig = async (item_id) => {
    setConfigErr('');
    try {
      const r = await fetch(`/api/item-master/center-config/${configCenter}/${item_id}`, { method: 'DELETE', headers: hdrs() });
      if (!r.ok) { const d = await r.json(); setConfigErr(d.error || 'Failed to remove item'); return; }
      await loadConfigs();
    } catch { setConfigErr('Network error — item not removed'); }
  };

  const addItem = async () => {
    if (!addItemId || !configCenter) return;
    setAddSaving(true);
    const ok = await saveConfig(addItemId, addMin, addReorder);
    if (ok) { setAddItemId(''); setAddMin(''); setAddReorder(''); }
    setAddSaving(false);
  };

  const configuredIds = new Set(configs.map(c => c.item_id));
  const availableToAdd = allItems.filter(i => !configuredIds.has(i.id));

  const TABS = [
    { id: 'levels',    label: 'Stock Levels' },
    { id: 'movements', label: 'Movements' },
    { id: 'pending',   label: 'Pending Issues', badge: pendingItems.length },
    { id: 'configure', label: 'Configure' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Stock Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Inventory levels and stock movements</p>
        </div>
        {has('INVENTORY_WRITE') && (
        <button onClick={() => setShowModal(true)}
          className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Record Movement
        </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Stock Items" value={totalItems}
          iconBg="bg-teal-50" iconColor="text-teal-600"
          iconPath="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        <KPICard label="Low / Critical Stock" value={lowItems}
          sub={lowItems > 0 ? 'Action needed' : 'All good'}
          iconBg="bg-amber-50" iconColor="text-amber-600"
          iconPath="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        <KPICard label="Out of Stock" value={outItems}
          sub={outItems > 0 ? 'Needs reorder' : 'None'}
          iconBg="bg-red-50" iconColor="text-red-600"
          iconPath="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        <KPICard label="Est. Stock Value" value={fmt(totalValue)}
          iconBg="bg-emerald-50" iconColor="text-emerald-600"
          iconPath="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-200">
          <nav className="flex px-4 -mb-px gap-6">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`py-3.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === t.id
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                {t.label}
                {t.badge > 0 && (
                  <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center leading-none">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Stock Levels Tab */}
        {activeTab === 'levels' && (
          <div>
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
              <select value={centerFilter} onChange={e => setCenterFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">All Centers</option>
                {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">All Statuses</option>
                <option value="OK">OK</option>
                <option value="LOW">Low</option>
                <option value="CRITICAL">Critical</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="text-xs text-slate-400 ml-auto">{filteredStock.length} items</span>
            </div>
            {stockLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
            ) : filteredStock.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <svg className="w-10 h-10 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-sm">No stock items found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Item Code</th>
                      <th className="px-4 py-3 text-left">Item Name</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-center">UOM</th>
                      <th className="px-4 py-3 text-right">Current Stock</th>
                      <th className="px-4 py-3 text-right">Reorder Level</th>
                      <th className="px-4 py-3 text-right">Min Stock</th>
                      <th className="px-4 py-3 text-right">Est. Value</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStock.map(item => (
                      <tr key={item.id} className="hover:bg-teal-50 border-b border-slate-100 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.item_code}</td>
                        <td className="px-4 py-3 text-slate-800 font-medium">{item.item_name}</td>
                        <td className="px-4 py-3 text-slate-600">{item.category_name || '—'}</td>
                        <td className="px-4 py-3 text-center text-slate-500">
                          <div>{item.consumption_uom || item.uom}</div>
                          {parseFloat(item.uom_conversion || 1) > 1 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Purchase: {item.uom} (1:{item.uom_conversion})
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {parseFloat(item.current_stock || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {parseFloat(item.reorder_level || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {parseFloat(item.minimum_stock || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {fmt(parseFloat(item.current_stock || 0) * parseFloat(item.standard_rate || 0))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[item.stock_status] || 'bg-slate-100 text-slate-600'}`}>
                            {item.stock_status?.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Movements Tab */}
        {activeTab === 'movements' && (
          <div>
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
              <select value={centerFilter} onChange={e => { setCenterFilter(e.target.value); setMovPage(1); }}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">All Centers</option>
                {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={movTypeFilter} onChange={e => { setMovTypeFilter(e.target.value); setMovPage(1); }}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">All Types</option>
                <option value="STOCK_IN">Stock In</option>
                <option value="STOCK_OUT">Stock Out</option>
                <option value="ADJUSTMENT">Adjustment</option>
                <option value="OPENING">Opening</option>
              </select>
              <input type="date" value={movFrom} onChange={e => { setMovFrom(e.target.value); setMovPage(1); }}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <span className="text-xs text-slate-400">to</span>
              <input type="date" value={movTo} onChange={e => { setMovTo(e.target.value); setMovPage(1); }}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <button onClick={() => loadMovements(movPage)}
                className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                Search
              </button>
              <span className="text-xs text-slate-400 ml-auto">{movTotal} records</span>
            </div>
            {movLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
            ) : movements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <p className="text-sm">No movements found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Item</th>
                      <th className="px-4 py-3 text-center">Type</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Stock After</th>
                      <th className="px-4 py-3 text-left">Reference</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                      <th className="px-4 py-3 text-left">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => (
                      <tr key={m.id} className="hover:bg-teal-50 border-b border-slate-100 transition-colors">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {new Date(m.created_at).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{m.item_name}</div>
                          <div className="text-xs text-slate-400">{m.item_code}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${MOV_BADGE[m.movement_type] || 'bg-slate-100 text-slate-600'}`}>
                            {m.movement_type?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {m.movement_type === 'STOCK_OUT' ? '-' : '+'}{parseFloat(m.quantity).toFixed(2)} {m.uom}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {parseFloat(m.current_stock || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {m.reference_type && <span className="text-xs font-medium">{m.reference_type}</span>}
                          {m.reference_number && <span className="text-xs text-slate-400 ml-1">#{m.reference_number}</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{m.notes || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{m.created_by_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Pagination */}
                {movTotal > 50 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                    <span className="text-xs text-slate-500">
                      Page {movPage} of {Math.ceil(movTotal / 50)}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setMovPage(p => Math.max(1, p - 1))} disabled={movPage === 1}
                        className="px-3 py-1 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                        Previous
                      </button>
                      <button onClick={() => setMovPage(p => p + 1)} disabled={movPage >= Math.ceil(movTotal / 50)}
                        className="px-3 py-1 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pending Issues Tab */}
        {activeTab === 'pending' && (
          <div>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
              <select value={pendingCenter} onChange={e => setPendingCenter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">All Centers</option>
                {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="date" value={pendingFrom} onChange={e => setPendingFrom(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <span className="text-xs text-slate-400">to</span>
              <input type="date" value={pendingTo} onChange={e => setPendingTo(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <button onClick={loadPending}
                className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                Search
              </button>
              <span className="text-xs text-slate-400 ml-auto">{pendingItems.length} pending</span>
            </div>

            {pendingLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
            ) : pendingItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <svg className="w-10 h-10 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium">No pending issues</p>
                <p className="text-xs mt-1">All study bills have consumables recorded</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Bill</th>
                      <th className="px-4 py-3 text-left">Patient</th>
                      <th className="px-4 py-3 text-left">Study</th>
                      <th className="px-4 py-3 text-left">Center</th>
                      <th className="px-4 py-3 text-right">Bill Date</th>
                      <th className="px-4 py-3 text-center">Items</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingItems.map(bill => (
                      <tr key={bill.bill_id} className="hover:bg-amber-50 border-b border-slate-100 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-slate-700">{bill.bill_number}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{bill.patient_name || '—'}</div>
                          {bill.patient_phone && <div className="text-xs text-slate-400">{bill.patient_phone}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-800">{bill.study_name || '—'}</div>
                          {bill.modality && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                              {bill.modality}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{bill.center_name || '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-500 text-xs whitespace-nowrap">
                          {bill.bill_date ? new Date(bill.bill_date).toLocaleDateString('en-GB') : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-slate-100 text-slate-600 text-xs font-medium px-2 py-0.5 rounded-full">
                            {(bill.template_items || []).length} items
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setIssueModal(bill)}
                            className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            Issue
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Configure Tab */}
        {activeTab === 'configure' && (
          <div>
            <div className="p-4 border-b border-slate-100">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Select Center</label>
                  <select value={configCenter} onChange={e => setConfigCenter(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[220px]">
                    <option value="">— Choose a center —</option>
                    {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {configCenter && (
                  <p className="text-xs text-slate-400 pb-1.5">
                    {configs.length} item{configs.length !== 1 ? 's' : ''} configured for this center
                  </p>
                )}
              </div>
            </div>

            {configErr && (
              <div className="mx-4 mt-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-start gap-2">
                <span className="font-bold mt-0.5">✕</span>
                <span>{configErr}</span>
                <button onClick={() => setConfigErr('')} className="ml-auto text-red-400 hover:text-red-600 font-bold">×</button>
              </div>
            )}

            {!configCenter ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <svg className="w-10 h-10 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm">Select a center to configure its stock items</p>
              </div>
            ) : configLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Item Code</th>
                      <th className="px-4 py-3 text-left">Item Name</th>
                      <th className="px-4 py-3 text-center">UOM</th>
                      <th className="px-4 py-3 text-center">Active</th>
                      <th className="px-4 py-3 text-right">Min Stock</th>
                      <th className="px-4 py-3 text-right">Reorder Level</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Add new item row */}
                    <tr className="bg-teal-50 border-b border-teal-100">
                      <td colSpan={2} className="px-4 py-2">
                        <select value={addItemId} onChange={e => setAddItemId(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                          <option value="">— Add item to this center —</option>
                          {availableToAdd.map(i => (
                            <option key={i.id} value={i.id}>{i.item_code} — {i.item_name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-center text-slate-400 text-xs">—</td>
                      <td className="px-4 py-2 text-center text-slate-400 text-xs">—</td>
                      <td className="px-4 py-2">
                        <input type="number" placeholder="Min qty" value={addMin} onChange={e => setAddMin(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" placeholder="Reorder qty" value={addReorder} onChange={e => setAddReorder(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        {has('INVENTORY_WRITE') && (
                        <button onClick={addItem} disabled={!addItemId || addSaving}
                          className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                          {addSaving ? 'Adding…' : 'Add'}
                        </button>
                        )}
                      </td>
                    </tr>

                    {configs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">
                          No items configured — add items above
                        </td>
                      </tr>
                    ) : configs.map(cfg => (
                      <tr key={cfg.item_id} className={`border-b border-slate-100 transition-colors ${cfg.is_corporate_item ? 'bg-blue-50/40 hover:bg-blue-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{cfg.item_code}</td>
                        <td className="px-4 py-3 text-slate-800 font-medium">
                          <span>{cfg.item_name}</span>
                          {cfg.is_corporate_item && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">Corporate</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500">{cfg.uom}</td>
                        <td className="px-4 py-3 text-center">
                          {cfg.is_corporate_item ? (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                          ) : has('INVENTORY_WRITE') ? (
                            <button onClick={() => saveConfig(cfg.item_id, cfg.minimum_stock, cfg.reorder_level, !cfg.is_active)}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {cfg.is_active ? 'Active' : 'Inactive'}
                            </button>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {cfg.is_active ? 'Active' : 'Inactive'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!cfg.is_corporate_item && editingRow?.item_id === cfg.item_id ? (
                            <input type="number" value={editingRow.minimum_stock}
                              onChange={e => setEditingRow(r => ({ ...r, minimum_stock: e.target.value }))}
                              className="w-24 border border-teal-400 rounded px-2 py-1 text-sm text-right focus:outline-none" />
                          ) : (
                            <span className="text-slate-700">
                              {cfg.minimum_stock != null ? parseFloat(cfg.minimum_stock).toFixed(2) : <span className="text-slate-400 text-xs">{parseFloat(cfg.global_min || 0).toFixed(2)}</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!cfg.is_corporate_item && editingRow?.item_id === cfg.item_id ? (
                            <input type="number" value={editingRow.reorder_level}
                              onChange={e => setEditingRow(r => ({ ...r, reorder_level: e.target.value }))}
                              className="w-24 border border-teal-400 rounded px-2 py-1 text-sm text-right focus:outline-none" />
                          ) : (
                            <span className="text-slate-700">
                              {cfg.reorder_level != null ? parseFloat(cfg.reorder_level).toFixed(2) : <span className="text-slate-400 text-xs">{parseFloat(cfg.global_reorder || 0).toFixed(2)}</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {cfg.is_corporate_item ? (
                            <span className="text-xs text-slate-400 italic">Corporate pool</span>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              {has('INVENTORY_WRITE') && (editingRow?.item_id === cfg.item_id ? (
                                <>
                                  <button onClick={() => { saveConfig(cfg.item_id, editingRow.minimum_stock, editingRow.reorder_level); setEditingRow(null); }}
                                    className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-lg font-medium">Save</button>
                                  <button onClick={() => setEditingRow(null)}
                                    className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => setEditingRow({ item_id: cfg.item_id, minimum_stock: cfg.minimum_stock ?? '', reorder_level: cfg.reorder_level ?? '' })}
                                    className="text-xs text-teal-600 hover:text-teal-800 font-medium px-2 py-1">Edit</button>
                                  <button onClick={() => removeConfig(cfg.item_id)}
                                    className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1">Remove</button>
                                </>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Movement Modal */}
      {showModal && (
        <MovementModal
          items={stockItems}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadStock(); if (activeTab === 'movements') loadMovements(movPage); }}
        />
      )}

      {/* Issue Consumables Modal */}
      {issueModal && (
        <IssueModal
          bill={issueModal}
          onClose={() => setIssueModal(null)}
          onSaved={() => { setIssueModal(null); loadPending(); loadStock(); }}
        />
      )}
    </div>
  );
};

export default Stock;
