import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ServiceMaster from './ServiceMaster';

const AUTH_HEADER = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

// ─── UI Components ────────────────────────────────────────────────────────
const Badge = ({ children, color }) => {
  const colors = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    pink: 'bg-pink-100 text-pink-700',
    slate: 'bg-slate-100 text-slate-600',
    orange: 'bg-orange-100 text-orange-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.slate}`}>
      {children}
    </span>
  );
};

const inputCls = `w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-800
  focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500
  placeholder:text-slate-400 transition-colors`;

// ─── Study Master V2 Component ───────────────────────────────────────────────
// Two-panel layout:
//   Panel 1 — Study Catalog  : global study definitions (code, name, type, modality)
//   Panel 2 — Center Pricing : study × center × rate mappings

const MODALITIES_LIST = [
  { id: 'MRI',         label: 'MRI',        color: 'purple' },
  { id: 'CT',          label: 'CT Scan',     color: 'blue'   },
  { id: 'ULTRASOUND',  label: 'Ultrasound',  color: 'cyan'   },
  { id: 'XRAY',        label: 'X-Ray',       color: 'amber'  },
  { id: 'MAMMOGRAPHY', label: 'Mammo',       color: 'pink'   },
  { id: 'PET',         label: 'PET/Nuclear', color: 'green'  },
  { id: 'FLUOROSCOPY', label: 'Fluoroscopy', color: 'orange' },
  { id: 'GENERAL',     label: 'General',     color: 'slate'  },
];

const MODALITY_COLOR = {
  purple: { tab: 'bg-purple-600 text-white', badge: 'bg-purple-100 text-purple-700', ring: 'focus:ring-purple-500' },
  blue:   { tab: 'bg-blue-600 text-white',   badge: 'bg-blue-100 text-blue-700',     ring: 'focus:ring-blue-500'   },
  cyan:   { tab: 'bg-cyan-600 text-white',   badge: 'bg-cyan-100 text-cyan-700',     ring: 'focus:ring-cyan-500'   },
  amber:  { tab: 'bg-amber-500 text-white',  badge: 'bg-amber-100 text-amber-700',   ring: 'focus:ring-amber-500'  },
  pink:   { tab: 'bg-pink-600 text-white',   badge: 'bg-pink-100 text-pink-700',     ring: 'focus:ring-pink-500'   },
  green:  { tab: 'bg-green-600 text-white',  badge: 'bg-green-100 text-green-700',   ring: 'focus:ring-green-500'  },
  orange: { tab: 'bg-orange-500 text-white', badge: 'bg-orange-100 text-orange-700', ring: 'focus:ring-orange-500' },
  slate:  { tab: 'bg-slate-600 text-white',  badge: 'bg-slate-100 text-slate-700',   ring: 'focus:ring-slate-500'  },
};

const TYPE_BADGE = {
  Plain:    'bg-teal-50 text-teal-700',
  Contrast: 'bg-orange-100 text-orange-700',
  Special:  'bg-purple-100 text-purple-700',
};

const EMPTY_DEF_FORM = { study_code: '', study_name: '', study_type: 'Plain', modality: 'MRI', description: '',
                          sac_code: '', hsn_code: '', gst_rate: '0', gst_applicable: false };

// ── Shared small modal wrapper ───────────────────────────────
const SmModal = ({ title, onClose, onSave, saving, children, submitError }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="px-6 py-5 space-y-4">
        {submitError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{submitError}</div>}
        {children}
      </div>
      <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
        <button onClick={onSave} disabled={saving} className="px-5 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  </div>
);

// UOM-aware qty step: whole-unit UOMs → step 1, measurable → step 0.01
const WHOLE_UOMS = new Set(['NOS','PCS','EA','EACH','VIAL','VIALS','BOX','ROLL','TAB','CAP','UNIT','SET','PACK','BOTTLE','AMP','CARTRIDGE','PIECE','PIECES','SHEET','PAIR']);
const uomStep = (uom = '') => WHOLE_UOMS.has(uom.toUpperCase().trim()) ? 1 : 0.01;
const uomMin  = (uom = '') => WHOLE_UOMS.has(uom.toUpperCase().trim()) ? 1 : 0.01;

// ── StudyCatalogFull — study definitions + consumable templates, unified ───────
const StudyCatalogFull = ({ studyDefs, onDefCreate, onDefUpdate, onDefDelete, onRegisterAdd, onSelectionChange }) => {
  // ── catalog state ──
  const [catModality, setCatModality] = useState('');
  const [catSearch, setCatSearch]     = useState('');
  const [defModal, setDefModal]       = useState(false);
  const [editDef, setEditDef]         = useState(null);
  const [defForm, setDefForm]         = useState(EMPTY_DEF_FORM);
  const [defErrors, setDefErrors]     = useState({});
  const [defSaving, setDefSaving]     = useState(false);
  const [defErr, setDefErr]           = useState('');

  // ── consumables state ──
  const [selectedDef, setSelectedDef]     = useState(null);
  const [consumables, setConsumables]     = useState([]);
  const [stockItems, setStockItems]       = useState([]);
  const [loadingCons, setLoadingCons]     = useState(false);
  const [addForm, setAddForm]             = useState({ item_master_id: '', default_qty: '', notes: '', uom: '' });
  const [conSaving, setConSaving]         = useState(false);
  const [conError, setConError]           = useState('');
  const [conSuccess, setConSuccess]       = useState('');
  const [showAddModal, setShowAddModal]   = useState(false);
  const [editCon, setEditCon]             = useState(null);
  const [conQtys, setConQtys]             = useState({});
  const [allConsumablesMap, setAllConsumablesMap] = useState({});

  // Register the "open add-consumable modal" handler with the parent page
  useEffect(() => {
    onRegisterAdd?.(() => { setConError(''); setShowAddModal(true); });
  }, [onRegisterAdd]);

  // Tell parent whether a study is currently selected (to enable/disable page-level button)
  useEffect(() => {
    onSelectionChange?.(!!selectedDef);
  }, [selectedDef, onSelectionChange]);

  useEffect(() => {
    fetch('/api/item-master?item_type=STOCK&active=true', { headers: AUTH_HEADER() })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setStockItems(d.items || d.data || []))
      .catch(() => setStockItems([]));
  }, []);

  useEffect(() => {
    if (!studyDefs || studyDefs.length === 0) return;
    Promise.all(
      studyDefs.map(s =>
        fetch(`/api/study-consumables?study_definition_id=${s.id}`, { headers: AUTH_HEADER() })
          .then(r => r.ok ? r.json() : { consumables: [] })
          .then(d => ({ id: s.id, items: d.consumables || [] }))
          .catch(() => ({ id: s.id, items: [] }))
      )
    ).then(results => {
      const map = {};
      results.forEach(({ id, items }) => { map[id] = items; });
      setAllConsumablesMap(map);
    }).catch(() => {});
  }, [studyDefs]);

  const loadConsumables = useCallback(async (defId) => {
    if (!defId) { setConsumables([]); return; }
    setLoadingCons(true);
    fetch(`/api/study-consumables?study_definition_id=${defId}`, { headers: AUTH_HEADER() })
      .then(r => r.ok ? r.json() : { consumables: [] })
      .then(d => {
        const list = d.consumables || [];
        setConsumables(list);
        setAllConsumablesMap(prev => ({ ...prev, [defId]: list }));
        const init = {};
        list.forEach(c => { init[c.id] = Math.round(Number(c.default_qty)); });
        setConQtys(init);
      })
      .catch(() => { setConsumables([]); setConError('Failed to load consumables.'); })
      .finally(() => setLoadingCons(false));
  }, []);

  const handleSelectDef = (def) => {
    setSelectedDef(def);
    setConError(''); setConSuccess('');
    setAddForm({ item_master_id: '', default_qty: '', notes: '', uom: '' });
    setShowAddModal(false);
    loadConsumables(def.id);
  };

  // ── consumable CRUD ──
  const closeConModal = () => { setShowAddModal(false); setEditCon(null); setConError(''); setAddForm({ item_master_id: '', default_qty: '', notes: '', uom: '' }); };

  const openEditCon = (con) => {
    setEditCon(con);
    setAddForm({ item_master_id: String(con.item_master_id), default_qty: String(Math.round(Number(con.default_qty))), notes: con.notes || '', uom: con.uom || '' });
    setConError('');
    setShowAddModal(true);
  };

  const handleConSave = async (e) => {
    e.preventDefault();
    if (!addForm.item_master_id || !addForm.default_qty) { setConError('Select an item and enter a quantity.'); return; }
    setConSaving(true); setConError('');
    try {
      let res;
      if (editCon) {
        res = await fetch(`/api/study-consumables/${editCon.id}`, {
          method: 'PUT', headers: AUTH_HEADER(),
          body: JSON.stringify({ default_qty: parseFloat(addForm.default_qty), notes: addForm.notes || null }),
        });
      } else {
        res = await fetch('/api/study-consumables', {
          method: 'POST', headers: AUTH_HEADER(),
          body: JSON.stringify({ study_definition_id: selectedDef.id, item_master_id: parseInt(addForm.item_master_id, 10), default_qty: parseFloat(addForm.default_qty), notes: addForm.notes || null }),
        });
      }
      const data = await res.json();
      if (res.ok) {
        setConSuccess(editCon ? 'Updated.' : 'Added.');
        closeConModal();
        loadConsumables(selectedDef.id);
        setTimeout(() => setConSuccess(''), 3000);
      } else setConError(data.error || 'Failed.');
    } catch { setConError('Network error.'); }
    finally { setConSaving(false); }
  };

  const handleConRemove = async (id) => {
    if (!window.confirm('Remove this consumable from the template?')) return;
    const res = await fetch(`/api/study-consumables/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    if (res.ok) { loadConsumables(selectedDef.id); setConSuccess('Removed.'); setTimeout(() => setConSuccess(''), 3000); }
    else setConError('Failed to remove.');
  };

  const handleQtyUpdate = async (id, newQty) => {
    if (!newQty || isNaN(parseFloat(newQty))) return;
    const res = await fetch(`/api/study-consumables/${id}`, { method: 'PUT', headers: AUTH_HEADER(), body: JSON.stringify({ default_qty: parseFloat(newQty) }) });
    if (res.ok) loadConsumables(selectedDef.id);
    else setConError('Failed to update quantity.');
  };

  // ── study def CRUD ──
  const setD = (f) => (e) => setDefForm(p => ({ ...p, [f]: e.target.value }));
  const openAddDef = () => { setDefForm({ ...EMPTY_DEF_FORM, modality: catModality }); setDefErrors({}); setDefErr(''); setEditDef(null); setDefModal(true); };
  const openEditDef = (s) => { setDefForm({ study_code: s.study_code, study_name: s.study_name, study_type: s.study_type || 'Plain', modality: s.modality, description: s.description || '', sac_code: s.sac_code || '', hsn_code: s.hsn_code || '', gst_rate: s.gst_rate != null ? String(parseFloat(s.gst_rate) * 100) : '0', gst_applicable: s.gst_applicable || false }); setDefErrors({}); setDefErr(''); setEditDef(s); setDefModal(true); };
  const closeDefModal = () => { setDefModal(false); setEditDef(null); };

  const validateDef = () => {
    const e = {};
    if (!defForm.study_code.trim()) e.study_code = 'Required';
    if (!defForm.study_name.trim()) e.study_name = 'Required';
    if (!defForm.modality)          e.modality   = 'Required';
    return e;
  };

  const saveDefForm = async () => {
    const e = validateDef();
    if (Object.keys(e).length) { setDefErrors(e); return; }
    setDefSaving(true); setDefErr('');
    try {
      const payload = { ...defForm, gst_rate: (parseFloat(defForm.gst_rate) || 0) / 100 };
      editDef ? await onDefUpdate(editDef.id, payload) : await onDefCreate(payload);
      closeDefModal();
      if (selectedDef && editDef?.id === selectedDef.id) setSelectedDef(prev => ({ ...prev, ...defForm }));
    } catch (err) { setDefErr(err.message || 'Failed to save'); }
    finally { setDefSaving(false); }
  };

  const deleteDef = async (def) => {
    if (!window.confirm(`Delete "${def.study_name}" from the catalogue?`)) return;
    try {
      await onDefDelete(def.id);
      if (selectedDef?.id === def.id) { setSelectedDef(null); setConsumables([]); }
    } catch (err) { alert(err.message); }
  };

  const catStudies = (studyDefs || [])
    .filter(s => !catModality || s.modality === catModality)
    .filter(s => !catSearch.trim() || s.study_name.toLowerCase().includes(catSearch.toLowerCase()) || s.study_code.toLowerCase().includes(catSearch.toLowerCase()));
  const fldD = (f) => `w-full px-3 py-2 text-sm border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${defErrors[f] ? 'border-red-400 bg-red-50' : 'border-slate-300'}`;

  return (
    <div>

      {/* ── TOP TOOLBAR ── modality filter + add button ─────────── */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setCatModality('')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!catModality ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
          All <span className="ml-1 opacity-60">{(studyDefs||[]).length}</span>
        </button>
        {MODALITIES_LIST.map(m => {
          const cnt = (studyDefs||[]).filter(s => s.modality === m.id).length;
          if (!cnt) return null;
          const mc = MODALITY_COLOR[m.color];
          const isAct = catModality === m.id;
          return (
            <button key={m.id}
              onClick={() => setCatModality(m.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${isAct ? `${mc.tab} shadow-sm` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {m.label} <span className="ml-1 opacity-60">{cnt}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            <input
              type="text"
              value={catSearch}
              onChange={e => setCatSearch(e.target.value)}
              placeholder="Search studies…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 w-44 transition-all"
            />
            {catSearch && (
              <button onClick={() => setCatSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <button onClick={openAddDef}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-full shadow-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            Add Study
          </button>
        </div>
      </div>

      {/* ── STUDY CARD GRID ─────────────────────────────────────── */}
      {catStudies.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-400">No studies found</p>
          <button onClick={openAddDef} className="mt-3 text-sm font-semibold text-teal-600 hover:text-teal-700">+ Add the first study</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {catStudies.map(s => {
            const mod  = MODALITIES_LIST.find(m => m.id === s.modality);
            const mc   = MODALITY_COLOR[mod?.color || 'slate'];
            const isSel = selectedDef?.id === s.id;
            return (
              <div key={s.id}
                onClick={() => handleSelectDef(s)}
                className={`group relative bg-white rounded-2xl border-2 cursor-pointer transition-all duration-200 overflow-hidden
                  ${isSel ? 'border-teal-500 shadow-xl shadow-teal-100/60 scale-[1.01]' : 'border-slate-100 hover:border-teal-200 hover:shadow-lg hover:shadow-slate-100'}`}>

                {/* Modality colour bar */}
                <div className={`h-1.5 w-full ${mc.tab.split(' ')[0]}`} />

                <div className="p-5">
                  {/* Badge row */}
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${mc.badge}`}>{s.modality}</span>
                    {s.study_type && s.study_type !== 'Plain' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{s.study_type}</span>
                    )}
                  </div>

                  {/* Study name */}
                  <h3 className="text-sm font-extrabold text-slate-800 leading-snug mb-1 pr-8">{s.study_name}</h3>
                  <p className="text-[10px] text-slate-400 font-mono tracking-wide mb-5">{s.study_code}</p>

                  {/* Consumable chips */}
                  {(() => {
                    const cc = allConsumablesMap[s.id] || [];
                    return cc.length > 0 ? (
                      <div className="mb-3">
                        <div className="flex flex-wrap gap-1">
                          {cc.slice(0, 4).map(c => (
                            <span key={c.id} className="text-[9px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full truncate max-w-[90px]">{c.item_name}</span>
                          ))}
                          {cc.length > 4 && <span className="text-[9px] text-slate-400 px-1 py-0.5">+{cc.length - 4} more</span>}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                    <span className="text-[11px] text-slate-400">
                      {(allConsumablesMap[s.id] || []).length > 0
                        ? `${(allConsumablesMap[s.id] || []).length} consumable${(allConsumablesMap[s.id] || []).length > 1 ? 's' : ''}`
                        : 'No consumables yet'}
                    </span>
                    <span className={`text-xs font-bold transition-all duration-200 group-hover:translate-x-1 ${isSel ? 'text-teal-600' : 'text-slate-300 group-hover:text-teal-500'}`}>→</span>
                  </div>
                </div>

                {/* Edit / Delete — top-right, hover only */}
                <div className="absolute top-4 right-3 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEditDef(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="Edit">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => deleteDef(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CONSUMABLE PANEL ─────────────────────────────────────── */}
      {selectedDef && (
        <div className="fixed top-16 inset-x-0 bottom-0 z-40 flex items-stretch justify-end"
          onClick={() => { setSelectedDef(null); setConsumables([]); setConError(''); }}>

          {/* Half-screen popup panel */}
          <div className="bg-white flex flex-col rounded-tl-3xl shadow-2xl"
            style={{ width: '50vw', height: '100%' }}
            onClick={e => e.stopPropagation()}>

            {/* Drawer header */}
            <div className="flex-shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {(() => { const mod = MODALITIES_LIST.find(m => m.id === selectedDef.modality); const mc = MODALITY_COLOR[mod?.color || 'slate']; return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${mc.tab}`}>{selectedDef.modality}</span>; })()}
                      {selectedDef.study_type && selectedDef.study_type !== 'Plain' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">{selectedDef.study_type}</span>}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">{consumables.length} consumables</span>
                    </div>
                    <h2 className="text-base font-extrabold text-white leading-snug">{selectedDef.study_name}</h2>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{selectedDef.study_code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setConError(''); setEditCon(null); setAddForm({ item_master_id: '', default_qty: '1', notes: '', uom: '' }); setShowAddModal(true); }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    Add Consumable
                  </button>
                  <button
                    onClick={() => { setSelectedDef(null); setConsumables([]); setConError(''); }}
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Alerts */}
            {(conSuccess || (conError && !showAddModal)) && (
              <div className="flex-shrink-0 px-6 pt-4 space-y-2">
                {conSuccess && (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-green-700 text-xs font-medium">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {conSuccess}
                  </div>
                )}
                {conError && !showAddModal && (
                  <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs">{conError}</div>
                )}
              </div>
            )}

            {/* Consumable list */}
            <div className="flex-1 overflow-y-auto">
              {loadingCons ? (
                <div className="py-20 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500" />
                </div>
              ) : consumables.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center px-8">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-slate-500">No consumables configured</p>
                  <p className="text-xs text-slate-400 mt-1">Click <strong>Add Consumable</strong> to set default quantities</p>
                </div>
              ) : (
                <>
                  {/* Table header */}
                  <div className="grid px-6 py-3 bg-slate-50 border-b border-slate-100 sticky top-0" style={{ gridTemplateColumns: '1fr 140px 64px' }}>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Item</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Default Qty</span>
                    <span />
                  </div>
                  {consumables.map((con, idx) => {
                    const A = [
                      { dot: 'bg-teal-500',   chip: 'bg-teal-50 text-teal-700',     border: 'border-teal-300'   },
                      { dot: 'bg-blue-500',   chip: 'bg-blue-50 text-blue-700',     border: 'border-blue-300'   },
                      { dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700', border: 'border-violet-300' },
                      { dot: 'bg-rose-500',   chip: 'bg-rose-50 text-rose-700',     border: 'border-rose-300'   },
                      { dot: 'bg-amber-500',  chip: 'bg-amber-50 text-amber-700',   border: 'border-amber-300'  },
                      { dot: 'bg-cyan-500',   chip: 'bg-cyan-50 text-cyan-700',     border: 'border-cyan-300'   },
                    ][idx % 6];
                    const qty = conQtys[con.id] ?? Math.round(Number(con.default_qty));
                    const changeQty = (delta) => {
                      const next = Math.max(1, qty + delta);
                      setConQtys(prev => ({ ...prev, [con.id]: next }));
                      handleQtyUpdate(con.id, next);
                    };
                    return (
                      <div key={con.id}
                        className={`group grid px-6 py-3.5 border-b border-slate-50 transition-colors hover:bg-slate-50/70 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'}`}
                        style={{ gridTemplateColumns: '1fr 140px 64px' }}>

                        {/* Item info */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${A.dot}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-700 truncate">{con.item_name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-slate-400 font-mono">{con.item_code}</span>
                              {con.category_name && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${A.chip}`}>{con.category_name}</span>}
                              {con.current_stock != null && <span className="text-[10px] text-slate-400">{Number(con.current_stock).toFixed(0)} in stock</span>}
                              {con.notes && <span className="text-[10px] text-slate-400 italic">{con.notes}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Qty stepper */}
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => changeQty(-1)}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold flex items-center justify-center transition-colors">−</button>
                          <span className={`w-10 h-7 flex items-center justify-center text-sm font-bold rounded-lg border-2 ${A.border} text-slate-700`}>{qty}</span>
                          <button onClick={() => changeQty(1)}
                            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold flex items-center justify-center transition-colors">+</button>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{con.uom}</span>
                        </div>

                        {/* Edit / Delete */}
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditCon(con)} className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="Edit">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => handleConRemove(con.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-400">Default quantities are pre-filled at billing time</p>
              <button
                onClick={() => { setSelectedDef(null); setConsumables([]); setConError(''); }}
                className="px-4 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit consumable modal */}
      {/* Add / Edit consumable modal */}
      {showAddModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${editCon ? 'bg-blue-100' : 'bg-teal-100'}`}>
                          {editCon
                            ? <svg className="w-4.5 h-4.5 text-blue-600 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            : <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          }
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">{editCon ? 'Edit Consumable' : 'Add Consumable'}</h3>
                          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[280px]">{selectedDef.study_name}</p>
                        </div>
                      </div>
                      <button onClick={closeConModal} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>

                    <form onSubmit={handleConSave} className="px-6 py-5 space-y-4">
                      {conError && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {conError}
                        </div>
                      )}

                      {/* Stock item — read-only in edit mode */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Stock Item <span className="text-red-400">*</span>
                        </label>
                        {editCon ? (
                          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{editCon.item_name}</p>
                              <p className="text-xs text-slate-400 font-mono">{editCon.item_code} · {editCon.uom}</p>
                            </div>
                          </div>
                        ) : (
                          <select value={addForm.item_master_id}
                            onChange={e => {
                              const item = stockItems.find(i => String(i.id) === e.target.value);
                              setAddForm(f => ({ ...f, item_master_id: e.target.value, uom: item?.uom || '', default_qty: '1' }));
                            }}
                            className={inputCls} required autoFocus>
                            <option value="">{stockItems.length === 0 ? 'Loading stock items…' : 'Select a stock item…'}</option>
                            {stockItems.map(item => (
                              <option key={item.id} value={item.id}>{item.item_name} — {item.uom}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Qty stepper */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Default Quantity {addForm.uom && <span className="normal-case font-normal text-teal-600 ml-1">({addForm.uom})</span>}
                        </label>
                        <div className="flex items-center gap-3">
                          <button type="button"
                            onClick={() => setAddForm(f => ({ ...f, default_qty: String(Math.max(1, (parseInt(f.default_qty) || 1) - 1)) }))}
                            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xl font-bold flex items-center justify-center transition-colors flex-shrink-0">−</button>
                          <input type="number" min="1" step="1"
                            value={addForm.default_qty}
                            onChange={e => setAddForm(f => ({ ...f, default_qty: e.target.value }))}
                            className="flex-1 px-3 py-2.5 text-lg font-bold text-center border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                            required />
                          <button type="button"
                            onClick={() => setAddForm(f => ({ ...f, default_qty: String((parseInt(f.default_qty) || 0) + 1) }))}
                            className="w-10 h-10 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-xl font-bold flex items-center justify-center transition-colors flex-shrink-0">+</button>
                        </div>
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notes <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                        <input type="text" value={addForm.notes}
                          onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="e.g. Adult dose, 50ml vial…"
                          className={inputCls} />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3 pt-2">
                        <button type="button" onClick={closeConModal}
                          className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                          Cancel
                        </button>
                        <button type="submit" disabled={conSaving}
                          className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50 transition-colors shadow-sm ${editCon ? 'bg-blue-600 hover:bg-blue-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
                          {conSaving ? 'Saving…' : editCon ? 'Update Consumable' : 'Add Consumable'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

      {/* Add/Edit study modal */}
      {defModal && (
        <SmModal title={editDef ? 'Edit Study' : 'Add Study to Catalogue'} onClose={closeDefModal} onSave={saveDefForm} saving={defSaving} submitError={defErr}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Study Code <span className="text-red-500">*</span></label>
            <input type="text" value={defForm.study_code} onChange={setD('study_code')} placeholder="e.g. MRI_BRAIN_PLAIN" className={fldD('study_code')} style={{ border: defErrors.study_code ? '1.5px solid #f87171' : '1.5px solid #94a3b8' }} />
            {defErrors.study_code && <p className="mt-1 text-xs text-red-500">{defErrors.study_code}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Study Name <span className="text-red-500">*</span></label>
            <input type="text" value={defForm.study_name} onChange={setD('study_name')} placeholder="e.g. MRI Brain Plain" className={fldD('study_name')} style={{ border: defErrors.study_name ? '1.5px solid #f87171' : '1.5px solid #94a3b8' }} />
            {defErrors.study_name && <p className="mt-1 text-xs text-red-500">{defErrors.study_name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Modality <span className="text-red-500">*</span></label>
              <select value={defForm.modality} onChange={setD('modality')} className={fldD('modality')} style={{ border: defErrors.modality ? '1.5px solid #f87171' : '1.5px solid #94a3b8' }}>
                {MODALITIES_LIST.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              {defErrors.modality && <p className="mt-1 text-xs text-red-500">{defErrors.modality}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Study Type</label>
              <select value={defForm.study_type} onChange={setD('study_type')} className={fldD('study_type')} style={{ border: '1.5px solid #94a3b8' }}>
                <option value="Plain">Plain</option>
                <option value="Contrast">Contrast</option>
                <option value="Special">Special</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input type="text" value={defForm.description} onChange={setD('description')} placeholder="Optional notes" className={fldD('description')} style={{ border: '1.5px solid #94a3b8' }} />
          </div>
          {/* GST / HSN Section */}
          <div className="border-t border-slate-200 pt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">GST & Compliance</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">SAC Code</label>
                <input type="text" value={defForm.sac_code} onChange={setD('sac_code')}
                  placeholder="e.g. 999316" maxLength={8} className={fldD('sac_code')}
                  style={{ border: '1.5px solid #94a3b8' }} />
                <p className="text-xs text-slate-400 mt-0.5">999316 — Diagnostic imaging</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">HSN Code</label>
                <input type="text" value={defForm.hsn_code} onChange={setD('hsn_code')}
                  placeholder="Optional" maxLength={8} className={fldD('hsn_code')}
                  style={{ border: '1.5px solid #94a3b8' }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">GST Rate %</label>
                <select value={defForm.gst_rate} onChange={setD('gst_rate')} className={fldD('gst_rate')} style={{ border: '1.5px solid #94a3b8' }}>
                  <option value="0">0% — Exempt</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                </select>
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input type="checkbox" id="gst_applicable" checked={defForm.gst_applicable}
                  onChange={e => setDefForm(p => ({ ...p, gst_applicable: e.target.checked, gst_rate: e.target.checked ? p.gst_rate : '0' }))}
                  className="w-4 h-4 rounded border-slate-300 text-teal-600" />
                <label htmlFor="gst_applicable" className="text-sm text-slate-700 cursor-pointer">GST Applicable</label>
              </div>
            </div>
          </div>
        </SmModal>
      )}
    </div>
  );
};

// ── StudyRow — memoized so only the changed row re-renders on price input ─────
const StudyRow = React.memo(({ sd, price, onSetPrice, onRemove }) => {
  const p = price || { value: '', dirty: false, existingId: null };
  const hasPrice = p.existingId && !p.dirty;
  const isNew    = !p.existingId && p.value !== '';
  return (
    <div className={`flex items-center gap-4 px-5 py-2.5 transition-colors ${p.dirty ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{sd.study_name}</div>
        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{sd.study_code}</div>
      </div>
      <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_BADGE[sd.study_type] || TYPE_BADGE.Plain}`}>
        {sd.study_type || 'Plain'}
      </span>
      <span className={`flex-shrink-0 text-[10px] font-medium w-16 text-right ${p.dirty ? 'text-amber-600' : hasPrice ? 'text-teal-600' : 'text-slate-300'}`}>
        {p.dirty ? (isNew ? 'New' : 'Edited') : hasPrice ? 'Priced' : 'Not set'}
      </span>
      <div className="flex-shrink-0 relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
        <input type="number" min="0" step="1" value={p.value}
          onChange={e => onSetPrice(sd.id, e.target.value)} placeholder="—"
          className={`w-28 pl-6 pr-2 py-1.5 text-sm rounded-lg border text-right font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${
            p.dirty ? 'border-amber-400 bg-amber-50 text-amber-800'
              : hasPrice ? 'border-teal-200 bg-teal-50 text-teal-800'
              : 'border-slate-200 bg-white text-slate-600'}`} />
      </div>
      <button onClick={() => onRemove(p.existingId, sd.id)}
        className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${p.value !== '' ? 'text-slate-300 hover:text-red-400' : 'invisible'}`}
        title="Clear">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  );
});

// ── StudyPricing — center × study pricing screen ─────────────────────────────
const StudyPricing = ({ studyDefs, studyPricing, centers, centerModMap, onPricingBatch, onPricingCreate, onPricingUpdate, onPricingDelete }) => {
  const activeCenters = useMemo(() => (centers || []).filter(c => c.active !== false && c.corporate_entity_id != null), [centers]);
  const [selectedCenter, setSelectedCenter] = useState('');
  const [filterModality, setFilterModality] = useState('');
  const [search, setSearch]                 = useState('');
  const [prices, setPrices]                 = useState({});
  const [saving, setSaving]                 = useState(false);
  const [saveMsg, setSaveMsg]               = useState('');

  // Use pre-loaded modality map from parent; fall back to empty set
  const centerModCodes = useMemo(
    () => (centerModMap && selectedCenter && centerModMap[selectedCenter]) ? centerModMap[selectedCenter] : new Set(),
    [centerModMap, selectedCenter]
  );
  const modsLoading = false; // data is pre-loaded by parent

  // initialise selected center once centers load
  useEffect(() => {
    if (!selectedCenter && activeCenters.length) setSelectedCenter(String(activeCenters[0].id));
  }, [activeCenters, selectedCenter]);

  // rebuild price map when center or pricing data changes
  useEffect(() => {
    if (!selectedCenter) return;
    const map = {};
    (studyDefs || []).forEach(sd => {
      const existing = (studyPricing || []).find(
        p => String(p.study_definition_id) === String(sd.id) && String(p.center_id) === String(selectedCenter)
      );
      map[sd.id] = { value: existing ? String(existing.base_rate) : '', dirty: false, existingId: existing?.id || null };
    });
    setPrices(map);
  }, [selectedCenter, studyPricing, studyDefs]);

  const setPrice = useCallback((defId, val) =>
    setPrices(p => ({ ...p, [defId]: { ...p[defId], value: val, dirty: true } })), []);

  const removePricingCb = useCallback((existingId, defId) => {
    if (!window.confirm('Remove pricing for this study at this centre?')) return;
    onPricingDelete(existingId)
      .then(() => setPrices(p => ({ ...p, [defId]: { value: '', dirty: false, existingId: null } })))
      .catch(err => alert(err.message));
  }, [onPricingDelete]);

  const saveAll = async () => {
    const dirty = Object.entries(prices)
      .filter(([, v]) => v.dirty && v.value !== '')
      .map(([defId, { value }]) => ({ study_definition_id: parseInt(defId), base_rate: parseFloat(value) }))
      .filter(({ base_rate }) => !isNaN(base_rate) && base_rate >= 0);
    if (!dirty.length) return;
    setSaving(true); setSaveMsg('');
    try {
      // Single batch request — all prices saved in one DB transaction
      await onPricingBatch(parseInt(selectedCenter), dirty);
      setSaveMsg(`Saved ${dirty.length} stud${dirty.length > 1 ? 'ies' : 'y'}`);
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) { setSaveMsg('Error: ' + (err.message || 'Save failed')); }
    setSaving(false);
  };


  // only show studies for modalities enabled at this center; apply search + filter on top
  const grouped = useMemo(() => {
    const list = (studyDefs || []).filter(sd => {
      if (!centerModCodes.has(sd.modality)) return false;          // ← modality not enabled here
      const mOk = !filterModality || sd.modality === filterModality;
      const sOk = !search || sd.study_name.toLowerCase().includes(search.toLowerCase());
      return mOk && sOk && sd.active !== false;
    });
    return MODALITIES_LIST
      .map(m => ({ ...m, studies: list.filter(sd => sd.modality === m.id) }))
      .filter(g => g.studies.length > 0);
  }, [studyDefs, filterModality, search, centerModCodes]);

  // modality filter dropdown: only show enabled modalities for this center
  const availableModalities = useMemo(
    () => MODALITIES_LIST.filter(m => centerModCodes.has(m.id)),
    [centerModCodes]
  );

  const dirtyCount  = Object.values(prices).filter(v => v.dirty && v.value !== '').length;
  const pricedCount = Object.values(prices).filter(v => v.existingId).length;
  const centerName  = activeCenters.find(c => String(c.id) === String(selectedCenter))?.name || '';

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-3 bg-gradient-to-r from-teal-600 to-teal-500 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white">Study Pricing</h3>
          <p className="text-xs text-teal-100 mt-0.5">
            {centerName
              ? centerModCodes.size === 0
                ? `No modalities enabled at ${centerName}`
                : `${pricedCount} priced · ${centerModCodes.size} modalities enabled at ${centerName}`
              : 'Select a centre to set prices'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {saveMsg && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${saveMsg.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {saveMsg}
            </span>
          )}
          {dirtyCount > 0 && (
            <button onClick={saveAll} disabled={saving}
              className="inline-flex items-center gap-1.5 bg-white text-teal-700 text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-teal-50 disabled:opacity-50 shadow-sm">
              {saving ? 'Saving…' : `Save ${dirtyCount} change${dirtyCount > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>

      {/* ── Centre tabs ── */}
      <div className="flex items-center gap-1 px-4 py-2 bg-slate-50 border-b border-slate-200 overflow-x-auto">
        {activeCenters.map(c => (
          <button key={c.id} onClick={() => setSelectedCenter(String(c.id))}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              String(selectedCenter) === String(c.id)
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
            }`}>
            {c.name}
          </button>
        ))}
      </div>

      {/* ── Search & modality filter ── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 bg-white">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search study…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <select value={filterModality} onChange={e => setFilterModality(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-600">
          <option value="">All Modalities</option>
          {availableModalities.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        {(filterModality || search) && (
          <button onClick={() => { setSearch(''); setFilterModality(''); }} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
        )}
      </div>

      {/* ── Studies grouped by modality ── */}
      {!selectedCenter ? (
        <div className="py-16 text-center text-slate-400 text-sm">Select a centre above to set prices.</div>
      ) : modsLoading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading modalities…</div>
      ) : centerModCodes.size === 0 ? (
        <div className="py-14 flex flex-col items-center gap-3 text-slate-400">
          <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/>
          </svg>
          <p className="text-sm font-medium text-slate-500">No modalities enabled at {centerName}</p>
          <p className="text-xs text-slate-400">Go to <span className="font-semibold text-teal-600">Center Modalities</span> tab to enable modalities for this center first.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
          {grouped.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-sm">No studies match your search.</div>
          )}
          {grouped.map(group => {
            const mc = MODALITY_COLOR[group.color || 'slate'];
            const groupPriced = group.studies.filter(sd => prices[sd.id]?.existingId).length;
            return (
              <div key={group.id}>
                {/* Modality section header */}
                <div className={`sticky top-0 z-10 flex items-center justify-between px-5 py-2 border-b border-slate-200 ${mc.badge}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider">{group.label}</span>
                    <span className="text-[10px] text-slate-400">{group.studies.length} studies</span>
                  </div>
                  <span className="text-[10px] text-slate-400">{groupPriced} priced</span>
                </div>

                {/* Study rows — memoized to only re-render changed rows */}
                {group.studies.map(sd => (
                  <StudyRow key={sd.id} sd={sd} price={prices[sd.id]} onSetPrice={setPrice} onRemove={removePricingCb} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Sticky save footer ── */}
      {dirtyCount > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between px-5 py-3 bg-amber-50 border-t-2 border-amber-300">
          <span className="text-xs text-amber-700 font-medium">{dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</span>
          <div className="flex items-center gap-3">
            <button
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => {
                setPrices(prev => {
                  const reset = { ...prev };
                  Object.keys(reset).forEach(k => {
                    if (reset[k].dirty) reset[k] = { ...reset[k], dirty: false, value: reset[k].existingId ? reset[k].value : '' };
                  });
                  return reset;
                });
              }}>
              Discard
            </button>
            <button onClick={saveAll} disabled={saving}
              className="px-5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 shadow-sm">
              {saving ? 'Saving…' : `Save ${dirtyCount} change${dirtyCount > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


// ─── RAD-Reporting Master Component ──────────────────────────────────────────

// Prefix "Dr." only for individual radiologists, not teleradiology companies
const drName = (name, reporter_type) =>
  reporter_type === 'RADIOLOGIST' ? `Dr. ${name}` : name;

const EMPTY_REPORTER_FORM = {
  reporter_type: 'RADIOLOGIST',
  first_name: '', last_name: '', name: '',
  contact_phone: '', contact_email: '', address: '',
  vendor_code: '',
  pan_number: '', bank_account_number: '', bank_name: '', ifsc_code: '', upi_id: '',
  tds_rate: 10, credit_days: 30,
  study_rates: [],
  status: 'active',
};

const RadReportingMaster = ({ reporters, studies, onReporterCreate, onReporterUpdate, onReporterDelete }) => {
  const [selected, setSelected]       = useState(null);   // reporter being viewed
  const [mode, setMode]               = useState('view'); // 'view' | 'edit' | 'add'
  const [form, setForm]               = useState(EMPTY_REPORTER_FORM);
  const [errors, setErrors]           = useState({});
  const [saving, setSaving]           = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [searchQ, setSearchQ]         = useState('');
  const [filterType, setFilterType]   = useState('');
  // study rates inline state
  const [rateSearch, setRateSearch]   = useState('');
  const [rateFilter, setRateFilter]   = useState('');
  const [rateDirty, setRateDirty]     = useState({});     // { study_id: newRate }
  // vendor search (teleradiology add/edit)
  const [vendorSearchQ, setVendorSearchQ]       = useState('');
  const [vendorResults, setVendorResults]       = useState([]);
  const [vendorSearching, setVendorSearching]   = useState(false);
  const [vendorDropOpen, setVendorDropOpen]     = useState(false);
  const vendorSearchRef = useRef(null);

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }));
  const ic  = (f) => `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${errors[f] ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`;

  // Vendor search — debounced fetch from vendor_master
  useEffect(() => {
    if (!vendorSearchQ.trim() || form.reporter_type !== 'TELERADIOLOGY') {
      setVendorResults([]); setVendorDropOpen(false); return;
    }
    const t = setTimeout(() => {
      setVendorSearching(true);
      fetch(`/api/vendors?vendor_type=SERVICE&search=${encodeURIComponent(vendorSearchQ)}&active=true`, { headers: AUTH_HEADER() })
        .then(r => r.ok ? r.json() : { vendors: [] })
        .then(d => { setVendorResults(d.vendors || []); setVendorDropOpen(true); })
        .catch(() => setVendorResults([]))
        .finally(() => setVendorSearching(false));
    }, 280);
    return () => clearTimeout(t);
  }, [vendorSearchQ, form.reporter_type]);

  const applyVendor = (v) => {
    setForm(p => ({
      ...p,
      name:              v.vendor_name,
      vendor_code:       v.vendor_code,
      contact_phone:     v.phone        || p.contact_phone,
      contact_email:     v.email        || p.contact_email,
      address:           [v.address, v.city, v.state, v.postal_code].filter(Boolean).join(', '),
      pan_number:        v.pan_number   || p.pan_number,
      bank_account_number: v.bank_account_number || p.bank_account_number,
      bank_name:         v.bank_name    || p.bank_name,
      ifsc_code:         v.ifsc_code    || p.ifsc_code,
    }));
    setVendorSearchQ(v.vendor_name);
    setVendorDropOpen(false);
    setVendorResults([]);
  };

  const formFromReporter = (r) => ({
    reporter_type: r.reporter_type || 'RADIOLOGIST',
    first_name: r.first_name || '', last_name: r.last_name || '',
    name: r.name || '',
    contact_phone: r.contact_phone || '', contact_email: r.contact_email || '',
    address: r.address || '', vendor_code: r.vendor_code || '',
    pan_number: r.pan_number || '', bank_account_number: r.bank_account_number || '',
    bank_name: r.bank_name || '', ifsc_code: r.ifsc_code || '', upi_id: r.upi_id || '',
    tds_rate: r.tds_rate ?? 10, credit_days: r.credit_days ?? 30,
    study_rates: Array.isArray(r.study_rates) ? r.study_rates.map(s => ({ ...s, rate: parseFloat(s.rate) || 0 })) : [],
    status: r.active ? 'active' : 'inactive',
  });

  const resetVendorSearch = () => { setVendorSearchQ(''); setVendorResults([]); setVendorDropOpen(false); };

  const openAdd = () => {
    setSelected(null); setForm(EMPTY_REPORTER_FORM);
    setErrors({}); setSubmitError(''); setRateDirty({}); resetVendorSearch(); setMode('add');
  };
  const openEdit = (r) => {
    setSelected(r); setForm(formFromReporter(r));
    setErrors({}); setSubmitError(''); setRateDirty({});
    // pre-fill vendor search box if editing a teleradiology entry
    setVendorSearchQ(r.reporter_type === 'TELERADIOLOGY' ? (r.name || '') : '');
    setVendorResults([]); setVendorDropOpen(false);
    setMode('edit');
  };
  const openView = (r) => {
    setSelected(r); setRateDirty({}); resetVendorSearch(); setMode('view');
  };
  const cancel = () => {
    resetVendorSearch();
    if (selected) { setMode('view'); setErrors({}); setSubmitError(''); }
    else setMode('view');
  };

  const validate = () => {
    const e = {};
    if (form.reporter_type === 'RADIOLOGIST') {
      if (!form.first_name.trim()) e.first_name = 'Required';
      if (!form.last_name.trim())  e.last_name  = 'Required';
    } else {
      if (!form.name.trim()) e.name = 'Required';
    }
    return e;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setSubmitError('');
    try {
      if (mode === 'edit' && selected) {
        await onReporterUpdate(selected.id, form);
        setSelected(prev => ({ ...prev, ...form, id: prev.id }));
      } else {
        await onReporterCreate(form);
      }
      setMode('view'); setErrors({});
    } catch (err) { setSubmitError(err.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete "${r.name}"?`)) return;
    try {
      await onReporterDelete(r.id);
      if (selected?.id === r.id) { setSelected(null); setMode('view'); }
    } catch (err) { alert(err.message); }
  };

  // ── Study rates inline save ──────────────────────────────────────────────
  const setStudyRate = (studyId, val) =>
    setRateDirty(p => ({ ...p, [studyId]: val }));

  const saveStudyRates = () => {
    if (!selected && mode !== 'edit') return;
    const existing = (mode === 'edit' ? form.study_rates : selected?.study_rates) || [];
    const merged = [...existing];
    Object.entries(rateDirty).forEach(([sid, val]) => {
      const id = parseInt(sid);
      const rate = parseFloat(val) || 0;
      const idx = merged.findIndex(x => x.study_id === id);
      if (idx >= 0) merged[idx] = { ...merged[idx], rate };
      else {
        const std = studies.find(s => s.id === id);
        if (std) merged.push({ study_id: id, study_name: std.study_name, rate });
      }
    });
    setForm(p => ({ ...p, study_rates: merged }));
    setRateDirty({});
  };

  // ── Filtered reporters list ──────────────────────────────────────────────
  const filteredReporters = useMemo(() => (reporters || []).filter(r => {
    const q = searchQ.toLowerCase();
    const nameMatch = !q || (r.name || '').toLowerCase().includes(q) || (r.radiologist_code || '').toLowerCase().includes(q);
    const typeMatch = !filterType || r.reporter_type === filterType;
    return nameMatch && typeMatch;
  }), [reporters, searchQ, filterType]);

  // ── Study rate display (view mode) ──────────────────────────────────────
  const displayRates = (mode === 'edit' ? form.study_rates : selected?.study_rates) || [];
  const rateMap = useMemo(() => {
    const m = {};
    displayRates.forEach(sr => { m[sr.study_id] = sr.rate; });
    return m;
  }, [displayRates]);

  const groupedStudies = useMemo(() => {
    const list = (studies || []).filter(s => {
      const q = rateSearch.toLowerCase();
      const mOk = !rateFilter || s.modality === rateFilter;
      const sOk = !rateSearch || s.study_name.toLowerCase().includes(q);
      return mOk && sOk;
    });
    return MODALITIES_LIST
      .map(m => ({ ...m, studies: list.filter(s => s.modality === m.id) }))
      .filter(g => g.studies.length > 0);
  }, [studies, rateSearch, rateFilter]);

  const dirtyCount = Object.keys(rateDirty).length;
  const ratedCount = displayRates.length;

  // ── Other reporters with rates for each study (excluding current) ────────
  const otherReporterMap = useMemo(() => {
    const currentId = selected?.id;
    const map = {};
    (reporters || []).forEach(r => {
      if (r.id === currentId) return;
      (r.study_rates || []).forEach(sr => {
        if (!map[sr.study_id]) map[sr.study_id] = [];
        map[sr.study_id].push({ id: r.id, name: r.name, rate: sr.rate, reporter_type: r.reporter_type });
      });
    });
    return map;
  }, [reporters, selected?.id]);

  // ── Type badge ──────────────────────────────────────────────────────────
  const TypeBadge = ({ type }) => type === 'TELERADIOLOGY'
    ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wide">Telerad</span>
    : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-700 uppercase tracking-wide">Radiologist</span>;

  const SectionLabel = ({ children }) => (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 mt-1">{children}</p>
  );

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden flex" style={{ minHeight: 600 }}>

      {/* ══ LEFT — Reporter List ══════════════════════════════════════════════ */}
      <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col bg-slate-50">

        {/* List header */}
        <div className="px-4 py-3 bg-gradient-to-r from-teal-600 to-teal-500 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">Reporters</p>
            <p className="text-[10px] text-teal-100">{(reporters || []).length} total</p>
          </div>
          <button onClick={openAdd}
            className="inline-flex items-center gap-1 bg-white text-teal-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-teal-50">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
            Add
          </button>
        </div>

        {/* Filters */}
        <div className="px-3 py-2 border-b border-slate-200 space-y-1.5">
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search name / code…"
            className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <div className="flex gap-1">
            {['', 'RADIOLOGIST', 'TELERADIOLOGY'].map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`flex-1 text-[10px] font-semibold py-1 rounded-md transition-all ${filterType === t ? 'bg-teal-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}>
                {t === '' ? 'All' : t === 'RADIOLOGIST' ? 'Radiologist' : 'Telerad'}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredReporters.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">No reporters found.</p>
          ) : filteredReporters.map(r => (
            <button key={r.id} onClick={() => openView(r)}
              className={`w-full text-left px-4 py-3 transition-colors ${selected?.id === r.id ? 'bg-teal-50 border-r-2 border-teal-600' : 'hover:bg-white'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{drName(r.name, r.reporter_type)}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{r.radiologist_code}</p>
                </div>
                <TypeBadge type={r.reporter_type} />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-slate-500">
                  {r.credit_days ?? 30}d credit
                </span>
                <span className="text-slate-200">·</span>
                <span className="text-[10px] text-slate-500">
                  {(r.study_rates || []).length} studies
                </span>
                <span className={`ml-auto inline-block w-1.5 h-1.5 rounded-full ${r.active ? 'bg-green-400' : 'bg-slate-300'}`} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ══ RIGHT — Detail / Form panel ══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Empty state ── */}
        {!selected && mode !== 'add' && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
            <svg className="w-12 h-12 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            <p className="text-sm font-medium text-slate-400">Select a reporter to view details</p>
            <button onClick={openAdd} className="text-xs text-teal-600 hover:underline">or add a new one</button>
          </div>
        )}

        {/* ── View mode ── */}
        {selected && mode === 'view' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Detail header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm flex-shrink-0">
                  {(selected.reporter_type === 'RADIOLOGIST' ? 'D' : (selected.name || '?')[0].toUpperCase())}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-bold text-slate-800">{drName(selected.name, selected.reporter_type)}</p>
                    <TypeBadge type={selected.reporter_type} />
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${selected.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {selected.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">{selected.radiologist_code}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(selected)}
                  className="px-3 py-1.5 text-xs font-semibold text-teal-700 border border-teal-300 rounded-lg hover:bg-teal-50">
                  Edit
                </button>
                <button onClick={() => handleDelete(selected)}
                  className="px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
                  Delete
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 divide-x divide-slate-100">

                {/* Left col: profile + payment */}
                <div className="p-6 space-y-5">
                  <div>
                    <SectionLabel>Contact</SectionLabel>
                    <div className="space-y-2 text-sm text-slate-700">
                      {selected.contact_phone && <div className="flex gap-2"><span className="text-slate-400 w-14 text-xs">Phone</span>{selected.contact_phone}</div>}
                      {selected.contact_email && <div className="flex gap-2"><span className="text-slate-400 w-14 text-xs">Email</span>{selected.contact_email}</div>}
                      {selected.address      && <div className="flex gap-2"><span className="text-slate-400 w-14 text-xs">Address</span><span className="text-sm">{selected.address}</span></div>}
                      {selected.reporter_type === 'TELERADIOLOGY' && (
                        <div className="flex gap-2 items-center">
                          <span className="text-slate-400 w-14 text-xs">Vendor</span>
                          {selected.vendor_code
                            ? <span className="bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded text-xs font-mono">{selected.vendor_code}</span>
                            : <span className="text-red-400 text-xs">Not linked to vendor master</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Payment Terms</SectionLabel>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-amber-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-amber-700">{selected.credit_days ?? 30}</p>
                        <p className="text-[10px] text-amber-600 font-medium mt-0.5">Credit Days</p>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-blue-700">{selected.tds_rate ?? 10}%</p>
                        <p className="text-[10px] text-blue-600 font-medium mt-0.5">TDS (194J)</p>
                      </div>
                    </div>
                  </div>

                  {selected.reporter_type === 'RADIOLOGIST' && (selected.pan_number || selected.bank_name) && (
                    <div>
                      <SectionLabel>Banking</SectionLabel>
                      <div className="space-y-1.5 text-sm">
                        {selected.pan_number && <div className="flex gap-2"><span className="text-slate-400 w-14 text-xs">PAN</span><span className="font-mono font-semibold text-slate-700">{selected.pan_number}</span></div>}
                        {selected.bank_name  && <div className="flex gap-2"><span className="text-slate-400 w-14 text-xs">Bank</span>{selected.bank_name}</div>}
                        {selected.bank_account_number && <div className="flex gap-2"><span className="text-slate-400 w-14 text-xs">A/C</span><span className="font-mono text-slate-700">{selected.bank_account_number}</span></div>}
                        {selected.ifsc_code  && <div className="flex gap-2"><span className="text-slate-400 w-14 text-xs">IFSC</span><span className="font-mono text-slate-700">{selected.ifsc_code}</span></div>}
                        {selected.upi_id     && <div className="flex gap-2"><span className="text-slate-400 w-14 text-xs">UPI</span>{selected.upi_id}</div>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right col: study rates summary */}
                <div className="p-6">
                  <SectionLabel>Study Rates — {ratedCount} configured</SectionLabel>
                  {ratedCount === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <p className="text-sm">No study rates set.</p>
                      <button onClick={() => openEdit(selected)} className="mt-2 text-xs text-teal-600 hover:underline">Click Edit to add rates</button>
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                      {displayRates.map(sr => {
                        const others = otherReporterMap[sr.study_id] || [];
                        return (
                          <div key={sr.study_id} className="py-1.5 border-b border-slate-50">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-xs text-slate-700 truncate flex-1">
                                {sr.study_name}
                                {sr.is_contrast && <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700">Contrast</span>}
                              </span>
                              <span className="text-sm font-bold text-teal-700 ml-3 flex-shrink-0">₹{Number(sr.rate).toLocaleString('en-IN')}</span>
                            </div>
                            {others.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {others.slice(0, 3).map(o => (
                                  <span key={o.id} title={drName(o.name, o.reporter_type)}
                                    className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                      o.reporter_type === 'TELERADIOLOGY'
                                        ? 'bg-indigo-50 text-indigo-600'
                                        : 'bg-teal-50 text-teal-600'
                                    }`}>
                                    {o.reporter_type === 'RADIOLOGIST' ? `Dr. ${o.name.split(' ')[0]}` : o.name.split(' ')[0]} · ₹{Number(o.rate).toLocaleString('en-IN')}
                                  </span>
                                ))}
                                {others.length > 3 && (
                                  <span className="text-[9px] text-slate-400">+{others.length - 3} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Add / Edit form ── */}
        {(mode === 'add' || mode === 'edit') && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Form header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
              <p className="text-sm font-bold text-slate-800">{mode === 'add' ? 'Add Reporter' : `Edit — ${drName(selected?.name || '', selected?.reporter_type)}`}</p>
              <div className="flex items-center gap-2">
                {submitError && <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{submitError}</span>}
                <button type="button" onClick={cancel} className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={handleSubmit} disabled={saving}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50">
                  {saving ? 'Saving…' : mode === 'add' ? 'Create' : 'Save Changes'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 divide-x divide-slate-100">

                {/* ── Left: Profile + Payment ── */}
                <div className="p-6 space-y-4">

                  {/* Type selector */}
                  <div>
                    <SectionLabel>Reporter Type</SectionLabel>
                    <div className="flex gap-2">
                      {['RADIOLOGIST', 'TELERADIOLOGY'].map(t => (
                        <button key={t} type="button" onClick={() => { setForm(p => ({ ...p, reporter_type: t })); if (t === 'RADIOLOGIST') resetVendorSearch(); }}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${form.reporter_type === t ? 'bg-teal-600 text-white border-teal-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          {t === 'RADIOLOGIST' ? 'Radiologist' : 'Teleradiology Company'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <SectionLabel>{form.reporter_type === 'RADIOLOGIST' ? 'Name' : 'Company Details'}</SectionLabel>
                    {form.reporter_type === 'RADIOLOGIST' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">First Name <span className="text-red-500">*</span></label>
                          <input value={form.first_name} onChange={set('first_name')} className={ic('first_name')} placeholder="Anitha" autoFocus />
                          {errors.first_name && <p className="mt-1 text-xs text-red-500">{errors.first_name}</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Last Name <span className="text-red-500">*</span></label>
                          <input value={form.last_name} onChange={set('last_name')} className={ic('last_name')} placeholder="Krishnan" />
                          {errors.last_name && <p className="mt-1 text-xs text-red-500">{errors.last_name}</p>}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Vendor search */}
                        <div ref={vendorSearchRef} className="relative">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Search Vendor <span className="text-red-500">*</span>
                            <span className="text-slate-400 font-normal ml-1">— by name or code</span>
                          </label>
                          <div className="relative">
                            <input
                              value={vendorSearchQ}
                              onChange={e => { setVendorSearchQ(e.target.value); setForm(p => ({ ...p, name: e.target.value, vendor_code: '' })); }}
                              className={ic('name')}
                              placeholder="Type company name or vendor code…"
                              autoFocus
                              autoComplete="off"
                            />
                            {vendorSearching && (
                              <span className="absolute right-3 top-2.5 text-slate-400 text-xs">searching…</span>
                            )}
                          </div>
                          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}

                          {/* Dropdown results */}
                          {vendorDropOpen && vendorResults.length > 0 && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                              {vendorResults.map(v => (
                                <button key={v.id} type="button" onMouseDown={() => applyVendor(v)}
                                  className="w-full text-left px-3 py-2.5 hover:bg-teal-50 border-b border-slate-100 last:border-0 transition-colors">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-slate-800 truncate">{v.vendor_name}</span>
                                    <span className="text-[10px] font-mono text-teal-600 flex-shrink-0 bg-teal-50 px-1.5 py-0.5 rounded">{v.vendor_code}</span>
                                  </div>
                                  {(v.city || v.contact_person) && (
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      {[v.contact_person, v.city].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                          {vendorDropOpen && vendorResults.length === 0 && !vendorSearching && vendorSearchQ.trim() && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2.5 text-xs text-slate-400">
                              No vendors found — add the company in Vendors master first.
                            </div>
                          )}
                        </div>

                        {/* Read-only vendor code — filled by selection */}
                        {form.vendor_code && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg">
                            <svg className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-xs text-teal-700">Vendor linked: <strong className="font-mono">{form.vendor_code}</strong></span>
                            <button type="button" onClick={() => { setForm(p => ({ ...p, name: '', vendor_code: '' })); setVendorSearchQ(''); }}
                              className="ml-auto text-[10px] text-slate-400 hover:text-red-500">clear</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Contact */}
                  <div>
                    <SectionLabel>Contact</SectionLabel>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                          <input type="tel" value={form.contact_phone} onChange={set('contact_phone')} className={ic('contact_phone')} placeholder="+91 98000 00000" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                          <input type="email" value={form.contact_email} onChange={set('contact_email')} className={ic('contact_email')} placeholder="email@example.com" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
                        <textarea value={form.address} onChange={set('address')} rows={2} className={ic('address')} placeholder="Clinic / company address" />
                      </div>
                    </div>
                  </div>

                  {/* Payment Terms */}
                  <div>
                    <SectionLabel>Payment Terms</SectionLabel>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Credit Days</label>
                        <input type="number" min="0" max="365" value={form.credit_days}
                          onChange={e => setForm(p => ({ ...p, credit_days: parseInt(e.target.value) || 0 }))}
                          className={ic('credit_days')} placeholder="30" />
                        <p className="text-[10px] text-slate-400 mt-0.5">Days after report to pay</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">TDS Rate % (194J)</label>
                        <input type="number" min="0" max="30" step="0.5" value={form.tds_rate}
                          onChange={e => setForm(p => ({ ...p, tds_rate: parseFloat(e.target.value) || 0 }))}
                          className={ic('tds_rate')} placeholder="10" />
                        <p className="text-[10px] text-slate-400 mt-0.5">Default 10% professional fees</p>
                      </div>
                    </div>
                  </div>

                  {/* Banking — radiologist only */}
                  {form.reporter_type === 'RADIOLOGIST' && (
                    <div>
                      <SectionLabel>Banking & Tax</SectionLabel>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">PAN Number</label>
                            <input value={form.pan_number}
                              onChange={e => setForm(p => ({ ...p, pan_number: e.target.value.toUpperCase() }))}
                              className={ic('pan_number')} placeholder="AAAAA0000A" maxLength={10}
                              style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">UPI ID</label>
                            <input value={form.upi_id || ''} onChange={set('upi_id')} className={ic('upi_id')} placeholder="dr@hdfcbank" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Bank</label>
                          <select value={form.bank_name} onChange={set('bank_name')} className={ic('bank_name')}>
                            <option value="">Select bank…</option>
                            {INDIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Account Number</label>
                            <input value={form.bank_account_number} onChange={set('bank_account_number')}
                              className={ic('bank_account_number')} placeholder="Account number"
                              style={{ fontFamily: 'monospace' }} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">IFSC Code</label>
                            <input value={form.ifsc_code}
                              onChange={e => setForm(p => ({ ...p, ifsc_code: e.target.value.toUpperCase() }))}
                              className={ic('ifsc_code')} placeholder="HDFC0001234" maxLength={11}
                              style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Status */}
                  <div>
                    <SectionLabel>Status</SectionLabel>
                    <div className="flex gap-2">
                      {['active', 'inactive'].map(s => (
                        <button key={s} type="button" onClick={() => setForm(p => ({ ...p, status: s }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all capitalize ${form.status === s ? (s === 'active' ? 'bg-green-600 text-white border-green-600' : 'bg-slate-500 text-white border-slate-500') : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Right: Study Rates ── */}
                <div className="flex flex-col overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-700">Study Rates</p>
                      <p className="text-[10px] text-slate-400">{form.study_rates.length} configured</p>
                    </div>
                    {dirtyCount > 0 && (
                      <button type="button" onClick={saveStudyRates}
                        className="text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-100">
                        Apply {dirtyCount} change{dirtyCount > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>

                  {/* Search + filter */}
                  <div className="flex gap-2 px-4 py-2 border-b border-slate-100">
                    <input value={rateSearch} onChange={e => setRateSearch(e.target.value)} placeholder="Search study…"
                      className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500" />
                    <select value={rateFilter} onChange={e => setRateFilter(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white text-slate-600">
                      <option value="">All</option>
                      {MODALITIES_LIST.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </div>

                  {/* Inline study rate rows */}
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                    {groupedStudies.map(group => {
                      const mc = MODALITY_COLOR[group.color || 'slate'];
                      return (
                        <div key={group.id}>
                          <div className={`px-4 py-1.5 sticky top-0 z-10 ${mc.badge} border-b border-slate-100`}>
                            <span className="text-[10px] font-bold uppercase tracking-wider">{group.label}</span>
                          </div>
                          {group.studies.map(sd => {
                            const saved  = rateMap[sd.id] !== undefined;
                            const dirty  = rateDirty[sd.id] !== undefined;
                            const val    = dirty ? rateDirty[sd.id] : (rateMap[sd.id] !== undefined ? String(rateMap[sd.id]) : '');
                            const others = otherReporterMap[sd.id] || [];
                            return (
                              <div key={sd.id}
                                className={`flex items-start gap-3 px-4 py-2 transition-colors ${dirty ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                                <div className="flex-1 min-w-0 pt-0.5">
                                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                                    <span className="truncate">{sd.study_name}</span>
                                    {sd.is_contrast && <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700">Contrast</span>}
                                  </p>
                                  {others.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {others.slice(0, 4).map(o => (
                                        <span key={o.id} title={drName(o.name, o.reporter_type)}
                                          className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                            o.reporter_type === 'TELERADIOLOGY'
                                              ? 'bg-indigo-50 text-indigo-600'
                                              : 'bg-teal-50 text-teal-600'
                                          }`}>
                                          {o.reporter_type === 'RADIOLOGIST' ? `Dr. ${o.name.split(' ')[0]}` : o.name.split(' ')[0]} · ₹{Number(o.rate).toLocaleString('en-IN')}
                                        </span>
                                      ))}
                                      {others.length > 4 && (
                                        <span className="text-[9px] text-slate-400">+{others.length - 4} more</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <span className={`text-[9px] font-semibold w-10 text-right flex-shrink-0 mt-1 ${dirty ? 'text-amber-600' : saved ? 'text-teal-600' : 'text-slate-300'}`}>
                                  {dirty ? 'edited' : saved ? 'set' : '—'}
                                </span>
                                <div className="relative flex-shrink-0">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                                  <input type="number" min="0" step="1" value={val}
                                    onChange={e => setStudyRate(sd.id, e.target.value)}
                                    placeholder="—"
                                    className={`w-24 pl-5 pr-2 py-1 text-xs rounded-lg border text-right font-semibold focus:outline-none focus:ring-1 focus:ring-teal-500 transition-colors ${
                                      dirty ? 'border-amber-400 bg-amber-50 text-amber-800' : saved ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600'
                                    }`} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── User Master Component ────────────────────────────────────────────────

const EMPTY_USER_FORM = {
  first_name: '', last_name: '', username: '', email: '',
  password: '', role: '', center_id: '', phone: '', active: true,
};

const UserMaster = ({ users, roles, centers, onUserCreate, onUserUpdate, onUserDelete, onPasswordReset }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showResetModal, setShowResetModal] = useState(null); // user object
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [form, setForm] = useState(EMPTY_USER_FORM);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setForm(EMPTY_USER_FORM); setEditingUser(null); setErrors({}); setSubmitError(''); setShowModal(true); };
  const openEdit = (u) => {
    setForm({
      first_name: u.first_name || '', last_name: u.last_name || '',
      username: u.username || '', email: u.email || '', password: '',
      role: u.role || '', center_id: u.center_id ? String(u.center_id) : '',
      phone: u.phone || '', active: u.active !== false,
    });
    setEditingUser(u); setErrors({}); setSubmitError(''); setShowModal(true);
  };
  const closeModal = () => setShowModal(false);

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.first_name.trim() && !form.last_name.trim()) e.first_name = 'At least first or last name required';
    if (!form.username.trim()) e.username = 'Username is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email required';
    if (!editingUser && !form.password.trim()) e.password = 'Password is required';
    else if (!editingUser && form.password.length < 8) e.password = 'Minimum 8 characters';
    if (!form.role) e.role = 'Role is required';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true); setSubmitError('');
    try {
      const payload = { ...form, center_id: form.center_id || null, active: form.active };
      if (editingUser) {
        delete payload.username;
        delete payload.password;
        await onUserUpdate(editingUser.id, payload);
      } else {
        await onUserCreate(payload);
      }
      closeModal();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Deactivate user "${u.name || u.username}"?`)) return;
    try { await onUserDelete(u.id); } catch (err) { alert(err.message); }
  };

  const handlePasswordReset = async () => {
    if (!newPassword || newPassword.length < 8) { setResetError('Minimum 8 characters required'); return; }
    setResetError(''); setResetting(true);
    try {
      await onPasswordReset(showResetModal.id, newPassword);
      setShowResetModal(null);
      setNewPassword('');
    } catch (err) {
      setResetError(err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const inputCls = (f) => `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${errors[f] ? 'border-red-400 bg-red-50' : 'border-slate-300'}`;
  const activeCenters = centers.filter(c => c.active);

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-teal-600 to-teal-500">
        <div>
          <h3 className="text-sm font-bold text-white">User Master</h3>
          <p className="text-xs text-teal-100 mt-0.5">Manage system users and their role assignments</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-1.5 bg-white text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
          Add User
        </button>
      </div>

      {users.length === 0 ? (
        <p className="text-center py-10 text-slate-400 text-sm">No users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(to right, #f1f5f9, #e2e8f0)' }}>
                {['Name','Username','Email','Role','Centre','Status','Actions'].map(h => (
                  <th key={h} style={{ border: '1px solid #cbd5e1', padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }} className="hover:bg-teal-50/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{u.name || [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs font-mono">{u.username}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block bg-indigo-50 text-indigo-700 text-[11px] font-semibold px-2 py-0.5 rounded">{u.role_name || u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{u.center_name || <span className="text-slate-300">All</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(u)} className="text-teal-600 hover:text-teal-800 font-semibold text-xs">Edit</button>
                      <button onClick={() => { setShowResetModal(u); setNewPassword(''); setResetError(''); }} className="text-amber-600 hover:text-amber-800 font-semibold text-xs">Reset Pwd</button>
                      <button onClick={() => handleDelete(u)} className="text-red-500 hover:text-red-700 font-semibold text-xs">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <h3 className="text-base font-semibold text-slate-800">{editingUser ? 'Edit User' : 'Add User'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {submitError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{submitError}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                  <input value={form.first_name} onChange={set('first_name')} placeholder="First name" className={inputCls('first_name')} />
                  {errors.first_name && <p className="mt-1 text-xs text-red-500">{errors.first_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                  <input value={form.last_name} onChange={set('last_name')} placeholder="Last name" className={inputCls('last_name')} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username <span className="text-red-500">*</span></label>
                <input value={form.username} onChange={set('username')} disabled={!!editingUser} placeholder="e.g. john.doe" className={inputCls('username') + (editingUser ? ' bg-slate-50 cursor-not-allowed' : '')} />
                {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-red-500">*</span></label>
                <input type="email" value={form.email} onChange={set('email')} placeholder="user@example.com" className={inputCls('email')} />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password <span className="text-red-500">*</span></label>
                  <input type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters" className={inputCls('password')} />
                  {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" className={inputCls('phone')} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role <span className="text-red-500">*</span></label>
                  <select value={form.role} onChange={set('role')} className={inputCls('role')}>
                    <option value="">Select role</option>
                    {roles.filter(r => r.active !== false).map(r => (
                      <option key={r.id} value={r.role}>{r.role_name}</option>
                    ))}
                  </select>
                  {errors.role && <p className="mt-1 text-xs text-red-500">{errors.role}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Centre</label>
                  <select value={form.center_id} onChange={set('center_id')} className={inputCls('center_id')}>
                    <option value="">All Centres</option>
                    {activeCenters.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {editingUser && (
                <div>
                  <label htmlFor="user-status" className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select id="user-status" value={form.active ? 'active' : 'inactive'} onChange={e => setForm(f => ({ ...f, active: e.target.value === 'active' }))} className={inputCls('active')}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
              <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60">
                {saving ? 'Saving…' : editingUser ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-800">Reset Password</h3>
              <button onClick={() => { setShowResetModal(null); setNewPassword(''); setResetError(''); }} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-slate-600">New password for <strong>{showResetModal.name || showResetModal.username}</strong></p>
              <input
                type="password"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setResetError(''); }}
                onKeyDown={e => e.key === 'Enter' && handlePasswordReset()}
                placeholder="New password (min. 8 characters)"
                autoFocus
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {resetError && <p className="text-xs text-red-500">{resetError}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => { setShowResetModal(null); setNewPassword(''); setResetError(''); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordReset}
                disabled={resetting}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60"
              >
                {resetting ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Role Master Component ────────────────────────────────────────────────

const PERMISSION_GROUPS = [
  { label: 'User Management',    perms: ['USER_VIEW','USER_CREATE','USER_UPDATE','USER_DELETE','USER_ASSIGN_ROLE'] },
  { label: 'Patients',           perms: ['PATIENT_VIEW','PATIENT_CREATE','PATIENT_UPDATE','PATIENT_DELETE','PATIENT_BILLING','PATIENT_INSURANCE'] },
  { label: 'Studies',            perms: ['STUDY_VIEW','STUDY_CREATE','STUDY_UPDATE','STUDY_DELETE','STUDY_REPORT','STUDY_ASSIGN_RADIOLOGIST','STUDY_PAYMENT'] },
  { label: 'Billing',            perms: ['BILLING_VIEW','BILLING_CREATE','BILLING_UPDATE','BILLING_DELETE','BILLING_PRINT','BILLING_PAYMENT','BILLING_DISCOUNT','BILLING_REFUND','BILLING_CANCEL_OWN'] },
  { label: 'Centres',            perms: ['CENTER_VIEW','CENTER_CREATE','CENTER_UPDATE','CENTER_DELETE','CENTER_MODALITIES','CENTER_SETTINGS'] },
  { label: 'Radiologist / Reporter', perms: ['RADIOLOGIST_VIEW','RADIOLOGIST_CREATE','RADIOLOGIST_UPDATE','RADIOLOGIST_DELETE','RADIOLOGIST_PAYMENT','RADIOLOGIST_REPORTING'] },
  { label: 'Employees',          perms: ['EMPLOYEE_VIEW','EMPLOYEE_CREATE','EMPLOYEE_UPDATE','EMPLOYEE_DELETE','EMPLOYEE_ATTENDANCE','EMPLOYEE_PAYROLL'] },
  { label: 'Payroll',            perms: ['PAYROLL_VIEW','PAYROLL_RUN','PAYROLL_APPROVE'] },
  { label: 'Vendors',            perms: ['VENDOR_VIEW','VENDOR_CREATE','VENDOR_UPDATE','VENDOR_DELETE','VENDOR_BILLING','VENDOR_PAYMENT'] },
  { label: 'Finance & Accounts', perms: ['JE_VIEW','JE_CREATE','JE_POST','JE_REVERSE','COA_VIEW','COA_CREATE','COA_UPDATE','COA_DELETE','PETTY_CASH_VIEW','PETTY_CASH_CREATE','PETTY_CASH_APPROVE'] },
  { label: 'Procurement',        perms: ['PR_VIEW','PR_CREATE','PR_APPROVE_L1','PR_APPROVE_L2','PO_VIEW','PO_CREATE','PO_APPROVE','PO_CANCEL','GRN_VIEW','GRN_CREATE','GRN_APPROVE'] },
  { label: 'Inventory',          perms: ['INVENTORY_VIEW','INVENTORY_CREATE','INVENTORY_UPDATE','INVENTORY_DELETE','INVENTORY_PURCHASE','INVENTORY_STOCK'] },
  { label: 'Assets',             perms: ['ASSET_VIEW','ASSET_CREATE','ASSET_UPDATE','ASSET_DISPOSE'] },
  { label: 'Reports',            perms: ['REPORTS_VIEW','REPORTS_PATIENT','REPORTS_BILLING','REPORTS_RADIOLOGY','REPORTS_EMPLOYEE','REPORTS_FINANCIAL','REPORTS_DOWNLOAD'] },
  { label: 'Dashboard',          perms: ['DASHBOARD_VIEW','DASHBOARD_ADMIN','DASHBOARD_FINANCIAL','DASHBOARD_CLINICAL','DASHBOARD_OPERATIONAL'] },
  { label: 'System / All Access',perms: ['SYSTEM_SETTINGS','SYSTEM_BACKUP','SYSTEM_LOGS','ALL_ACCESS'] },
];

const EMPTY_ROLE_FORM = {
  role: '', role_name: '', description: '',
  permissions: [], dashboard_widgets: [], report_access: [],
  is_corporate_role: false, can_access_all_centers: false,
  allowed_centers: [],
};

const RoleMaster = ({ roles, onRoleCreate, onRoleUpdate, onRoleDelete }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [form, setForm] = useState(EMPTY_ROLE_FORM);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setForm(EMPTY_ROLE_FORM); setEditingRole(null); setErrors({}); setSubmitError(''); setShowModal(true); };
  const openEdit = (r) => {
    setForm({
      role: r.role, role_name: r.role_name, description: r.description || '',
      permissions: r.permissions || [],
      dashboard_widgets: r.dashboard_widgets || [],
      report_access: r.report_access || [],
      is_corporate_role: !!r.is_corporate_role,
      can_access_all_centers: !!r.can_access_all_centers,
      allowed_centers: r.allowed_centers || [],
    });
    setEditingRole(r); setErrors({}); setSubmitError(''); setShowModal(true);
  };
  const closeModal = () => setShowModal(false);

  const validate = () => {
    const e = {};
    if (!form.role.trim()) e.role = 'Role Code is required';
    else if (!/^[A-Z0-9_]+$/.test(form.role.trim())) e.role = 'Only uppercase letters, numbers and underscores';
    if (!form.role_name.trim()) e.role_name = 'Display Name is required';
    if (!form.description.trim()) e.description = 'Description is required';
    return e;
  };

  const togglePerm = (perm) => setForm(f => ({
    ...f,
    permissions: f.permissions.includes(perm)
      ? f.permissions.filter(p => p !== perm)
      : [...f.permissions, perm],
  }));

  const toggleGroupAll = (group) => {
    const all = group.perms.every(p => form.permissions.includes(p));
    setForm(f => ({
      ...f,
      permissions: all
        ? f.permissions.filter(p => !group.perms.includes(p))
        : [...new Set([...f.permissions, ...group.perms])],
    }));
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true); setSubmitError('');
    try {
      const payload = { ...form, role: form.role.toUpperCase().trim() };
      if (editingRole) await onRoleUpdate(editingRole.id, payload);
      else await onRoleCreate(payload);
      closeModal();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete role "${r.role_name}"? This cannot be undone.`)) return;
    try { await onRoleDelete(r.id); } catch (err) { alert(err.message); }
  };

  const inputCls = (f) => `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${errors[f] ? 'border-red-400 bg-red-50' : 'border-slate-300'}`;

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-teal-600 to-teal-500">
        <div>
          <h3 className="text-sm font-bold text-white">Role Master</h3>
          <p className="text-xs text-teal-100 mt-0.5">Define roles and their permission sets for RBAC</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-1.5 bg-white text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
          Add Role
        </button>
      </div>

      {roles.length === 0 ? (
        <p className="text-center py-10 text-slate-400 text-sm">No roles found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(to right, #f1f5f9, #e2e8f0)' }}>
                {['Role Code','Display Name','Type','Permissions','Users','Actions'].map(h => (
                  <th key={h} style={{ border: '1px solid #cbd5e1', padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }} className="hover:bg-teal-50/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="inline-block bg-indigo-50 text-indigo-700 text-[11px] font-bold tracking-widest px-2 py-1 rounded uppercase">{r.role}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.role_name}</td>
                  <td className="px-4 py-3">
                    {r.is_corporate_role
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Corporate</span>
                      : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Centre</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{(r.permissions || []).length} permissions</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.user_count || 0} users</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(r)} className="text-teal-600 hover:text-teal-800 font-semibold text-xs">Edit</button>
                      <button onClick={() => handleDelete(r)} className="text-red-500 hover:text-red-700 font-semibold text-xs">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <h3 className="text-base font-semibold text-slate-800">{editingRole ? 'Edit Role' : 'Add Role'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {submitError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{submitError}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role Code <span className="text-red-500">*</span></label>
                  <input
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value.toUpperCase() }))}
                    disabled={!!editingRole}
                    placeholder="e.g. RECEPTIONIST"
                    className={inputCls('role') + (editingRole ? ' bg-slate-50 cursor-not-allowed' : '')}
                  />
                  {errors.role && <p className="mt-1 text-xs text-red-500">{errors.role}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Display Name <span className="text-red-500">*</span></label>
                  <input value={form.role_name} onChange={e => setForm(f => ({ ...f, role_name: e.target.value }))} placeholder="e.g. Front Desk Receptionist" className={inputCls('role_name')} />
                  {errors.role_name && <p className="mt-1 text-xs text-red-500">{errors.role_name}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description <span className="text-red-500">*</span></label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief description of this role's responsibilities" className={inputCls('description')} />
                {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description}</p>}
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.is_corporate_role} onChange={e => setForm(f => ({ ...f, is_corporate_role: e.target.checked }))} className="w-4 h-4 rounded accent-teal-600" />
                  <span className="text-sm text-slate-700">Corporate Role</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.can_access_all_centers} onChange={e => setForm(f => ({ ...f, can_access_all_centers: e.target.checked }))} className="w-4 h-4 rounded accent-teal-600" />
                  <span className="text-sm text-slate-700">Access All Centres</span>
                </label>
              </div>

              {/* Permissions matrix */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-700">Permissions</label>
                  <div className="flex gap-3 text-xs">
                    <button type="button" onClick={() => setForm(f => ({ ...f, permissions: PERMISSION_GROUPS.flatMap(g => g.perms) }))} className="text-teal-600 hover:underline">Select all</button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, permissions: [] }))} className="text-slate-500 hover:underline">Clear all</button>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {PERMISSION_GROUPS.map((group, gi) => {
                    const allSelected = group.perms.every(p => form.permissions.includes(p));
                    const someSelected = group.perms.some(p => form.permissions.includes(p));
                    return (
                      <div key={group.label} className={gi > 0 ? 'border-t border-slate-100' : ''}>
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 cursor-pointer" onClick={() => toggleGroupAll(group)}>
                          <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={() => toggleGroupAll(group)} className="w-3.5 h-3.5 accent-teal-600" onClick={e => e.stopPropagation()} />
                          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{group.label}</span>
                          <span className="ml-auto text-[10px] text-slate-400">{group.perms.filter(p => form.permissions.includes(p)).length}/{group.perms.length}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 px-3 py-2">
                          {group.perms.map(perm => (
                            <label key={perm} className="flex items-center gap-1.5 py-0.5 cursor-pointer">
                              <input type="checkbox" checked={form.permissions.includes(perm)} onChange={() => togglePerm(perm)} className="w-3.5 h-3.5 accent-teal-600" />
                              <span className="text-xs text-slate-600">{perm.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
              <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60">
                {saving ? 'Saving…' : editingRole ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Center Master Component ─────────────────────────────────────────────
const EMPTY_CENTER_FORM = { name: '', code: '', address: '', business_model: '', status: 'active' };

const CenterMaster = ({ centers, onCenterCreate, onCenterUpdate, onCenterDelete }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingCenter, setEditingCenter] = useState(null);
  const [form, setForm] = useState(EMPTY_CENTER_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const openAdd = () => { setForm(EMPTY_CENTER_FORM); setErrors({}); setEditingCenter(null); setSubmitError(''); setShowModal(true); };
  const openEdit = (c) => { setForm({ name: c.name, code: c.code, address: c.address || '', business_model: c.business_model || '', status: c.active ? 'active' : 'inactive' }); setErrors({}); setEditingCenter(c); setSubmitError(''); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditingCenter(null); setErrors({}); setSubmitError(''); };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Center Name is required';
    if (!form.code.trim()) {
      e.code = 'Center Code is required';
    } else {
      const duplicate = centers.find(c => c.code.toLowerCase() === form.code.trim().toLowerCase() && c.id !== editingCenter?.id);
      if (duplicate) e.code = 'Center Code already exists';
    }
    if (!form.address.trim()) e.address = 'Address is required';
    if (!form.business_model) e.business_model = 'Business Model is required';
    if (!form.status) e.status = 'Status is required';
    return e;
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    setSubmitError('');
    try {
      editingCenter ? await onCenterUpdate(editingCenter.id, form) : await onCenterCreate(form);
      closeModal();
    } catch (err) {
      setSubmitError(err.message || 'Failed to save center');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this center?')) return;
    try { await onCenterDelete(id); } catch (err) { alert(err.message); }
  };

  const fieldCls = (field) =>
    `${inputCls} ${errors[field] ? 'border-red-400 focus:ring-red-400' : ''}`;

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-teal-600 to-teal-500">
        <div>
          <h3 className="text-sm font-bold text-white">Center Master</h3>
          <p className="text-xs text-teal-100 mt-0.5">Manage diagnostic centres — location, code &amp; business model</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-1.5 bg-white text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
          Add Center
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {centers.length === 0 ? (
          <p className="text-center py-12 text-slate-400 text-sm">No centers found.</p>
        ) : (
          <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(to right, #f1f5f9, #e2e8f0)' }}>
                {['Center Name', 'Center Code', 'Address', 'Business Model', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ border: '1px solid #cbd5e1', padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centers.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }} className="hover:bg-teal-50/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block bg-slate-100 text-slate-700 text-xs font-semibold tracking-widest px-2 py-1 rounded uppercase">
                      {c.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{c.address || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{c.business_model ? c.business_model.replace(/_/g, ' ') : '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(c)} className="text-teal-600 hover:text-teal-800 font-semibold text-xs">Edit</button>
                      <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700 font-semibold text-xs">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-base font-semibold text-gray-800">
                {editingCenter ? 'Edit Center' : 'Add Center'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {submitError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Center Name <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={set('name')} className={fieldCls('name')} placeholder="e.g. ARIS Kozhikode" />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Center Code <span className="text-red-500">*</span></label>
                <input type="text" value={form.code} onChange={set('code')} className={fieldCls('code')} placeholder="e.g. DLK001" />
                {errors.code && <p className="mt-1 text-xs text-red-500">{errors.code}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address <span className="text-red-500">*</span></label>
                <textarea value={form.address} onChange={set('address')} rows={2} className={fieldCls('address')} placeholder="Full address" />
                {errors.address && <p className="mt-1 text-xs text-red-500">{errors.address}</p>}
              </div>

              <div>
                <label htmlFor="center-business-model" className="block text-sm font-medium text-gray-700 mb-1">Business Model <span className="text-red-500">*</span></label>
                <select id="center-business-model" value={form.business_model} onChange={set('business_model')} className={fieldCls('business_model')}>
                  <option value="">Select business model</option>
                  <option value="OWNED">Owned — Company-owned center, all equipment owned</option>
                  <option value="EQUIPMENT_LEASE">Equipment Lease — Scan equipment leased (MRI/CT), center owned</option>
                  <option value="REVENUE_SHARE">Revenue Share — % of collections paid to host facility</option>
                  <option value="MIN_GUARANTEE">Minimum Guarantee — Fixed monthly amount paid to host facility</option>
                  <option value="FRANCHISE">Franchise — Operating under a franchise agreement</option>
                  <option value="JOINT_VENTURE">Joint Venture — Shared ownership with partner</option>
                </select>
                {errors.business_model && <p className="mt-1 text-xs text-red-500">{errors.business_model}</p>}
              </div>

              <div>
                <label htmlFor="center-status" className="block text-sm font-medium text-gray-700 mb-1">Status <span className="text-red-500">*</span></label>
                <select id="center-status" value={form.status} onChange={set('status')} className={fieldCls('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                {errors.status && <p className="mt-1 text-xs text-red-500">{errors.status}</p>}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
                  {saving ? 'Saving…' : editingCenter ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Referring Physician Master ───────────────────────────────────────────────

const SPECIALTIES = [
  'Cardiology', 'Dermatology', 'Endocrinology', 'ENT (Ear, Nose & Throat)',
  'Gastroenterology', 'General Medicine', 'General Surgery',
  'Gynecology & Obstetrics', 'Hematology', 'Nephrology', 'Neurology',
  'Neurosurgery', 'Oncology', 'Ophthalmology', 'Orthopedics',
  'Pediatrics', 'Psychiatry', 'Pulmonology', 'Radiology',
  'Rheumatology', 'Urology', 'Dentistry', 'Physiotherapy', 'Other',
];

const EMPTY_PHYSICIAN_FORM = {
  first_name: '', last_name: '', specialty: '',
  contact_phone: '', address: '', status: 'active',
};

const PhysicianMaster = ({ physicians, onPhysicianCreate, onPhysicianUpdate, onPhysicianDelete }) => {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PHYSICIAN_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }));

  const openAdd = () => {
    setForm(EMPTY_PHYSICIAN_FORM); setErrors({}); setEditing(null);
    setSubmitError(''); setShowModal(true);
  };
  const openEdit = (p) => {
    setForm({
      first_name: p.first_name || '', last_name: p.last_name || '',
      specialty: p.specialty || '', contact_phone: p.contact_phone || '',
      address: p.address || '', status: p.active ? 'active' : 'inactive',
    });
    setErrors({}); setEditing(p); setSubmitError(''); setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditing(null); setErrors({}); setSubmitError(''); };

  const inputCls = (f) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${errors[f] ? 'border-red-400 bg-red-50' : 'border-slate-300'}`;

  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'First name is required';
    if (!form.last_name.trim())  e.last_name  = 'Last name is required';
    if (!form.specialty)         e.specialty  = 'Specialty is required';
    return e;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setSubmitError('');
    try {
      editing
        ? await onPhysicianUpdate(editing.id, form)
        : await onPhysicianCreate(form);
      closeModal();
    } catch (err) {
      setSubmitError(err.message || 'Failed to save physician');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this physician?')) return;
    try { await onPhysicianDelete(id); } catch (err) { alert(err.message); }
  };

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-teal-600 to-teal-500">
        <div>
          <h3 className="text-sm font-bold text-white">Referring Physician Master</h3>
          <p className="text-xs text-teal-100 mt-0.5">Doctors &amp; specialists who refer patients — code, specialty &amp; contact</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-1.5 bg-white text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
          Add Physician
        </button>
      </div>

      <div className="overflow-x-auto">
        {physicians.length === 0 ? (
          <p className="text-center py-12 text-slate-400 text-sm">No referring physicians found.</p>
        ) : (
          <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(to right, #f1f5f9, #e2e8f0)' }}>
                {['Code', 'Name', 'Specialty', 'Phone', 'Address', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ border: '1px solid #cbd5e1', padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {physicians.map((p, i) => (
                <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }} className="hover:bg-teal-50/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="inline-block bg-indigo-50 text-indigo-700 text-xs font-bold tracking-widest px-2 py-1 rounded uppercase">
                      {p.physician_code}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {p.first_name} {p.last_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.specialty}</td>
                  <td className="px-4 py-3 text-slate-600">{p.contact_phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{p.address || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="text-teal-600 hover:text-teal-800 font-semibold text-xs">Edit</button>
                      <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:text-red-700 font-semibold text-xs">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-base font-semibold text-gray-800">
                {editing ? 'Edit Physician' : 'Add Physician'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {submitError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name <span className="text-red-500">*</span></label>
                  <input type="text" value={form.first_name} onChange={set('first_name')}
                    className={inputCls('first_name')} placeholder="First name" autoFocus />
                  {errors.first_name && <p className="mt-1 text-xs text-red-500">{errors.first_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name <span className="text-red-500">*</span></label>
                  <input type="text" value={form.last_name} onChange={set('last_name')}
                    className={inputCls('last_name')} placeholder="Last name" />
                  {errors.last_name && <p className="mt-1 text-xs text-red-500">{errors.last_name}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Specialty <span className="text-red-500">*</span></label>
                <select value={form.specialty} onChange={set('specialty')} className={inputCls('specialty')}>
                  <option value="">Select specialty</option>
                  {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.specialty && <p className="mt-1 text-xs text-red-500">{errors.specialty}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={form.contact_phone} onChange={set('contact_phone')}
                  className={inputCls('contact_phone')} placeholder="e.g. +91 98765 43210" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea value={form.address} onChange={set('address')} rows={2}
                  className={inputCls('address')} placeholder="Clinic / hospital address" />
              </div>

              <div>
                <label htmlFor="physician-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select id="physician-status" value={form.status} onChange={set('status')} className={inputCls('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
                  {saving ? 'Saving…' : editing ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Item Master ──────────────────────────────────────────────────────────────

const GST_RATES = [0, 5, 12, 18, 28];

const EMPTY_ITEM_FORM = {
  item_code: '', item_name: '', item_type: 'STOCK',
  category_id: '',
  uom: 'ML', gst_rate: 12, standard_rate: '',
  reorder_level: '', minimum_stock: '', description: '',
};

const ItemMaster = () => {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [l1Filter,   setL1Filter]   = useState('ALL');
  const [catFilter,  setCatFilter]  = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [form,       setForm]       = useState(EMPTY_ITEM_FORM);
  const [errors,     setErrors]     = useState({});
  const [saving,     setSaving]     = useState(false);
  const [saveErr,    setSaveErr]    = useState('');

  // Stock movement state
  const [movItem,     setMovItem]    = useState(null);   // item being stocked
  const [movType,     setMovType]    = useState('STOCK_IN');
  const [movForm,     setMovForm]    = useState({ quantity: '', unit_cost: '', reference_number: '', notes: '' });
  const [movSaving,   setMovSaving]  = useState(false);
  const [movErr,      setMovErr]     = useState('');
  const [movements,   setMovements]  = useState([]);
  const [movLoading,  setMovLoading] = useState(false);
  const [showMovHistory, setShowMovHistory] = useState(false);

  const [catTree, setCatTree] = useState({ STOCK: [], EXPENSE: [], FIXED_ASSET: [] });
  const [uomOpts, setUomOpts] = useState(['ML','VIAL','BOTTLE','AMP','PCS','BOX','PACKET','SET','SHEET','ROLL','REAM','PAIR','KG','GM','LTR','NOS','UNIT']);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/item-master', { headers: AUTH_HEADER() });
      const data = await res.json();
      setItems(data.items || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    fetch('/api/item-master/meta', { headers: AUTH_HEADER() })
      .then(r => r.json())
      .then(d => {
        if (d.category_tree) setCatTree(d.category_tree);
        if (d.uom_options) setUomOpts(d.uom_options);
      })
      .catch(() => {});
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_ITEM_FORM);
    setErrors({}); setSaveErr('');
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      item_code:     item.item_code,
      item_name:     item.item_name,
      item_type:     item.item_type,
      category_id:   item.category_id || '',
      uom:           item.uom,
      gst_rate:      item.gst_rate,
      standard_rate: item.standard_rate,
      reorder_level: item.reorder_level || '',
      minimum_stock: item.minimum_stock || '',
      description:   item.description  || '',
    });
    setErrors({}); setSaveErr('');
    setShowModal(true);
  };

  const set = (field) => (e) => {
    const val = e.target.value;
    setForm(f => {
      const next = { ...f, [field]: val };
      if (field === 'item_type') {
        next.category_id = '';
      }
      return next;
    });
    setErrors(er => ({ ...er, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!editing && !form.item_code.trim()) e.item_code    = 'Item code is required';
    if (!form.item_name.trim())            e.item_name     = 'Item name is required';
    if (!form.category_id)                 e.category_id   = 'Category is required';
    if (!form.uom)                         e.uom           = 'UOM is required';
    if (form.standard_rate === '' || isNaN(parseFloat(form.standard_rate)))
                                           e.standard_rate = 'Standard rate is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true); setSaveErr('');
    try {
      const url    = editing ? `/api/item-master/${editing.id}` : '/api/item-master';
      const method = editing ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: AUTH_HEADER(),
        body: JSON.stringify({
          ...form,
          gst_rate:      parseFloat(form.gst_rate)      || 0,
          standard_rate: parseFloat(form.standard_rate) || 0,
          reorder_level: parseFloat(form.reorder_level) || 0,
          minimum_stock: parseFloat(form.minimum_stock) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors?.[0]?.msg || data.error || 'Save failed');
      if (editing) {
        setItems(items.map(i => i.id === editing.id ? data.item : i));
      } else {
        setItems([...items, data.item]);
      }
      setShowModal(false);
    } catch (err) {
      setSaveErr(err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Deactivate "${item.item_name}"?`)) return;
    try {
      await fetch(`/api/item-master/${item.id}`, { method: 'DELETE', headers: AUTH_HEADER() });
      setItems(items.filter(i => i.id !== item.id));
    } catch { /* ignore */ }
  };

  const openMovement = async (item, type) => {
    setMovItem(item);
    setMovType(type);
    setMovForm({ quantity: '', unit_cost: item.standard_rate || '', reference_number: '', notes: '' });
    setMovErr('');
    setShowMovHistory(false);
    setMovLoading(true);
    try {
      const res = await fetch(`/api/item-master/movements?item_id=${item.id}&limit=10`, { headers: AUTH_HEADER() });
      const d = await res.json();
      setMovements(d.movements || []);
    } catch { setMovements([]); }
    setMovLoading(false);
  };

  const submitMovement = async () => {
    if (!movForm.quantity || parseFloat(movForm.quantity) <= 0) { setMovErr('Quantity must be positive'); return; }
    setMovSaving(true); setMovErr('');
    try {
      const res = await fetch('/api/item-master/movements', {
        method: 'POST',
        headers: AUTH_HEADER(),
        body: JSON.stringify({
          item_id: movItem.id,
          movement_type: movType,
          quantity: parseFloat(movForm.quantity),
          unit_cost: parseFloat(movForm.unit_cost) || 0,
          reference_number: movForm.reference_number || undefined,
          notes: movForm.notes || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      // Update current_stock in items list
      setItems(prev => prev.map(i => i.id === movItem.id ? { ...i, current_stock: d.new_stock } : i));
      setMovItem(null);
    } catch (e) { setMovErr(e.message); }
    setMovSaving(false);
  };

  // Filtered display list
  const displayed = items.filter(i => {
    if (typeFilter !== 'ALL' && i.item_type !== typeFilter) return false;
    if (l1Filter !== 'ALL') {
      const allTypes = Object.values(catTree).flat();
      const l1node = allTypes.find(l1 => l1.id === parseInt(l1Filter));
      const validIds = l1node ? [l1node.id, ...(l1node.children || []).map(c => c.id)] : [];
      if (!validIds.includes(i.category_id)) return false;
    }
    if (catFilter !== 'ALL' && i.category_id !== parseInt(catFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(i.item_code?.toLowerCase().includes(q) ||
            i.item_name.toLowerCase().includes(q) ||
            (i.category_name || i.category || '').toLowerCase().includes(q) ||
            i.uom.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const fmtRate = (v) => v > 0
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v)
    : '—';

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-teal-600 to-teal-500">
        <div>
          <h3 className="text-sm font-bold text-white">Item Master</h3>
          <p className="text-xs text-teal-100 mt-0.5">Stock items &amp; expense catalog — consumables, imaging media, services</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-1.5 bg-white text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
          Add Item
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search code, name, category…"
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {['ALL','STOCK','EXPENSE','FIXED_ASSET'].map(t => (
            <button key={t} onClick={() => { setTypeFilter(t); setL1Filter('ALL'); setCatFilter('ALL'); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                typeFilter === t ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {t === 'ALL' ? 'All Items' : t === 'STOCK' ? '📦 Stock' : t === 'EXPENSE' ? '💳 Expense' : '🏢 Fixed Asset'}
            </button>
          ))}
          {typeFilter !== 'ALL' && catTree[typeFilter]?.length > 0 && (
            <select value={l1Filter} onChange={e => { setL1Filter(e.target.value); setCatFilter('ALL'); }}
              className="px-2 py-1 text-xs border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400">
              <option value="ALL">All Groups</option>
              {catTree[typeFilter].map(l1 => (
                <option key={l1.id} value={l1.id}>{l1.name}</option>
              ))}
            </select>
          )}
          {l1Filter !== 'ALL' && (() => {
            const allTypes = Object.values(catTree).flat();
            const l1node = allTypes.find(n => n.id === parseInt(l1Filter));
            const children = l1node?.children || [];
            return children.length > 0 ? (
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400">
                <option value="ALL">All Sub-categories</option>
                {children.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : null;
          })()}
          {search && (
            <button onClick={() => setSearch('')}
              className="px-2.5 py-1 text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div>
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">No items found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'linear-gradient(to right, #f1f5f9, #e2e8f0)' }}>
                  {['Code','Item Name','Type','Group (L1)','Category (L2)','UOM','GST%','Std. Rate','Stock','Reorder','Actions'].map(h => (
                    <th key={h} style={{ border: '1px solid #cbd5e1', padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((item, i) => {
                  return (
                    <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }} className="hover:bg-teal-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {item.item_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px]">
                        <div className="truncate">{item.item_name}</div>
                        {item.description && (
                          <div className="text-xs text-slate-400 truncate">{item.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={item.item_type === 'STOCK' ? 'teal' : item.item_type === 'FIXED_ASSET' ? 'violet' : 'orange'}>
                          {item.item_type === 'STOCK' ? '📦 Stock' : item.item_type === 'FIXED_ASSET' ? '🏢 Fixed Asset' : '💳 Expense'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {(item.l1_category_name || item.l1_category) && (
                          <Badge color="slate">
                            {item.l1_category_name || item.l1_category}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color="slate">{item.category_name || item.category}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.uom}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{item.gst_rate}%</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtRate(item.standard_rate)}</td>
                      <td className="px-4 py-3 text-right">
                        {item.item_type === 'STOCK' ? (
                          <span className={`font-bold text-sm ${
                            parseFloat(item.current_stock || 0) <= 0 ? 'text-red-600' :
                            parseFloat(item.current_stock || 0) <= parseFloat(item.minimum_stock || 0) ? 'text-orange-600' :
                            parseFloat(item.current_stock || 0) <= parseFloat(item.reorder_level || 0) ? 'text-amber-600' :
                            'text-emerald-700'
                          }`}>
                            {parseFloat(item.current_stock || 0).toFixed(2)} {item.uom}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {item.item_type === 'STOCK' ? item.reorder_level : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {item.item_type === 'STOCK' && (
                            <>
                              <button onClick={() => openMovement(item, 'STOCK_IN')}
                                className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded">+In</button>
                              <button onClick={() => openMovement(item, 'STOCK_OUT')}
                                className="text-xs text-orange-600 hover:text-orange-800 font-semibold bg-orange-50 px-2 py-0.5 rounded">−Out</button>
                            </>
                          )}
                          <button onClick={() => openEdit(item)}
                            className="text-xs text-teal-600 hover:text-teal-800 font-semibold">Edit</button>
                          <button onClick={() => handleDelete(item)}
                            className="text-xs text-red-500 hover:text-red-700 font-semibold">Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
              {displayed.length} item{displayed.length !== 1 ? 's' : ''}
              {typeFilter !== 'ALL' ? ` · ${typeFilter}` : ''}
              {search ? ` · "${search}"` : ''}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl flex flex-col my-auto">

            {/* Header */}
            <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  {editing ? 'Edit Item' : 'Add New Item'}
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col">
              <div className="px-5 py-4 space-y-3 overflow-y-auto" style={{ maxHeight: '65vh' }}>
                {saveErr && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5">{saveErr}</p>
                )}

                {/* Item Code */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Item Code <span className="text-red-500">*</span></label>
                  {editing
                    ? <div className="font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 select-all">{editing.item_code}</div>
                    : <input type="text" value={form.item_code} onChange={set('item_code')} autoFocus
                        className="w-full px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 uppercase placeholder:normal-case placeholder:text-slate-400"
                        placeholder="e.g. MC-001 or XRAY-FILM-A4" />
                  }
                  {errors.item_code && <p className="mt-0.5 text-xs text-red-500">{errors.item_code}</p>}
                </div>

                {/* Row 1: Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type <span className="text-red-500">*</span></label>
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs font-medium">
                    {[['STOCK','📦 Stock'],['EXPENSE','💳 Expense'],['FIXED_ASSET','🏢 Fixed Asset']].map(([val, lbl]) => (
                      <button key={val} type="button" onClick={() => set('item_type')({ target: { value: val } })}
                        className={`flex-1 py-1.5 transition-colors ${form.item_type === val ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Row 2: Category */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category <span className="text-red-500">*</span></label>
                  <select
                    value={form.category_id}
                    onChange={e => setForm(f => ({ ...f, category_id: e.target.value ? parseInt(e.target.value) : '' }))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="">— Select category —</option>
                    {(catTree[form.item_type] || []).map(l1 => (
                      l1.children && l1.children.length > 0 ? (
                        <optgroup key={l1.id} label={l1.name}>
                          {l1.children.map(l2 => (
                            <option key={l2.id} value={l2.id}>{l2.name}</option>
                          ))}
                        </optgroup>
                      ) : (
                        <option key={l1.id} value={l1.id}>{l1.name}</option>
                      )
                    ))}
                  </select>
                  {errors.category_id && <p className="mt-0.5 text-xs text-red-500">{errors.category_id}</p>}
                </div>

                {/* Row 3: UOM */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">UOM <span className="text-red-500">*</span></label>
                    <select value={form.uom} onChange={set('uom')}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500">
                      {uomOpts.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 4: Item Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Item Name <span className="text-red-500">*</span></label>
                  <input type="text" value={form.item_name} onChange={set('item_name')} autoFocus
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 placeholder:text-slate-400"
                    placeholder="e.g. Omnipaque 350 (100ml), IV Cannula 18G" />
                  {errors.item_name && <p className="mt-0.5 text-xs text-red-500">{errors.item_name}</p>}
                </div>

                {/* Row 5: GST | Std Rate */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">GST %</label>
                    <select value={form.gst_rate} onChange={set('gst_rate')}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500">
                      {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Std. Rate (₹) <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-2 flex items-center text-gray-400 text-xs">₹</span>
                      <input type="number" min="0" step="0.01" value={form.standard_rate} onChange={set('standard_rate')}
                        className="w-full pl-5 pr-2 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        placeholder="0.00" />
                    </div>
                    {errors.standard_rate && <p className="mt-0.5 text-xs text-red-500">{errors.standard_rate}</p>}
                  </div>
                </div>

                {/* Row 6: Reorder + Min Stock (STOCK only) */}
                {form.item_type === 'STOCK' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Reorder Level</label>
                      <input type="number" min="0" step="1" value={form.reorder_level} onChange={set('reorder_level')}
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Minimum Stock</label>
                      <input type="number" min="0" step="1" value={form.minimum_stock} onChange={set('minimum_stock')}
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        placeholder="0" />
                    </div>
                  </div>
                )}

                {/* Row 7: Description */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <input type="text" value={form.description} onChange={set('description')}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 placeholder:text-slate-400"
                    placeholder="Optional notes…" />
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-xl">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-1.5 text-xs text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium">
                  {saving ? 'Saving…' : editing ? 'Update Item' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Stock Movement Modal */}
      {movItem && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-gray-800">
                  {movType === 'STOCK_IN' ? '📦 Stock In' : '📤 Stock Out'} — {movItem.item_name}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Current stock: <b>{parseFloat(movItem.current_stock || 0).toFixed(2)} {movItem.uom}</b>
                </p>
              </div>
              <button onClick={() => setMovItem(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                {['STOCK_IN','STOCK_OUT','ADJUSTMENT'].map(t => (
                  <button key={t} onClick={() => setMovType(t)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      movType === t
                        ? t === 'STOCK_IN' ? 'bg-emerald-600 text-white' : t === 'STOCK_OUT' ? 'bg-orange-600 text-white' : 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {t === 'STOCK_IN' ? '+ In' : t === 'STOCK_OUT' ? '− Out' : '± Adjust'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Quantity ({movItem.uom}) *</label>
                  <input type="number" value={movForm.quantity} onChange={e => setMovForm(p => ({ ...p, quantity: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="0" min="0.001" step="0.001" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Unit Cost (₹)</label>
                  <input type="number" value={movForm.unit_cost} onChange={e => setMovForm(p => ({ ...p, unit_cost: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="0.00" min="0" step="0.01" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Reference (PO/Bill No.)</label>
                  <input type="text" value={movForm.reference_number} onChange={e => setMovForm(p => ({ ...p, reference_number: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                  <input type="text" value={movForm.notes} onChange={e => setMovForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="Optional" />
                </div>
              </div>

              {movErr && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{movErr}</p>}

              <div className="flex justify-between items-center">
                <button onClick={() => setShowMovHistory(!showMovHistory)}
                  className="text-xs text-teal-600 hover:text-teal-800 font-medium">
                  {showMovHistory ? 'Hide' : 'Show'} recent history
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setMovItem(null)} className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                  <button onClick={submitMovement} disabled={movSaving}
                    className={`px-4 py-1.5 text-xs text-white rounded-lg font-medium disabled:opacity-50 ${
                      movType === 'STOCK_IN' ? 'bg-emerald-600 hover:bg-emerald-700' : movType === 'STOCK_OUT' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'
                    }`}>
                    {movSaving ? 'Saving…' : 'Confirm'}
                  </button>
                </div>
              </div>

              {showMovHistory && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Recent Movements</p>
                  {movLoading ? <p className="text-xs text-slate-400">Loading…</p> : movements.length === 0 ? (
                    <p className="text-xs text-slate-400">No movements yet</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {movements.map((m, i) => (
                        <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-50">
                          <span className={`font-semibold ${m.movement_type === 'STOCK_IN' ? 'text-emerald-700' : m.movement_type === 'STOCK_OUT' ? 'text-orange-700' : 'text-blue-700'}`}>
                            {m.movement_type === 'STOCK_IN' ? '+' : m.movement_type === 'STOCK_OUT' ? '−' : '±'}{parseFloat(m.quantity).toFixed(2)} {m.uom}
                          </span>
                          <span className="text-slate-500">{m.reference_number || '—'}</span>
                          <span className="text-slate-400">{new Date(m.created_at).toLocaleDateString('en-IN')}</span>
                          <span className="text-slate-600 font-medium">→ {parseFloat(m.current_stock).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Vendor Master Component ──────────────────────────────────────────────────
const VENDOR_TYPES    = ['MEDICAL','PHARMACEUTICAL','EQUIPMENT','HARDWARE','SOFTWARE','SERVICE','MAINTENANCE','SUPPLIES','UTILITIES','MARKETING','OTHER'];
const PAYMENT_TERMS   = ['NET_30','NET_60','NET_90','IMMEDIATE','COD'];
const INDIAN_BANKS    = [
  // Public Sector Banks
  'State Bank of India','Bank of Baroda','Bank of India','Bank of Maharashtra',
  'Canara Bank','Central Bank of India','Indian Bank','Indian Overseas Bank',
  'Punjab & Sind Bank','Punjab National Bank','UCO Bank','Union Bank of India',
  // Private Sector Banks
  'Axis Bank','Bandhan Bank','City Union Bank','CSB Bank','DCB Bank',
  'Dhanlaxmi Bank','Federal Bank','HDFC Bank','ICICI Bank','IDBI Bank',
  'IDFC First Bank','IndusInd Bank','Jammu & Kashmir Bank','Karnataka Bank',
  'Karur Vysya Bank','Kotak Mahindra Bank','Lakshmi Vilas Bank','Nainital Bank',
  'RBL Bank','South Indian Bank','Tamilnad Mercantile Bank','Yes Bank',
  // Small Finance Banks
  'AU Small Finance Bank','Capital Small Finance Bank','Equitas Small Finance Bank',
  'ESAF Small Finance Bank','Fincare Small Finance Bank','Jana Small Finance Bank',
  'North East Small Finance Bank','Suryoday Small Finance Bank','Ujjivan Small Finance Bank',
  'Utkarsh Small Finance Bank',
  // Payments Banks
  'Airtel Payments Bank','India Post Payments Bank','Fino Payments Bank',
  'Jio Payments Bank','NSDL Payments Bank','Paytm Payments Bank',
  // Co-operative Banks
  'Saraswat Bank','Abhyudaya Bank','Cosmos Bank','ShamraoVithal Bank',
  'TJSB Sahakari Bank','Vasai Vikas Sahakari Bank',
  // Foreign Banks
  'Citibank','Deutsche Bank','DBS Bank','HSBC Bank','Standard Chartered Bank',
];

const VENDOR_TYPE_COLOR = {
  MEDICAL:'blue', PHARMACEUTICAL:'purple', EQUIPMENT:'orange', HARDWARE:'slate',
  SOFTWARE:'teal', SERVICE:'green', MAINTENANCE:'amber', SUPPLIES:'pink', UTILITIES:'cyan', MARKETING:'rose', OTHER:'slate',
};

const EMPTY_VENDOR = {
  vendor_name:'', vendor_type:'SERVICE', contact_person:'', email:'',
  phone:'', address:'', payment_terms:'', notes:'', active:true,
  gstin:'', pan_number:'',
  bank_name:'', bank_branch:'', account_name:'', account_number:'', ifsc_code:'', upi_id:'',
};

const VendorMaster = () => {
  const [vendors,   setVendors]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState(EMPTY_VENDOR);
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState('');
  const [search,    setSearch]    = useState('');
  const [typeFilter,setTypeFilter]= useState('');

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/masters/vendor-master?active_only=false', { headers: AUTH_HEADER() });
      const data = await res.json();
      setVendors(data.vendors || []);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const openAdd  = () => { setEditing(null); setForm(EMPTY_VENDOR); setFormErr(''); setModal(true); };
  const openEdit = (v) => {
    setEditing(v);
    setForm({
      vendor_name: v.vendor_name, vendor_type: v.vendor_type,
      contact_person: v.contact_person || '', email: v.email || '',
      phone: v.phone || '', address: v.address || '',
      payment_terms: v.payment_terms || '',
      notes: v.notes || '', active: v.active,
      gstin: v.gstin || '', pan_number: v.pan_number || '',
      bank_name: v.bank_name || '', bank_branch: v.bank_branch || '',
      account_name: v.account_name || '', account_number: v.account_number || '',
      ifsc_code: v.ifsc_code || '', upi_id: v.upi_id || '',
    });
    setFormErr(''); setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vendor_name.trim()) { setFormErr('Vendor name is required'); return; }
    if (!form.vendor_type)        { setFormErr('Vendor type is required');  return; }
    setSaving(true); setFormErr('');
    try {
      const url    = editing ? `/api/masters/vendor-master/${editing.id}` : '/api/masters/vendor-master';
      const method = editing ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: AUTH_HEADER(), body: JSON.stringify({
        ...form,
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors?.[0]?.msg || data.error || 'Save failed');
      await fetchVendors();
      setModal(false);
    } catch (err) { setFormErr(err.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this vendor?')) return;
    await fetch(`/api/masters/vendor-master/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    setVendors(prev => prev.filter(v => v.id !== id));
  };

  const setF = (f) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(p => ({ ...p, [f]: val }));
  };

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    const matchQ = !q || v.vendor_name.toLowerCase().includes(q) ||
      (v.vendor_code || '').toLowerCase().includes(q) ||
      (v.contact_person || '').toLowerCase().includes(q) ||
      (v.email || '').toLowerCase().includes(q);
    const matchT = !typeFilter || v.vendor_type === typeFilter;
    return matchQ && matchT;
  });


  const lbl = 'block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide';

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-teal-600 to-teal-500">
        <div>
          <h3 className="text-sm font-bold text-white">Vendor Master</h3>
          <p className="text-xs text-teal-100 mt-0.5">Manage suppliers, service providers and contractors</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-1.5 bg-white text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
          Add Vendor
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, code, contact, email…"
            className={`${inputCls} pl-9`} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={`${inputCls} sm:w-48`}>
          <option value="">All Types</option>
          {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(search || typeFilter) && (
          <button onClick={() => { setSearch(''); setTypeFilter(''); }}
            className="px-3 py-2 text-sm text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-center py-12 text-slate-400 text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-slate-400 text-sm">No vendors found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(to right, #f1f5f9, #e2e8f0)' }}>
                {['Vendor','Type','Contact','Phone / Email','Payment','Status','Actions'].map(h => (
                  <th key={h} style={{ border: '1px solid #cbd5e1', padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => {
                const col = VENDOR_TYPE_COLOR[v.vendor_type] || 'slate';
                const badgeCls = {
                  blue:'bg-blue-100 text-blue-700', purple:'bg-purple-100 text-purple-700',
                  orange:'bg-orange-100 text-orange-700', slate:'bg-slate-100 text-slate-600',
                  teal:'bg-teal-100 text-teal-700', green:'bg-green-100 text-green-700',
                  amber:'bg-amber-100 text-amber-700', pink:'bg-pink-100 text-pink-700',
                }[col];
                return (
                  <tr key={v.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }} className="hover:bg-teal-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{v.vendor_name}</p>
                      <p className="text-xs font-mono text-slate-400 mt-0.5">{v.vendor_code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badgeCls}`}>
                        {v.vendor_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{v.contact_person || '—'}</td>
                    <td className="px-4 py-3">
                      {v.phone && <p className="text-slate-700">{v.phone}</p>}
                      {v.email && <p className="text-xs text-slate-400 mt-0.5">{v.email}</p>}
                      {!v.phone && !v.email && <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {v.payment_terms || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        v.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {v.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button onClick={() => openEdit(v)} className="text-teal-600 hover:text-teal-800 font-semibold text-xs">Edit</button>
                        <button onClick={() => handleDelete(v.id)} className="text-red-500 hover:text-red-700 font-semibold text-xs">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
            {filtered.length} vendor{filtered.length !== 1 ? 's' : ''}
            {typeFilter ? ` · ${typeFilter}` : ''}
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col my-auto">

            {/* Header */}
            <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-4 py-3 rounded-t-2xl flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-white">{editing ? 'Edit Vendor' : 'Add Vendor'}</h3>
                <p className="text-xs text-teal-200 mt-0.5">{editing ? editing.vendor_code : 'New supplier / service provider'}</p>
              </div>
              <button onClick={() => setModal(false)} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col">
              <div className="px-4 py-3 space-y-3 overflow-y-auto" style={{ maxHeight: '65vh' }}>
                {formErr && (
                  <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    ⚠ {formErr}
                  </div>
                )}

                {/* Vendor Code (read-only) */}
                <div>
                  <label className={lbl}>Vendor Code</label>
                  {editing
                    ? <div className="font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 select-all">{editing.vendor_code}</div>
                    : <div className="text-xs text-slate-400 italic px-1 py-1.5">Auto-generated on save (e.g. VND-0042)</div>
                  }
                </div>

                {/* Row 1: Name + Type + Payment Terms */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={lbl}>Vendor Name <span className="text-red-500">*</span></label>
                    <input value={form.vendor_name} onChange={setF('vendor_name')} className={inputCls} placeholder="e.g. Siemens Healthineers" />
                  </div>
                  <div>
                    <label className={lbl}>Vendor Type <span className="text-red-500">*</span></label>
                    <select value={form.vendor_type} onChange={setF('vendor_type')} className={inputCls}>
                      {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Payment Terms</label>
                    <select value={form.payment_terms} onChange={setF('payment_terms')} className={inputCls}>
                      <option value="">— Select —</option>
                      {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 2: Contact + Phone + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={lbl}>Contact Person</label>
                    <input value={form.contact_person} onChange={setF('contact_person')} className={inputCls} placeholder="Name" />
                  </div>
                  <div>
                    <label className={lbl}>Phone</label>
                    <input value={form.phone} onChange={setF('phone')} className={inputCls} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label className={lbl}>Email</label>
                    <input type="email" value={form.email} onChange={setF('email')} className={inputCls} placeholder="vendor@example.com" />
                  </div>
                </div>

                {/* Row 3: Address */}
                <div>
                  <label className={lbl}>Address</label>
                  <input value={form.address} onChange={setF('address')} className={inputCls} placeholder="Full address" />
                </div>

                {/* Tax Details */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tax Details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>GSTIN</label>
                      <input value={form.gstin} onChange={setF('gstin')} className={inputCls}
                        placeholder="22AAAAA0000A1Z5" maxLength={15} style={{ fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <label className={lbl}>PAN Number</label>
                      <input value={form.pan_number} onChange={setF('pan_number')} className={inputCls}
                        placeholder="AAAAA0000A" maxLength={10} style={{ fontFamily: 'monospace' }} />
                    </div>
                  </div>
                </div>

                {/* Bank Details */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bank &amp; Payment Details</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={lbl}>Bank Name</label>
                      <select value={form.bank_name} onChange={setF('bank_name')} className={inputCls}>
                        <option value="">— Select Bank —</option>
                        {INDIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Branch</label>
                      <input value={form.bank_branch} onChange={setF('bank_branch')} className={inputCls} placeholder="Branch / city" />
                    </div>
                    <div>
                      <label className={lbl}>Account Holder</label>
                      <input value={form.account_name} onChange={setF('account_name')} className={inputCls} placeholder="As per bank records" />
                    </div>
                    <div>
                      <label className={lbl}>Account Number</label>
                      <input value={form.account_number} onChange={setF('account_number')} className={inputCls}
                        placeholder="Account number" style={{ fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <label className={lbl}>IFSC Code</label>
                      <input value={form.ifsc_code} onChange={setF('ifsc_code')} className={inputCls}
                        placeholder="SBIN0001234" maxLength={11} style={{ fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <label className={lbl}>UPI ID</label>
                      <input value={form.upi_id} onChange={setF('upi_id')} className={inputCls} placeholder="vendor@upi" />
                    </div>
                  </div>
                </div>

                {/* Notes + Active toggle */}
                <div className="flex gap-3 items-start">
                  <div className="flex-1">
                    <label className={lbl}>Notes</label>
                    <input value={form.notes} onChange={setF('notes')} className={inputCls} placeholder="Additional notes, special terms…" />
                  </div>
                  {editing && (
                    <div className="flex-shrink-0 pt-5">
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer whitespace-nowrap">
                        <input type="checkbox" checked={!!form.active} onChange={setF('active')} className="accent-teal-600 w-4 h-4 rounded" />
                        Active
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 rounded-b-2xl flex-shrink-0">
                <button type="button" onClick={() => setModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 shadow-sm transition-colors">
                  {saving ? 'Saving…' : editing ? 'Update Vendor' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Modality Master ─────────────────────────────────────────────────────────
const ModalityMaster = ({ modalities, onRefresh }) => {
  const [form,    setForm]    = useState({ code: '', name: '', description: '' });
  const [editing, setEditing] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');
  const [delId,   setDelId]   = useState(null);

  const reset = () => { setForm({ code: '', name: '', description: '' }); setEditing(null); setErr(''); };

  const openEdit = (m) => { setEditing(m); setForm({ code: m.code, name: m.name, description: m.description || '' }); setErr(''); };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return setErr('Code and Name are required');
    setSaving(true); setErr('');
    try {
      const url    = editing ? `/api/masters/modalities/${editing.id}` : '/api/masters/modalities';
      const method = editing ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: AUTH_HEADER(), body: JSON.stringify({ ...form, code: form.code.toUpperCase() }) });
      const d = await r.json();
      if (!r.ok) return setErr(d.error || d.errors?.[0]?.msg || 'Save failed');
      reset(); onRefresh();
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  };

  const doDelete = async (id) => {
    const r = await fetch(`/api/masters/modalities/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    if (r.ok) { setDelId(null); onRefresh(); }
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">{editing ? `Editing: ${editing.code}` : 'Add New Modality'}</h3>
        {err && <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Code <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="e.g. MRI" value={form.code}
              disabled={!!editing}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="e.g. Magnetic Resonance Imaging" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <input className={inputCls} placeholder="Optional short description" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : editing ? 'Update' : 'Add Modality'}
          </button>
          {editing && <button onClick={reset} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Code', 'Name', 'Description', 'Centers', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modalities.filter(m => m.active).map((m, i) => (
              <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                <td className="px-4 py-3 font-mono text-xs font-bold text-teal-700">{m.code}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{m.name}</td>
                <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{m.description || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{m.center_count || 0}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(m)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100">Edit</button>
                    {delId === m.id
                      ? <><button onClick={() => doDelete(m.id)} className="text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700">Confirm</button>
                          <button onClick={() => setDelId(null)} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500">Cancel</button></>
                      : <button onClick={() => setDelId(m.id)} className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Remove</button>
                    }
                  </div>
                </td>
              </tr>
            ))}
            {modalities.filter(m => m.active).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm italic">No modalities defined</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Center-Modality Mapping ──────────────────────────────────────────────────
const CenterModalityMap = ({ centers, modalities }) => {
  const [selectedCenter, setSelectedCenter] = useState(null);
  const [centerMods,     setCenterMods]     = useState([]);   // active rows from center_modalities
  const [loadingMods,    setLoadingMods]    = useState(false);
  const [saving,         setSaving]         = useState('');    // modality code being toggled
  const [equipForm,      setEquipForm]      = useState({});    // { [modality_code]: equipment_count }
  const [toast,          setToast]          = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadCenterMods = useCallback(async (centerId) => {
    setLoadingMods(true);
    try {
      const r = await fetch(`/api/centers/${centerId}/modalities`, { headers: AUTH_HEADER() });
      if (r.ok) {
        const d = await r.json();
        setCenterMods(d.modalities || []);
        const eq = {};
        (d.modalities || []).forEach(m => { eq[m.modality] = m.equipment_count; });
        setEquipForm(eq);
      }
    } catch (_) {}
    finally { setLoadingMods(false); }
  }, []);

  const selectCenter = (c) => { setSelectedCenter(c); loadCenterMods(c.id); };

  const isActive = (code) => centerMods.some(m => m.modality === code);
  const getRow   = (code) => centerMods.find(m => m.modality === code);

  const toggle = async (mod) => {
    if (!selectedCenter) return;
    setSaving(mod.code);
    try {
      if (isActive(mod.code)) {
        const row = getRow(mod.code);
        const r = await fetch(`/api/centers/${selectedCenter.id}/modalities/${row.id}`, { method: 'DELETE', headers: AUTH_HEADER() });
        if (r.ok) { showToast(`${mod.code} removed from ${selectedCenter.name}`); await loadCenterMods(selectedCenter.id); }
      } else {
        const r = await fetch(`/api/centers/${selectedCenter.id}/modalities`, {
          method: 'POST', headers: AUTH_HEADER(),
          body: JSON.stringify({ modality: mod.code, description: mod.description, equipment_count: equipForm[mod.code] || 0 }),
        });
        if (r.ok) { showToast(`${mod.code} added to ${selectedCenter.name}`); await loadCenterMods(selectedCenter.id); }
      }
    } catch (_) {}
    finally { setSaving(''); }
  };

  const updateEquipCount = async (mod) => {
    if (!selectedCenter || !isActive(mod.code)) return;
    const row = getRow(mod.code);
    setSaving(mod.code);
    try {
      await fetch(`/api/centers/${selectedCenter.id}/modalities/${row.id}`, {
        method: 'PUT', headers: AUTH_HEADER(),
        body: JSON.stringify({ description: mod.description, equipment_count: parseInt(equipForm[mod.code]) || 0 }),
      });
      await loadCenterMods(selectedCenter.id);
      showToast('Equipment count updated');
    } catch (_) {}
    finally { setSaving(''); }
  };

  const activeMods = modalities.filter(m => m.active);

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 min-h-[500px]">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-teal-700 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">{toast}</div>
      )}

      {/* Left: center list — horizontal scroll on mobile, vertical sidebar on md+ */}
      <div className="md:w-64 md:flex-shrink-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Select Center</p>
        <div className="flex flex-row md:flex-col gap-2 overflow-x-auto pb-1 md:overflow-x-visible md:pb-0 md:space-y-1 md:max-h-[520px] md:overflow-y-auto md:pr-1">
          {centers.filter(c => c.active !== false && c.corporate_entity_id != null).map(c => (
            <button key={c.id} onClick={() => selectCenter(c)}
              className={`flex-shrink-0 md:flex-shrink text-left px-3 py-2.5 rounded-xl text-sm transition-all border ${
                selectedCenter?.id === c.id
                  ? 'bg-teal-50 border-teal-300 text-teal-800 font-semibold'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}>
              <div className="font-medium truncate max-w-[160px] md:max-w-none">{c.name}</div>
              <div className="text-xs text-slate-400 mt-0.5">{c.city || c.code}</div>
            </button>
          ))}
          {centers.length === 0 && <p className="text-sm text-slate-400 italic px-2">No centers found</p>}
        </div>
      </div>

      {/* Right: modality toggles */}
      <div className="flex-1 min-w-0">
        {!selectedCenter ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400 text-sm italic">Select a center to configure its modalities</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-slate-800">{selectedCenter.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{centerMods.length} modality{centerMods.length !== 1 ? 'ies' : ''} active</p>
              </div>
              {loadingMods && <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {activeMods.map(mod => {
                const active = isActive(mod.code);
                const row    = getRow(mod.code);
                const busy   = saving === mod.code;
                return (
                  <div key={mod.code}
                    className={`border rounded-xl p-4 transition-all ${active ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${active ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {mod.code}
                        </span>
                        <p className="text-sm font-medium text-slate-800 mt-1.5">{mod.name}</p>
                      </div>
                      <button onClick={() => toggle(mod)} disabled={busy}
                        className={`flex-shrink-0 w-10 h-6 rounded-full transition-colors relative ${active ? 'bg-teal-500' : 'bg-slate-300'} disabled:opacity-50`}>
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                    {active && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-teal-200">
                        <label className="text-xs text-slate-500 whitespace-nowrap">Equip. count</label>
                        <input type="number" min="0" max="99"
                          value={equipForm[mod.code] ?? row?.equipment_count ?? 0}
                          onChange={e => setEquipForm(f => ({ ...f, [mod.code]: e.target.value }))}
                          className="w-16 px-2 py-1 text-xs border border-teal-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400 text-center"
                        />
                        <button onClick={() => updateEquipCount(mod)} disabled={busy}
                          className="text-xs px-2 py-1 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
                          {busy ? '…' : 'Save'}
                        </button>
                      </div>
                    )}
                    {!active && mod.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{mod.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Main Master Data Settings Component ─────────────────────────────────────
const MasterDataSettings = () => {
  const [activeTab, setActiveTab]           = useState('study-catalog');
  const [catalogAddHandler, setCatalogAddHandler] = useState(null);
  const [catalogHasSelection, setCatalogHasSelection] = useState(false);

  const [studyDefs, setStudyDefs]       = useState([]);
  const [studyPricing, setStudyPricing] = useState([]);
  const [reporters, setReporters] = useState([]);
  const [studyList, setStudyList] = useState([]);
  const [centers, setCenters] = useState([]);
  const [modalities, setModalities] = useState([]);
  const [centerModMap, setCenterModMap] = useState({}); // pre-loaded: centerId → Set of modality codes
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [physicians, setPhysicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchStudyDefs = useCallback(async () => {
    try {
      const res = await fetch('/api/masters/study-definitions?active_only=true', { headers: AUTH_HEADER() });
      if (res.ok) { const d = await res.json(); setStudyDefs(d.studies || []); }
    } catch (_) {}
  }, []);

  const fetchStudyPricing = useCallback(async () => {
    try {
      const res = await fetch('/api/masters/study-pricing?active_only=true', { headers: AUTH_HEADER() });
      if (res.ok) { const d = await res.json(); setStudyPricing(d.pricing || []); }
    } catch (_) {}
  }, []);

  const fetchReporters = useCallback(async () => {
    try {
      const res = await fetch('/api/rad-reporting?active_only=false', { headers: AUTH_HEADER() });
      if (res.ok) {
        const data = await res.json();
        setReporters(data.reporters || []);
      } else {
        setError('Failed to fetch RAD reporters');
      }
    } catch (err) {
      setError('Network error');
    }
  }, []);

  const fetchStudyList = useCallback(async () => {
    try {
      const res = await fetch('/api/rad-reporting/studies', { headers: AUTH_HEADER() });
      if (res.ok) {
        const data = await res.json();
        setStudyList(data.studies || []);
      }
    } catch (_err) {
      // non-critical
    }
  }, []);

  const fetchModalities = useCallback(async () => {
    try {
      const res = await fetch('/api/masters/modalities?active_only=false', { headers: AUTH_HEADER() });
      if (res.ok) { const d = await res.json(); setModalities(d.modalities || []); }
    } catch (_) {}
  }, []);

  const fetchCenters = useCallback(async () => {
    try {
      const res = await fetch('/api/center-master?active_only=false', { headers: AUTH_HEADER() });
      if (res.ok) {
        const data = await res.json();
        setCenters(data.centers || []);
        return data.centers || [];
      } else {
        setError('Failed to fetch centers');
      }
    } catch (err) {
      setError('Network error');
    }
    return [];
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/rbac/roles?active_only=false', { headers: AUTH_HEADER() });
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
      } else {
        setError('Failed to fetch roles');
      }
    } catch (err) {
      setError('Network error');
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/rbac/users?active_only=false', { headers: AUTH_HEADER() });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      } else {
        setError('Failed to fetch users');
      }
    } catch (err) {
      setError('Network error');
    }
  }, []);

  const fetchPhysicians = useCallback(async () => {
    try {
      const res = await fetch('/api/referring-physicians?active_only=false', { headers: AUTH_HEADER() });
      if (res.ok) {
        const data = await res.json();
        setPhysicians(data.physicians || []);
      } else {
        setError('Failed to fetch referring physicians');
      }
    } catch (err) {
      setError('Network error');
    }
  }, []);

  // Track which tabs have already been loaded so we don't re-fetch on every visit
  const loadedTabs = useRef(new Set());

  useEffect(() => {
    if (loadedTabs.current.has(activeTab)) return;
    loadedTabs.current.add(activeTab);

    const load = async () => {
      setLoading(true);
      if (activeTab === 'study-catalog') {
        await fetchStudyDefs();
      } else if (activeTab === 'study-pricing') {
        // Load core data first, then pre-fetch modalities for every center in parallel
        const [, , centersData] = await Promise.all([fetchStudyDefs(), fetchStudyPricing(), fetchCenters()]);
        const activeCenterIds = (centersData || centers)
          .filter(c => c.active !== false && c.corporate_entity_id != null)
          .map(c => c.id);
        if (activeCenterIds.length) {
          const modResults = await Promise.all(
            activeCenterIds.map(id =>
              fetch(`/api/centers/${id}/modalities`, { headers: AUTH_HEADER() })
                .then(r => r.ok ? r.json() : { modalities: [] })
                .then(d => [id, new Set((d.modalities || []).map(m => m.modality))])
                .catch(() => [id, new Set()])
            )
          );
          setCenterModMap(Object.fromEntries(modResults));
        }
      } else if (activeTab === 'radiologist') {
        await Promise.all([fetchReporters(), fetchStudyList()]);
      } else if (activeTab === 'physician') {
        await fetchPhysicians();
      } else if (activeTab === 'center') {
        await fetchCenters();
      } else if (activeTab === 'modality-master') {
        await fetchModalities();
      } else if (activeTab === 'center-modality') {
        await Promise.all([fetchCenters(), fetchModalities()]);
      }
      setLoading(false);
    };
    load();
  }, [activeTab, fetchStudyDefs, fetchStudyPricing, fetchReporters, fetchStudyList, fetchCenters, fetchModalities, fetchRoles, fetchUsers, fetchPhysicians]);

  const handleCenterCreate = async (centerData) => {
    const res = await fetch('/api/center-master', {
      method: 'POST',
      headers: AUTH_HEADER(),
      body: JSON.stringify(centerData),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.message || d.errors?.[0]?.msg || 'Failed to create center');
    }
    fetchCenters();
  };

  const handleCenterUpdate = async (id, centerData) => {
    const res = await fetch(`/api/center-master/${id}`, {
      method: 'PUT',
      headers: AUTH_HEADER(),
      body: JSON.stringify(centerData),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.message || d.errors?.[0]?.msg || 'Failed to update center');
    }
    fetchCenters();
  };

  const handleCenterDelete = async (id) => {
    try {
      const res = await fetch(`/api/center-master/${id}`, {
        method: 'DELETE',
        headers: AUTH_HEADER(),
      });
      if (res.ok) {
        setCenters(prev => prev.filter(c => c.id !== id));
        setSuccess('Center deleted successfully');
      } else {
        setError('Failed to delete center');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  // ── Study Definitions (catalog) ───────────────────────────────
  const handleDefCreate = async (payload) => {
    const res = await fetch('/api/masters/study-definitions', { method: 'POST', headers: AUTH_HEADER(), body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || d.errors?.[0]?.msg || 'Failed to create study'); }
    fetchStudyDefs();
  };

  const handleDefUpdate = async (id, payload) => {
    const res = await fetch(`/api/masters/study-definitions/${id}`, { method: 'PUT', headers: AUTH_HEADER(), body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || d.errors?.[0]?.msg || 'Failed to update study'); }
    fetchStudyDefs();
  };

  const handleDefDelete = async (id) => {
    const res = await fetch(`/api/masters/study-definitions/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    if (res.ok) { setStudyDefs(prev => prev.filter(s => s.id !== id)); }
  };

  // ── Study Pricing (center mappings) ───────────────────────────
  // Batch save — single API call for all dirty prices
  const handlePricingBatch = async (centerId, items) => {
    const res = await fetch('/api/masters/study-pricing/batch', {
      method: 'POST', headers: AUTH_HEADER(),
      body: JSON.stringify({ center_id: centerId, items }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save pricing'); }
    fetchStudyPricing();
  };

  // Keep single-item handlers for individual row edits
  const handlePricingCreate = async (payload) => {
    const res = await fetch('/api/masters/study-pricing', { method: 'POST', headers: AUTH_HEADER(), body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || d.errors?.[0]?.msg || 'Failed to create pricing'); }
    fetchStudyPricing();
  };

  const handlePricingUpdate = async (id, payload) => {
    const res = await fetch(`/api/masters/study-pricing/${id}`, { method: 'PUT', headers: AUTH_HEADER(), body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || d.errors?.[0]?.msg || 'Failed to update pricing'); }
    fetchStudyPricing();
  };

  const handlePricingDelete = async (id) => {
    const res = await fetch(`/api/masters/study-pricing/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    if (res.ok) { setStudyPricing(prev => prev.filter(p => p.id !== id)); }
  };

  const handleReporterCreate = async (data) => {
    const res = await fetch('/api/rad-reporting', {
      method: 'POST', headers: AUTH_HEADER(), body: JSON.stringify(data),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.errors?.[0]?.msg || d.error || 'Failed to create reporter'); }
    const body = await res.json();
    setReporters(prev => [...prev, body.reporter]);
  };

  const handleReporterUpdate = async (id, data) => {
    const res = await fetch(`/api/rad-reporting/${id}`, {
      method: 'PUT', headers: AUTH_HEADER(), body: JSON.stringify(data),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.errors?.[0]?.msg || d.error || 'Failed to update reporter'); }
    const body = await res.json();
    setReporters(prev => prev.map(r => r.id === id ? body.reporter : r));
  };

  const handleReporterDelete = async (id) => {
    const res = await fetch(`/api/rad-reporting/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete reporter'); }
    setReporters(prev => prev.filter(r => r.id !== id));
  };

  // ── Role handlers ─────────────────────────────────────────────────────────
  const handleRoleCreate = async (payload) => {
    const res = await fetch('/api/rbac/roles', {
      method: 'POST', headers: AUTH_HEADER(), body: JSON.stringify(payload),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || d.errors?.[0]?.msg || 'Failed to create role'); }
    fetchRoles();
  };

  const handleRoleUpdate = async (id, payload) => {
    const res = await fetch(`/api/rbac/roles/${id}`, {
      method: 'PUT', headers: AUTH_HEADER(), body: JSON.stringify(payload),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || d.errors?.[0]?.msg || 'Failed to update role'); }
    fetchRoles();
  };

  const handleRoleDelete = async (id) => {
    const res = await fetch(`/api/rbac/roles/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete role'); }
    setRoles(prev => prev.filter(r => r.id !== id));
  };

  // ── User handlers ─────────────────────────────────────────────────────────
  const handleUserCreate = async (payload) => {
    const res = await fetch('/api/rbac/users', {
      method: 'POST', headers: AUTH_HEADER(), body: JSON.stringify(payload),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || d.errors?.[0]?.msg || 'Failed to create user'); }
    fetchUsers();
  };

  const handleUserUpdate = async (id, payload) => {
    const res = await fetch(`/api/rbac/users/${id}`, {
      method: 'PUT', headers: AUTH_HEADER(), body: JSON.stringify(payload),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || d.errors?.[0]?.msg || 'Failed to update user'); }
    fetchUsers();
  };

  const handleUserDelete = async (id) => {
    const res = await fetch(`/api/rbac/users/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete user'); }
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const handlePasswordReset = async (id, password) => {
    const res = await fetch(`/api/rbac/users/${id}/reset-password`, {
      method: 'POST', headers: AUTH_HEADER(), body: JSON.stringify({ password }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to reset password'); }
  };

  const handlePhysicianCreate = async (data) => {
    const res = await fetch('/api/referring-physicians', {
      method: 'POST', headers: AUTH_HEADER(), body: JSON.stringify(data),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.errors?.[0]?.msg || d.error || 'Failed to create physician'); }
    const body = await res.json();
    setPhysicians(prev => [...prev, body.physician]);
  };

  const handlePhysicianUpdate = async (id, data) => {
    const res = await fetch(`/api/referring-physicians/${id}`, {
      method: 'PUT', headers: AUTH_HEADER(), body: JSON.stringify(data),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.errors?.[0]?.msg || d.error || 'Failed to update physician'); }
    const body = await res.json();
    setPhysicians(prev => prev.map(p => p.id === id ? body.physician : p));
  };

  const handlePhysicianDelete = async (id) => {
    const res = await fetch(`/api/referring-physicians/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete physician'); }
    setPhysicians(prev => prev.filter(p => p.id !== id));
  };

  // ── NAV_GROUPS — defined outside JSX for reuse ──────────────────────────────
  const NAV_GROUPS = [
    {
      group: 'Clinical',
      color: '#0d9488',                    // teal-600 — primary brand
      icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
      tabs: [
        { id: 'study-catalog',   label: 'Study Catalogue', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
        { id: 'study-pricing',   label: 'Study Pricing',   icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
        { id: 'service-master',  label: 'Service Master',  icon: 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z' },
        { id: 'radiologist',     label: 'RAD Reporting',   icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
        { id: 'physician',       label: 'Ref. Physician',  icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
      ],
    },
    {
      group: 'Operations',
      color: '#0369a1',                    // sky-700
      icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
      tabs: [
        { id: 'center',          label: 'Center Master',     icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
        { id: 'modality-master', label: 'Modalities',        icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18' },
        { id: 'center-modality', label: 'Center Modalities', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header banner — same pattern as HR page ── */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f766e 60%, #0d9488 100%)' }}>
        <div className="max-w-screen-xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6">

          {/* Title row */}
          <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Master Data</h1>
              <p className="text-xs sm:text-sm mt-0.5" style={{ color: '#99f6e4' }}>
                Studies · Pricing · Centres · Users · System
              </p>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex items-end gap-0.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {NAV_GROUPS.map((g, gi) => (
              <div key={g.group} className="flex items-end flex-shrink-0">
                {gi > 0 && (
                  <div className="self-center w-px h-5 mx-2 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.25)' }} />
                )}
                {g.tabs.map(tab => {
                  const isAct = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="px-5 py-2.5 text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap"
                      style={isAct
                        ? { background: '#f8fafc', color: '#0d9488' }
                        : { background: 'transparent', color: 'rgba(255,255,255,0.75)' }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Content area ── */}
      <div className="max-w-screen-xl mx-auto px-3 sm:px-6 py-4 sm:py-6">

        {/* Alerts */}
        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-teal-700 bg-teal-50 border border-teal-200">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {success}
          </div>
        )}

        {/* Content card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">

          {/* Tab content */}
          <div className="p-3 sm:p-6">
            {activeTab === 'service-master' && <ServiceMaster embedded />}
            {activeTab === 'study-catalog' && <StudyCatalogFull studyDefs={studyDefs} onDefCreate={handleDefCreate} onDefUpdate={handleDefUpdate} onDefDelete={handleDefDelete} onRegisterAdd={fn => setCatalogAddHandler(() => fn)} onSelectionChange={setCatalogHasSelection} />}
            {activeTab === 'study-pricing' && <StudyPricing studyDefs={studyDefs} studyPricing={studyPricing} centers={centers} centerModMap={centerModMap} onPricingBatch={handlePricingBatch} onPricingCreate={handlePricingCreate} onPricingUpdate={handlePricingUpdate} onPricingDelete={handlePricingDelete} />}
            {activeTab === 'radiologist' && <RadReportingMaster reporters={reporters} studies={studyList} onReporterCreate={handleReporterCreate} onReporterUpdate={handleReporterUpdate} onReporterDelete={handleReporterDelete} />}
            {activeTab === 'physician' && <PhysicianMaster physicians={physicians} onPhysicianCreate={handlePhysicianCreate} onPhysicianUpdate={handlePhysicianUpdate} onPhysicianDelete={handlePhysicianDelete} />}
            {activeTab === 'center' && <CenterMaster centers={centers} onCenterCreate={handleCenterCreate} onCenterUpdate={handleCenterUpdate} onCenterDelete={handleCenterDelete} />}
            {activeTab === 'modality-master' && <ModalityMaster modalities={modalities} onRefresh={fetchModalities} />}
            {activeTab === 'center-modality' && <CenterModalityMap centers={centers} modalities={modalities} />}
          </div>
        </div>
      </div>

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Loading master data…</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default MasterDataSettings;
