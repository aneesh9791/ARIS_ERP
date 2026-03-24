import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

// ─── API helper ───────────────────────────────────────────────────────────────
const token = () => localStorage.getItem('token');
const BASE = '/api/service-management';
const api = (path, opts = {}) =>
  fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });

// ─── Constants ────────────────────────────────────────────────────────────────
const MODALITIES = ['CT', 'MRI', 'XRAY', 'USG', 'PET', 'MAMMOGRAPHY', 'OTHER'];
const GST_RATES  = [0, 5, 12, 18, 28];

// ─── Shared UI primitives ─────────────────────────────────────────────────────
const Badge = ({ active }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
    active ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'
  }`}>
    {active ? 'Active' : 'Inactive'}
  </span>
);

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─── Modal shell ──────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

// ─── Form field ───────────────────────────────────────────────────────────────
const Field = ({ label, children, hint }) => (
  <div className="mb-4">
    <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
  </div>
);

const Input = (props) => (
  <input
    {...props}
    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
  />
);

const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
  >
    {children}
  </select>
);

const Toggle = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-3 cursor-pointer select-none">
    <div
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-teal-600' : 'bg-slate-300'}`}
    >
      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`} />
    </div>
    <span className="text-sm text-slate-700">{label}</span>
  </label>
);


// ─── Contrast Add/Edit Form (outside ContrastTab to prevent remount on rerender) ──
const ContrastAddEditForm = ({ data, setData, onSave, onCancel, isEdit, saving }) => (
  <>
    {!isEdit && (
      <Field label="Modality">
        <Select value={data.modality} onChange={e => {
          const m = e.target.value;
          setData(p => ({
            ...p,
            modality: m,
            code: p.code && !p.code.startsWith('CONTRAST_') ? p.code : `CONTRAST_${m}`,
          }));
        }}>
          {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
        </Select>
      </Field>
    )}
    {!isEdit && (
      <Field label="Service Code" hint="Unique identifier — auto-suggested, you can edit">
        <Input
          value={data.code}
          onChange={e => setData(p => ({ ...p, code: e.target.value.toUpperCase() }))}
          placeholder="e.g. CONTRAST_CT_1"
        />
      </Field>
    )}
    <Field label="Service Name">
      <Input value={data.name} onChange={e => setData(p => ({ ...p, name: e.target.value }))} placeholder="e.g. CT Contrast Enhanced" />
    </Field>
    <Field
      label="Price (₹)"
      hint={data.gst_applicable && data.price ? `GST amount: ₹${(Number(data.price) * Number(data.gst_rate) / 100).toFixed(2)}` : ''}
    >
      <Input type="number" min="0" step="0.01" value={data.price} onChange={e => setData(p => ({ ...p, price: e.target.value }))} />
    </Field>
    <Field label="GST Rate (%)">
      <Select value={data.gst_rate} onChange={e => setData(p => ({ ...p, gst_rate: Number(e.target.value) }))}>
        {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
      </Select>
    </Field>
    <Field label="">
      <Toggle checked={!!data.gst_applicable} onChange={v => setData(p => ({ ...p, gst_applicable: v }))} label="GST Applicable" />
    </Field>
    <div className="flex gap-3 mt-6">
      <button onClick={onSave} disabled={saving} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
        {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Service'}
      </button>
      <button onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg py-2.5 text-sm font-medium transition-colors">
        Cancel
      </button>
    </div>
  </>
);

// ─── DICOM Add/Edit Form (outside DicomTab to prevent remount on rerender) ────
const DicomAddEditForm = ({ data, setData, onSave, onCancel, isEdit, saving }) => (
  <>
    {!isEdit && (
      <Field label="Service Code">
        <Input
          value={data.code}
          onChange={e => setData(p => ({ ...p, code: e.target.value.toUpperCase() }))}
          placeholder="e.g. DICOM_CD_1"
        />
      </Field>
    )}
    <Field label="Service Name">
      <Input value={data.name} onChange={e => setData(p => ({ ...p, name: e.target.value }))} />
    </Field>
    <Field
      label="Price (₹)"
      hint={data.gst_applicable && data.price ? `GST amount: ₹${(Number(data.price) * Number(data.gst_rate) / 100).toFixed(2)}` : ''}
    >
      <Input type="number" min="0" step="0.01" value={data.price} onChange={e => setData(p => ({ ...p, price: e.target.value }))} />
    </Field>
    <Field label="GST Rate (%)">
      <Select value={data.gst_rate} onChange={e => setData(p => ({ ...p, gst_rate: Number(e.target.value) }))}>
        {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
      </Select>
    </Field>
    <Field label="">
      <Toggle checked={!!data.gst_applicable} onChange={v => setData(p => ({ ...p, gst_applicable: v }))} label="GST Applicable" />
    </Field>
    <div className="flex gap-3 mt-6">
      <button onClick={onSave} disabled={saving} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
        {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Service'}
      </button>
      <button onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg py-2.5 text-sm font-medium transition-colors">
        Cancel
      </button>
    </div>
  </>
);

// ─── TAB 2: Contrast Add-ons ──────────────────────────────────────────────────
const ContrastTab = () => {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [saving, setSaving]   = useState(false);

  const emptyForm = { name: '', code: 'CONTRAST_CT', modality: 'CT', price: '', gst_rate: 0, gst_applicable: false };
  const [form, setForm]       = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api(`${BASE}/services/addons/contrast`);
      const d = await r.json();
      if (d.success) setRows(d.data);
      else toast.error('Failed to load contrast services');
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name || !form.code || !form.price) {
      toast.error('Name, code and price are required');
      return;
    }
    setSaving(true);
    try {
      const r = await api(`${BASE}/services/addons`, {
        method: 'POST',
        body: JSON.stringify({ ...form, item_type: 'CONTRAST', price: Number(form.price) }),
      });
      const d = await r.json();
      if (d.success) { toast.success('Contrast service added'); setShowAdd(false); setForm(emptyForm); load(); }
      else toast.error(d.message || 'Failed to add');
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const r = await api(`${BASE}/services/addons/${editRow.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name:           editRow.name,
          price:          Number(editRow.price),
          gst_rate:       Number(editRow.gst_rate),
          gst_applicable: editRow.gst_applicable,
          is_active:      editRow.is_active,
        }),
      });
      const d = await r.json();
      if (d.success) { toast.success('Updated'); setEditRow(null); load(); }
      else toast.error(d.message || 'Failed to update');
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (row) => {
    try {
      const r = await api(`${BASE}/services/addons/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      const d = await r.json();
      if (d.success) { toast.success(row.is_active ? 'Deactivated' : 'Activated'); load(); }
      else toast.error(d.message || 'Failed');
    } catch { toast.error('Network error'); }
  };

  // Group by modality
  const grouped = rows.reduce((acc, r) => {
    const key = r.modality || 'OTHER';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});


  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => { setForm(emptyForm); setShowAdd(true); }}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Contrast Service
        </button>
      </div>

      {loading ? <Spinner /> : (
        Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 text-slate-400">No contrast services found</div>
        ) : (
          Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([modality, items]) => (
            <div key={modality} className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 bg-teal-600 text-white rounded-full text-xs font-semibold tracking-wide">{modality}</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Service Name</th>
                      <th className="px-4 py-3 text-left">Code</th>
                      <th className="px-4 py-3 text-right">Price (₹)</th>
                      <th className="px-4 py-3 text-right">GST%</th>
                      <th className="px-4 py-3 text-center">GST Applicable</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map(row => (
                      <tr key={row.id} className="hover:bg-teal-50/30 transition-colors">
                        <td className="px-4 py-3 text-slate-800 font-medium">{row.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.code}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(row.price)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{Number(row.gst_rate || 0)}%</td>
                        <td className="px-4 py-3 text-center"><Badge active={row.gst_applicable} /></td>
                        <td className="px-4 py-3 text-center"><Badge active={row.is_active} /></td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setEditRow({ ...row })}
                              className="text-teal-600 hover:text-teal-800 font-medium text-xs px-2 py-1 rounded hover:bg-teal-50 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggle(row)}
                              className={`font-medium text-xs px-2 py-1 rounded transition-colors ${
                                row.is_active
                                  ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                                  : 'text-green-600 hover:text-green-800 hover:bg-green-50'
                              }`}
                            >
                              {row.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )
      )}

      {showAdd && (
        <Modal title="Add Contrast Service" onClose={() => setShowAdd(false)}>
          <ContrastAddEditForm data={form} setData={setForm} onSave={handleAdd} onCancel={() => setShowAdd(false)} isEdit={false} saving={saving} />
        </Modal>
      )}

      {editRow && (
        <Modal title={`Edit — ${editRow.name}`} onClose={() => setEditRow(null)}>
          <ContrastAddEditForm data={editRow} setData={setEditRow} onSave={handleUpdate} onCancel={() => setEditRow(null)} isEdit={true} saving={saving} />
        </Modal>
      )}
    </div>
  );
};

// ─── TAB 3: DICOM Media ───────────────────────────────────────────────────────
const DicomTab = () => {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [saving, setSaving]   = useState(false);

  const emptyForm = { name: 'DICOM CD Media', code: '', price: '', gst_rate: 18, gst_applicable: true };
  const [form, setForm]       = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api(`${BASE}/services/addons`);
      const d = await r.json();
      if (d.success) setRows(d.data.filter(s => s.item_type === 'DICOM_CD'));
      else toast.error('Failed to load DICOM services');
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name || !form.code || !form.price) {
      toast.error('Name, code and price are required');
      return;
    }
    setSaving(true);
    try {
      const r = await api(`${BASE}/services/addons`, {
        method: 'POST',
        body: JSON.stringify({ ...form, item_type: 'DICOM_CD', price: Number(form.price) }),
      });
      const d = await r.json();
      if (d.success) { toast.success('DICOM service added'); setShowAdd(false); setForm(emptyForm); load(); }
      else toast.error(d.message || 'Failed to add');
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const r = await api(`${BASE}/services/addons/${editRow.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name:           editRow.name,
          price:          Number(editRow.price),
          gst_rate:       Number(editRow.gst_rate),
          gst_applicable: editRow.gst_applicable,
          is_active:      editRow.is_active,
        }),
      });
      const d = await r.json();
      if (d.success) { toast.success('Updated'); setEditRow(null); load(); }
      else toast.error(d.message || 'Failed to update');
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (row) => {
    try {
      const r = await api(`${BASE}/services/addons/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      const d = await r.json();
      if (d.success) { toast.success(row.is_active ? 'Deactivated' : 'Activated'); load(); }
      else toast.error(d.message || 'Failed');
    } catch { toast.error('Network error'); }
  };


  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => { setForm(emptyForm); setShowAdd(true); }}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add DICOM Service
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Service Name</th>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-right">Price (₹)</th>
                <th className="px-4 py-3 text-right">GST%</th>
                <th className="px-4 py-3 text-center">GST Applicable</th>
                <th className="px-4 py-3 text-right">GST Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">No DICOM media services found</td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className="hover:bg-teal-50/30 transition-colors">
                  <td className="px-4 py-3 text-slate-800 font-medium">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.code}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(row.price)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{Number(row.gst_rate || 0)}%</td>
                  <td className="px-4 py-3 text-center"><Badge active={row.gst_applicable} /></td>
                  <td className="px-4 py-3 text-right text-slate-500 text-xs">
                    {row.gst_applicable ? fmt(Number(row.price) * Number(row.gst_rate) / 100) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center"><Badge active={row.is_active} /></td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setEditRow({ ...row })}
                        className="text-teal-600 hover:text-teal-800 font-medium text-xs px-2 py-1 rounded hover:bg-teal-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(row)}
                        className={`font-medium text-xs px-2 py-1 rounded transition-colors ${
                          row.is_active
                            ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                            : 'text-green-600 hover:text-green-800 hover:bg-green-50'
                        }`}
                      >
                        {row.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="Add DICOM Media Service" onClose={() => setShowAdd(false)}>
          <DicomAddEditForm data={form} setData={setForm} onSave={handleAdd} onCancel={() => setShowAdd(false)} isEdit={false} saving={saving} />
        </Modal>
      )}
      {editRow && (
        <Modal title={`Edit — ${editRow.name}`} onClose={() => setEditRow(null)}>
          <DicomAddEditForm data={editRow} setData={setEditRow} onSave={handleUpdate} onCancel={() => setEditRow(null)} isEdit={true} saving={saving} />
        </Modal>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'contrast', label: 'Contrast Add-ons' },
  { key: 'dicom',    label: 'DICOM Media' },
];

export default function ServiceMaster({ embedded = false }) {
  const [activeTab, setActiveTab] = useState('contrast');

  return (
    <div className={embedded ? '' : 'p-6 max-w-7xl mx-auto'}>
      {/* Page header — hidden when embedded inside Master Data */}
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">Service Master</h1>
          <p className="text-sm text-slate-500 mt-1">Manage contrast add-on services and DICOM media. Study charges are managed in Study Pricing.</p>
        </div>
      )}

      {/* Tab bar */}
      <div className={embedded ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden'}>
        <div className="flex border-b border-slate-100">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-3.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.key
                  ? 'text-teal-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600 rounded-t" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'contrast' && <ContrastTab />}
          {activeTab === 'dicom'    && <DicomTab />}
        </div>
      </div>
    </div>
  );
}
