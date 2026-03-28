import { useState, useEffect, useCallback } from 'react';
import { getPermissions } from '../utils/permissions';

const token = () => localStorage.getItem('token');
const hdrs = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

const fmtINR = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);

const STATUS_BADGE = {
  EXAM_SCHEDULED:  'bg-blue-100 text-blue-700',
  EXAM_COMPLETED:  'bg-amber-100 text-amber-700',
  REPORT_COMPLETED:'bg-emerald-100 text-emerald-700',
};

const STATUS_LABEL = {
  EXAM_SCHEDULED:  'Exam Scheduled',
  EXAM_COMPLETED:  'Exam Completed',
  REPORT_COMPLETED:'Report Completed',
};

const REPORTER_TYPE_BADGE = {
  INDIVIDUAL:           'bg-teal-100 text-teal-700',
  TELERADIOLOGY_COMPANY:'bg-purple-100 text-purple-700',
};

// ── Shared consumable row list (used in both modals) ──────────────────────────
const ConsumableRowList = ({ rows, onChangeQty, onRemove }) => (
  <div className="rounded-lg border border-slate-200 overflow-hidden">
    <div className="grid px-3 py-2 bg-slate-50 text-[10px] font-semibold text-slate-500 uppercase tracking-wider"
      style={{ gridTemplateColumns: '1fr 88px 44px 80px 28px' }}>
      <span>Item</span><span className="text-center">Qty</span>
      <span className="text-center">UOM</span><span className="text-right">Cost</span><span/>
    </div>
    <div className="divide-y divide-slate-100">
      {rows.map(row => (
        <div key={row.item_master_id} className={`grid gap-2 items-center px-3 py-2 hover:bg-slate-50 ${row.alreadySaved ? 'opacity-60' : ''}`}
          style={{ gridTemplateColumns: '1fr 88px 44px 80px 28px' }}>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-800 truncate">{row.item_name}</div>
            <div className="text-[10px] text-slate-400">{row.item_code}{row.alreadySaved ? ' · saved' : ''}</div>
          </div>
          <div className="flex items-center justify-center gap-1">
            <button type="button" onClick={() => onChangeQty(row.item_master_id, -1)}
              className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 text-sm font-bold">−</button>
            <span className="w-6 text-center text-xs font-semibold">{row.qty_used}</span>
            <button type="button" onClick={() => onChangeQty(row.item_master_id, 1)}
              className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 text-sm font-bold">+</button>
          </div>
          <span className="text-xs text-slate-500 text-center">{row.uom}</span>
          <span className="text-xs text-slate-600 text-right">
            {row.unit_cost > 0 ? fmtCurrency((parseInt(row.qty_used)||0)*row.unit_cost) : '—'}
          </span>
          <button type="button" onClick={() => onRemove(row.item_master_id)}
            className="p-1 text-red-400 hover:text-red-600 rounded">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  </div>
);

// ── Exam Complete Modal (combined: consumables + reporter) ─────────────────────
// study.id = bill_item_id; study.bill_id = parent bill
const ExamCompleteModal = ({ study, onClose, onSaved }) => {
  const [consOpen, setConsOpen]       = useState(true);
  // sharedRows = per_patient scope (report cover, CD — one per bill)
  // studyRows  = per_study scope (contrast, film — per this study)
  const [sharedRows, setSharedRows]   = useState([]);
  const [studyRows, setStudyRows]     = useState([]);
  const [stockItems, setStockItems]   = useState([]);
  const [addItemId, setAddItemId]     = useState('');
  const [addScope, setAddScope]       = useState('per_study');
  const [loadingCons, setLoadingCons] = useState(true);
  const [reporters, setReporters]     = useState([]);
  const [selected, setSelected]       = useState(null);
  const [loadingRep, setLoadingRep]   = useState(true);
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState('');
  const [sharedAlreadySaved, setSharedAlreadySaved] = useState(false);
  // items already used in OTHER studies of same bill: Set of item_master_id
  const [crossStudyDupes, setCrossStudyDupes] = useState(new Set());

  useEffect(() => {
    const load = async () => {
      setLoadingCons(true);
      try {
        // 1. Template (with scope field)
        let tplShared = [], tplStudy = [];
        if (study.study_definition_id) {
          const r = await fetch(`/api/study-consumables?study_definition_id=${study.study_definition_id}`, { headers: hdrs() });
          const d = await r.json();
          for (const c of (d.consumables || [])) {
            const row = {
              item_master_id: c.item_master_id, item_name: c.item_name, uom: c.uom,
              item_code: c.item_code, unit_cost: parseFloat(c.unit_cost || 0),
              qty_used: Math.round(parseFloat(c.default_qty) || 1),
            };
            if (c.scope === 'per_patient') tplShared.push(row);
            else tplStudy.push(row);
          }
        }

        // 2. Saved consumables for this bill
        if (study.bill_id) {
          const r2 = await fetch(`/api/bill-consumables?bill_id=${study.bill_id}`, { headers: hdrs() });
          const d2 = await r2.json();
          const allSaved = d2.consumables || [];

          // Shared: bill_item_id IS NULL
          const savedShared = allSaved.filter(c => !c.bill_item_id);
          if (savedShared.length) {
            setSharedAlreadySaved(true);
            const savedIds = new Set(savedShared.map(s => s.item_master_id));
            setSharedRows([
              ...savedShared.map(c => ({ item_master_id: c.item_master_id, item_name: c.item_name,
                uom: c.uom, item_code: c.item_code, unit_cost: parseFloat(c.unit_cost || 0),
                qty_used: Math.round(parseFloat(c.qty_used) || 0), alreadySaved: true })),
              ...tplShared.filter(t => !savedIds.has(t.item_master_id)),
            ]);
          } else { setSharedRows(tplShared); }

          // Per-study: bill_item_id = this study's bill_item_id
          const savedStudy = allSaved.filter(c => c.bill_item_id === study.id);
          if (savedStudy.length) {
            const savedIds = new Set(savedStudy.map(s => s.item_master_id));
            setStudyRows([
              ...savedStudy.map(c => ({ item_master_id: c.item_master_id, item_name: c.item_name,
                uom: c.uom, item_code: c.item_code, unit_cost: parseFloat(c.unit_cost || 0),
                qty_used: Math.round(parseFloat(c.qty_used) || 0) })),
              ...tplStudy.filter(t => !savedIds.has(t.item_master_id)),
            ]);
          } else { setStudyRows(tplStudy); }

          // Cross-study duplicate detection: items saved for OTHER studies in this bill
          const otherStudyItems = allSaved.filter(c => c.bill_item_id && c.bill_item_id !== study.id);
          if (otherStudyItems.length) {
            setCrossStudyDupes(new Set(otherStudyItems.map(c => c.item_master_id)));
          }
        } else {
          setSharedRows(tplShared);
          setStudyRows(tplStudy);
        }
      } catch { /* non-critical */ }
      finally { setLoadingCons(false); }
    };
    load();
    fetch('/api/item-master?item_type=STOCK&active=true', { headers: hdrs() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStockItems(d.items || d.data || []); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch(`/api/rad-reporting/reporters?bill_item_id=${study.id}`, { headers: hdrs() })
      .then(r => r.json())
      .then(d => { if (d.success) setReporters(d.reporters || []); })
      .finally(() => setLoadingRep(false));
  }, [study.id]);

  const allRows = [...sharedRows, ...studyRows];
  const changeSharedQty = (id, delta) =>
    setSharedRows(prev => prev.map(r => r.item_master_id === id
      ? { ...r, qty_used: Math.max(0, (parseInt(r.qty_used) || 0) + delta) } : r));
  const changeStudyQty = (id, delta) =>
    setStudyRows(prev => prev.map(r => r.item_master_id === id
      ? { ...r, qty_used: Math.max(0, (parseInt(r.qty_used) || 0) + delta) } : r));
  const removeShared = (id) => setSharedRows(prev => prev.filter(r => r.item_master_id !== id));
  const removeStudy  = (id) => setStudyRows(prev => prev.filter(r => r.item_master_id !== id));

  const addItem = () => {
    if (!addItemId) return;
    const found = stockItems.find(i => i.id === parseInt(addItemId, 10));
    if (!found) return;
    const row = {
      item_master_id: found.id, item_name: found.item_name, uom: found.uom,
      item_code: found.item_code, unit_cost: parseFloat(found.standard_rate || 0), qty_used: 1,
    };
    if (addScope === 'per_patient') {
      if (sharedRows.some(r => r.item_master_id === found.id)) return;
      setSharedRows(prev => [...prev, row]);
    } else {
      if (studyRows.some(r => r.item_master_id === found.id)) return;
      setStudyRows(prev => [...prev, row]);
    }
    setAddItemId('');
  };

  const totalCost = allRows.reduce((s, r) => s + (parseInt(r.qty_used) || 0) * (r.unit_cost || 0), 0);

  const confirm = async () => {
    if (!selected) { setErr('Please select a reporter'); return; }

    // Warn if shared consumables already exist for this bill (entered from another study)
    const hasExistingShared = sharedRows.some(r => r.alreadySaved);
    const hasNewShared = sharedRows.some(r => !r.alreadySaved && parseInt(r.qty_used) > 0);
    if (hasExistingShared || hasNewShared) {
      const existingNames = sharedRows.filter(r => r.alreadySaved).map(r => r.item_name).join(', ');
      const msg = hasExistingShared
        ? `Shared consumables already recorded for this patient from a previous study:\n${existingNames}\n\nSaving will update these shared records. Continue?`
        : `You are saving shared (patient-level) consumables that apply to the whole bill, not just this study. Continue?`;
      if (!window.confirm(msg)) return;
    }

    // Warn if any per-study items in this study already appear in another study of the same bill
    const crossDupeRows = studyRows.filter(r => parseInt(r.qty_used) > 0 && crossStudyDupes.has(r.item_master_id));
    if (crossDupeRows.length > 0) {
      const names = crossDupeRows.map(r => r.item_name).join(', ');
      if (!window.confirm(`The following items were already recorded for another study in this bill:\n\n${names}\n\nThis may be a duplicate entry (e.g. contrast given once but entered twice). Continue anyway?`)) return;
    }

    setSaving(true); setErr('');
    try {
      // Step 1: Mark exam complete
      const r = await fetch(`/api/rad-reporting/${study.id}/exam-complete`, {
        method: 'PUT',
        headers: hdrs(),
        body: JSON.stringify({
          reporter_radiologist_id: selected.id,
          rate_snapshot: selected.total_rate,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || d.detail || 'Failed'); setSaving(false); return; }

      // Step 2: Save consumables (shared null, per-study with bill_item_id)
      const toSave = [
        ...sharedRows.filter(r => parseInt(r.qty_used) > 0)
          .map(r => ({ item_master_id: r.item_master_id, qty_used: parseInt(r.qty_used), bill_item_id: null })),
        ...studyRows.filter(r => parseInt(r.qty_used) > 0)
          .map(r => ({ item_master_id: r.item_master_id, qty_used: parseInt(r.qty_used), bill_item_id: study.id })),
      ];
      if (toSave.length > 0 && study.bill_id) {
        await fetch('/api/bill-consumables/save', {
          method: 'POST', headers: hdrs(),
          body: JSON.stringify({ bill_id: study.bill_id, consumables: toSave }),
        });
      }
      onSaved();
    } catch { setErr('Network error'); setSaving(false); }
  };

  const Spinner = () => (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-amber-600 rounded-t-xl">
          <div>
            <h2 className="text-base font-semibold text-white">Mark Exam Completed</h2>
            <p className="text-xs text-amber-100 mt-0.5">
              {study.patient_name} — {study.study_name || study.accession_number}
              {study.modality && ` (${study.modality})`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-amber-200 hover:text-white hover:bg-amber-500 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {err && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">{err}</div>}

          {/* ── Consumables (collapsible, two sections) ────────────────────── */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button type="button" onClick={() => setConsOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <span className="text-sm font-semibold text-slate-700">Consumables</span>
                {allRows.length > 0 && (
                  <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                    {allRows.length} item{allRows.length !== 1 ? 's' : ''}{totalCost > 0 ? ` · ${fmtCurrency(totalCost)}` : ''}
                  </span>
                )}
              </div>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${consOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            {consOpen && (
              <div className="p-4 space-y-3 border-t border-slate-200">
                {loadingCons ? (
                  <div className="flex items-center gap-2 py-3 text-slate-400 text-sm justify-center"><Spinner/> Loading…</div>
                ) : (
                  <>
                    {/* ── Patient-level shared items ── */}
                    {sharedRows.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                          Patient-level (shared — one per bill)
                        </p>
                        {sharedAlreadySaved && (
                          <div className="flex items-start gap-2 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                            </svg>
                            <p className="text-xs text-amber-700">
                              These shared items were already recorded for another study in this bill. Grayed items are saved — edit only if quantities differ.
                            </p>
                          </div>
                        )}
                        <ConsumableRowList rows={sharedRows} onChangeQty={changeSharedQty} onRemove={removeShared}/>
                      </div>
                    )}
                    {/* ── Per-study items ── */}
                    {studyRows.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                          This study — {study.study_name || study.modality}
                        </p>
                        {studyRows.some(r => crossStudyDupes.has(r.item_master_id)) && (
                          <div className="flex items-start gap-2 mb-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                            <svg className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                            </svg>
                            <p className="text-xs text-orange-700">
                              <strong>Possible duplicate:</strong> {studyRows.filter(r => crossStudyDupes.has(r.item_master_id)).map(r => r.item_name).join(', ')} already recorded for another study in this bill. Remove if this was a single administration.
                            </p>
                          </div>
                        )}
                        <ConsumableRowList rows={studyRows} onChangeQty={changeStudyQty} onRemove={removeStudy}/>
                      </div>
                    )}
                    {allRows.length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-2">No template consumables. Add items below.</p>
                    )}
                    {/* ── Add item ── */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                      <select value={addItemId} onChange={e => setAddItemId(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs border border-slate-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400">
                        <option value="">{stockItems.length === 0 ? 'Loading…' : 'Add stock item…'}</option>
                        {stockItems.filter(i => !allRows.some(r => r.item_master_id === i.id))
                          .map(i => <option key={i.id} value={i.id}>{i.item_name} ({i.uom})</option>)}
                      </select>
                      <select value={addScope} onChange={e => setAddScope(e.target.value)}
                        className="px-2 py-1.5 text-xs border border-slate-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400">
                        <option value="per_study">This study</option>
                        <option value="per_patient">Shared</option>
                      </select>
                      <button type="button" onClick={addItem} disabled={!addItemId}
                        className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-100 hover:bg-teal-200 rounded-lg disabled:opacity-40">
                        Add
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Reporter selection ─────────────────────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Select Reporter <span className="text-red-500">*</span></h3>
            {loadingRep ? (
              <div className="flex items-center gap-2 py-4 text-slate-400 text-sm justify-center"><Spinner/> Loading reporters…</div>
            ) : reporters.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-3 text-center">No reporters configured.</p>
            ) : (
              <div className="space-y-2">
                {reporters.map(rep => (
                  <label key={rep.id}
                    className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      selected?.id === rep.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-amber-300 hover:bg-slate-50'
                    }`}>
                    <div className="flex items-center gap-3">
                      <input type="radio" name="reporter" checked={selected?.id === rep.id}
                        onChange={() => setSelected(rep)} className="text-amber-600"/>
                      <div>
                        <div className="font-medium text-slate-800 text-sm">{rep.name}</div>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${REPORTER_TYPE_BADGE[rep.type] || 'bg-slate-100 text-slate-600'}`}>
                          {rep.type === 'TELERADIOLOGY' ? 'Teleradiology' : 'Radiologist'}
                        </span>
                        {rep.specialty && <span className="text-xs text-slate-400 ml-1">{rep.specialty}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      {rep.total_rate != null
                        ? <div>
                            <div className="font-semibold text-slate-800 text-sm">{fmtINR(rep.total_rate)}</div>
                            <div className="text-xs text-slate-400">
                              {rep.study_count > 1 ? `${rep.study_count} studies` : 'total'}
                            </div>
                          </div>
                        : <div className="text-xs text-amber-600">No rate set</div>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ── Actions ───────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100">
              Cancel
            </button>
            <button onClick={confirm} disabled={saving || !selected}
              className={`px-6 py-2.5 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors ${
                saving || !selected ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 text-white'
              }`}>
              {saving && <Spinner/>}
              {saving ? 'Processing…' : 'Confirm Exam Completed'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Report Complete Confirm Modal ─────────────────────────────────────────────
const CompleteReportModal = ({ study, onClose, onSaved }) => {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const confirm = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/rad-reporting/${study.id}/report-complete`, {
        method: 'PUT',
        headers: hdrs(),
        body: JSON.stringify({ report_notes: notes }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
    } catch { setErr('Network error'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Complete Report</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{err}</p>}
          <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Patient</span><span className="font-medium">{study.patient_name}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Study</span><span className="font-medium">{study.study_name || study.study_code}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Reporter</span><span className="font-medium">{study.reporter_name || study.radiologist_code}</span>
            </div>
            <div className="flex justify-between font-semibold text-teal-700 pt-1 border-t border-slate-200 mt-1">
              <span>Payout to Generate</span>
              <span>{fmtINR(study.rate_snapshot || study.reporting_rate)}</span>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700 font-medium">⚠ This will auto-generate a payable entry</p>
            <p className="text-xs text-amber-600 mt-1">
              A journal entry will be posted: DR Direct Study Cost / CR Payable to {study.reporter_name || 'Reporter'}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Report Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              placeholder="Any notes about the report…" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={confirm} disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
            {saving ? 'Posting…' : 'Confirm Report Completed'}
          </button>
        </div>
      </div>
    </div>
  );
};

const fmtCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Study Consumables Modal ────────────────────────────────────────────────────
// Shows consumables for a study (pre-filled from template), editable, saves to GL via bill_consumables.
const StudyConsumablesModal = ({ study, onClose }) => {
  const [rows, setRows] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [addItemId, setAddItemId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  // Load: fetch template then overlay existing bill consumables
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr('');
      try {
        // 1. Template from study definition
        let template = [];
        if (study.study_definition_id) {
          const r = await fetch(`/api/study-consumables?study_definition_id=${study.study_definition_id}`, { headers: hdrs() });
          const d = await r.json();
          template = (d.consumables || []).map(c => ({
            item_master_id: c.item_master_id,
            item_name: c.item_name,
            uom: c.uom,
            item_code: c.item_code,
            unit_cost: parseFloat(c.unit_cost || 0),
            qty_used: parseFloat(c.default_qty) || 1,
            notes: '',
            is_contrast: !!study.contrast_used,
            from_template: true,
            scope: c.scope || 'per_study',
          }));
        }

        // 2. Actual saved consumables (from bill_consumables if bill linked)
        if (study.bill_id) {
          const r2 = await fetch(`/api/bill-consumables?bill_id=${study.bill_id}`, { headers: hdrs() });
          const d2 = await r2.json();
          if (d2.consumables && d2.consumables.length > 0) {
            // Merge: start from saved actuals, add any template items not yet recorded
            const saved = d2.consumables.map(c => ({
              item_master_id: c.item_master_id,
              item_name: c.item_name,
              uom: c.uom,
              item_code: c.item_code,
              unit_cost: parseFloat(c.unit_cost || 0),
              qty_used: parseFloat(c.qty_used) || 0,
              notes: c.notes || '',
              is_contrast: false,
              from_template: false,
            }));
            const savedIds = new Set(saved.map(s => s.item_master_id));
            const templateOnly = template.filter(t => !savedIds.has(t.item_master_id));
            setRows([...saved, ...templateOnly]);
          } else {
            setRows(template);
          }
        } else {
          setRows(template);
        }
      } catch (e) {
        setErr('Failed to load consumables');
      } finally {
        setLoading(false);
      }
    };
    load();

    // Load stock items for manual add
    fetch('/api/item-master?item_type=STOCK&active=true', { headers: hdrs() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStockItems(d.items || d.data || []); })
      .catch(() => {});
  }, [study.study_definition_id, study.bill_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (id, field, val) =>
    setRows(prev => prev.map(r => r.item_master_id === id ? { ...r, [field]: val } : r));

  const removeRow = (id) => setRows(prev => prev.filter(r => r.item_master_id !== id));

  const addItem = () => {
    if (!addItemId) return;
    const found = stockItems.find(i => i.id === parseInt(addItemId, 10));
    if (!found || rows.some(r => r.item_master_id === found.id)) return;
    setRows(prev => [...prev, {
      item_master_id: found.id,
      item_name: found.item_name,
      uom: found.uom,
      item_code: found.item_code,
      unit_cost: parseFloat(found.standard_rate || 0),
      qty_used: 1,
      notes: '',
      is_contrast: false,
      from_template: false,
    }]);
    setAddItemId('');
  };

  const handleSave = async () => {
    if (!study.bill_id) { setErr('No bill linked to this study. Create a bill first, then record consumables.'); return; }
    const toSave = rows.filter(r => parseFloat(r.qty_used) > 0);
    if (!toSave.length) { setErr('No consumables to save (all quantities are zero).'); return; }
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/bill-consumables/save', {
        method: 'POST',
        headers: hdrs(),
        body: JSON.stringify({
          bill_id: study.bill_id,
          consumables: toSave.map(r => ({
            item_master_id: r.item_master_id,
            qty_used: parseFloat(r.qty_used),
            notes: r.notes || null,
            is_contrast: !!r.is_contrast,
            // per_patient items → null (shared); per_study items → this study's bill_item_id
            bill_item_id: r.scope === 'per_patient' ? null : (study.id || null),
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || 'Save failed'); return; }
      setSaved(true);
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  };

  const totalCost = rows.reduce((s, r) => s + (parseFloat(r.qty_used) || 0) * (r.unit_cost || 0), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-teal-700 rounded-t-xl flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Study Consumables</h2>
            <p className="text-xs text-teal-200 mt-0.5">
              {study.patient_name} — {study.study_name || study.study_code}
              {study.modality && ` (${study.modality})`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-teal-200 hover:text-white hover:bg-teal-600 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Status info */}
          {!study.bill_id && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
              No bill linked to this study. You can view the template below, but saving requires a linked bill.
            </div>
          )}
          {study.bill_id && saved && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-xs text-emerald-700 font-medium">
              ✓ Consumables saved — stock deducted and journal entry posted.
            </div>
          )}
          {err && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">{err}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Loading consumables…
            </div>
          ) : (
            <>
              {/* Consumables table */}
              {rows.length > 0 ? (
                <div className="rounded-xl border border-teal-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-teal-50 border-b border-teal-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-teal-800">{rows.length} item{rows.length !== 1 ? 's' : ''}</span>
                    {totalCost > 0 && <span className="text-xs font-semibold text-teal-700">Total cost: {fmtCurrency(totalCost)}</span>}
                  </div>
                  <div className="divide-y divide-teal-100">
                    {/* Column headers */}
                    <div className="grid gap-2 px-4 py-2 bg-slate-50 text-[10px] font-semibold text-slate-500 uppercase tracking-wider"
                      style={{ gridTemplateColumns: '1fr 72px 48px 80px 90px 28px' }}>
                      <span>Item</span>
                      <span className="text-center">Qty</span>
                      <span className="text-center">UOM</span>
                      <span className="text-right">Unit Cost</span>
                      <span className="text-right">Total</span>
                      <span />
                    </div>
                    {rows.map(row => (
                      <div key={row.item_master_id}
                        className="grid gap-2 items-center px-4 py-2.5 hover:bg-teal-50 transition-colors"
                        style={{ gridTemplateColumns: '1fr 72px 48px 80px 90px 28px' }}>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-800 truncate">{row.item_name}</div>
                          <div className="text-[10px] text-slate-400">{row.item_code}</div>
                        </div>
                        <input
                          type="number" min="0" step="0.5"
                          value={row.qty_used}
                          onChange={e => updateRow(row.item_master_id, 'qty_used', e.target.value)}
                          className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-teal-400"
                        />
                        <span className="text-xs text-slate-500 text-center">{row.uom}</span>
                        <span className="text-xs text-slate-600 text-right">{row.unit_cost > 0 ? fmtCurrency(row.unit_cost) : '—'}</span>
                        <span className="text-xs font-semibold text-teal-800 text-right">
                          {row.unit_cost > 0 ? fmtCurrency((parseFloat(row.qty_used) || 0) * row.unit_cost) : '—'}
                        </span>
                        <button type="button" onClick={() => removeRow(row.item_master_id)}
                          className="p-1 text-red-400 hover:text-red-600 rounded transition-colors">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic text-center py-6">
                  No template consumables for this study type. Add items manually below.
                </p>
              )}

              {/* Add item */}
              <div className="flex items-end gap-2 pt-1 border-t border-slate-200">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Add stock item</label>
                  <select value={addItemId} onChange={e => setAddItemId(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400">
                    <option value="">{stockItems.length === 0 ? 'Loading…' : 'Select item to add…'}</option>
                    {stockItems.filter(i => !rows.some(r => r.item_master_id === i.id))
                      .map(i => <option key={i.id} value={i.id}>{i.item_name} ({i.uom})</option>)}
                  </select>
                </div>
                <button type="button" onClick={addItem} disabled={!addItemId}
                  className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-100 hover:bg-teal-200 rounded-lg disabled:opacity-40 transition-colors">
                  Add
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex-shrink-0">
          <div className="text-xs text-slate-400">
            {study.bill_id ? `Linked to Bill #${study.bill_id} · Saves stock movements + GL entries` : 'No bill linked'}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
              {saved ? 'Close' : 'Cancel'}
            </button>
            {study.bill_id && !saved && (
              <button onClick={handleSave} disabled={saving || loading}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60 flex items-center gap-2">
                {saving && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {saving ? 'Saving…' : 'Save & Post to GL'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Study Row — desktop table row ──────────────────────────────────────────────
const StudyRow = ({ study, onAction, showRate, canReport }) => (
  <tr className="hover:bg-teal-50 border-b border-slate-100 transition-colors">
    <td className="px-4 py-3">
      <div className="font-medium text-slate-800">{study.patient_name}</div>
      <div className="text-xs text-slate-400 mt-0.5">{study.accession_number}</div>
    </td>
    <td className="px-4 py-3">
      <div className="text-slate-700">{study.study_name || study.study_code}</div>
      {study.modality && <div className="text-xs text-slate-400">{study.modality}</div>}
    </td>
    <td className="px-4 py-3 text-slate-600 text-sm">{study.center_name}</td>
    <td className="px-4 py-3 text-slate-500 text-sm">
      {new Date(study.created_at).toLocaleDateString('en-GB')}
    </td>
    <td className="px-4 py-3">
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[study.exam_workflow_status] || 'bg-slate-100 text-slate-600'}`}>
        {STATUS_LABEL[study.exam_workflow_status] || study.exam_workflow_status}
      </span>
    </td>
    <td className="px-4 py-3">
      {study.reporter_name ? (
        <div>
          <div className="text-sm font-medium text-slate-700">
            {study.reporter_type === 'TELERADIOLOGY' || study.reporter_type === 'TELERADIOLOGY_COMPANY' ? study.reporter_name : `Dr. ${study.reporter_name}`}
          </div>
          <div className="text-xs text-slate-400">
            {study.reporter_type === 'TELERADIOLOGY_COMPANY' ? 'Teleradiology' : 'Radiologist'}
          </div>
        </div>
      ) : (
        <span className="text-xs text-slate-400">Not assigned</span>
      )}
    </td>
    {showRate && (
      <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">
        {(study.rate_snapshot || study.reporting_rate)
          ? fmtINR(study.rate_snapshot || study.reporting_rate)
          : '—'}
      </td>
    )}
    <td className="px-4 py-3 text-right">
      <div className="flex flex-col items-end gap-1.5">
        {canReport && study.exam_workflow_status === 'EXAM_SCHEDULED' && (
          <button onClick={() => onAction('exam-complete', study)}
            className="text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">
            Mark Exam Completed
          </button>
        )}
        {canReport && study.exam_workflow_status === 'EXAM_COMPLETED' && (
          <button onClick={() => onAction('report-complete', study)}
            className="text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition-colors">
            Mark Report Completed
          </button>
        )}
        {study.exam_workflow_status === 'REPORT_COMPLETED' && (
          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 justify-end">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Payout generated
          </span>
        )}
      </div>
    </td>
  </tr>
);

// ── Study Card — mobile card view ───────────────────────────────────────────────
const StudyCard = ({ study, onAction, showRate, canReport }) => (
  <div className="p-4 border-b border-slate-100 last:border-0">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-semibold text-slate-800 text-sm truncate">{study.patient_name}</p>
        <p className="text-xs text-slate-400 mt-0.5">{study.accession_number}</p>
      </div>
      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[study.exam_workflow_status] || 'bg-slate-100 text-slate-600'}`}>
        {STATUS_LABEL[study.exam_workflow_status] || study.exam_workflow_status}
      </span>
    </div>

    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
      <div><span className="text-slate-400">Study: </span>{study.study_name || study.study_code || '—'}</div>
      <div><span className="text-slate-400">Modality: </span>{study.modality || '—'}</div>
      <div><span className="text-slate-400">Center: </span>{study.center_name || '—'}</div>
      <div><span className="text-slate-400">Date: </span>{new Date(study.created_at).toLocaleDateString('en-GB')}</div>
      {study.reporter_name && (
        <div className="col-span-2">
          <span className="text-slate-400">Reporter: </span>
          {study.reporter_type === 'TELERADIOLOGY' || study.reporter_type === 'TELERADIOLOGY_COMPANY'
            ? study.reporter_name : `Dr. ${study.reporter_name}`}
        </div>
      )}
      {showRate && (study.rate_snapshot || study.reporting_rate) && (
        <div className="col-span-2"><span className="text-slate-400">Rate: </span>
          <span className="font-medium text-slate-700">{fmtINR(study.rate_snapshot || study.reporting_rate)}</span>
        </div>
      )}
    </div>

    <div className="mt-3">
      {canReport && study.exam_workflow_status === 'EXAM_SCHEDULED' && (
        <button onClick={() => onAction('exam-complete', study)}
          className="w-full text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-2 rounded-lg transition-colors">
          Mark Exam Completed
        </button>
      )}
      {canReport && study.exam_workflow_status === 'EXAM_COMPLETED' && (
        <button onClick={() => onAction('report-complete', study)}
          className="w-full text-xs font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-2 rounded-lg transition-colors">
          Mark Report Completed
        </button>
      )}
      {study.exam_workflow_status === 'REPORT_COMPLETED' && (
        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Payout generated
        </span>
      )}
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────
const StudyReporting = () => {
  const { has } = getPermissions();
  const { isCorp, userCenterId } = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      const cid = String(u.center_id || u.centerId || '');
      return { isCorp: !cid, userCenterId: cid };
    } catch { return { isCorp: false, userCenterId: '' }; }
  })();

  const [activeTab, setActiveTab] = useState('all');
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ scheduled: 0, examDone: 0, reportDone: 0 });
  const [search, setSearch] = useState('');
  const [centerId, setCenterId] = useState(userCenterId);
  const [centers, setCenters] = useState([]);

  useEffect(() => {
    if (!isCorp) return;
    fetch('/api/centers', { headers: hdrs() }).then(r => r.json()).then(d => {
      setCenters(Array.isArray(d) ? d : (d.centers || []));
    }).catch(() => {});
  }, [isCorp]);

  const filteredStudies = search.trim()
    ? studies.filter(s => {
        const q = search.toLowerCase();
        return (
          (s.patient_name   || '').toLowerCase().includes(q) ||
          (s.patient_phone  || '').toLowerCase().includes(q) ||
          (s.accession_number || '').toLowerCase().includes(q) ||
          (s.study_name     || '').toLowerCase().includes(q) ||
          (s.modality       || '').toLowerCase().includes(q) ||
          (s.center_name    || '').toLowerCase().includes(q) ||
          (s.reporter_name  || '').toLowerCase().includes(q)
        );
      })
    : studies;

  // Modals
  const [reporterModal, setReporterModal]       = useState(null);
  const [completeModal, setCompleteModal]       = useState(null);
  const [consumablesModal, setConsumablesModal] = useState(null);

  const statusForTab = {
    all:              '',
    scheduled:        'EXAM_SCHEDULED',
    exam_completed:   'EXAM_COMPLETED',
    report_completed: 'REPORT_COMPLETED',
  };

  // Always fetch KPI totals across all statuses (independent of active tab)
  const loadKpis = useCallback(async () => {
    const cq = centerId ? `&center_id=${centerId}` : '';
    try {
      const [s1, s2, s3] = await Promise.all([
        fetch(`/api/rad-reporting/worklist?exam_workflow_status=EXAM_SCHEDULED&limit=1000${cq}`, { headers: hdrs() }).then(r => r.json()),
        fetch(`/api/rad-reporting/worklist?exam_workflow_status=EXAM_COMPLETED&limit=1000${cq}`, { headers: hdrs() }).then(r => r.json()),
        fetch(`/api/rad-reporting/worklist?exam_workflow_status=REPORT_COMPLETED&limit=1000${cq}`, { headers: hdrs() }).then(r => r.json()),
      ]);
      setKpis({
        scheduled:  s1.total || s1.studies?.length || 0,
        examDone:   s2.total || s2.studies?.length || 0,
        reportDone: s3.total || s3.studies?.length || 0,
      });
    } catch { /* non-critical */ }
  }, [centerId]);

  const load = useCallback(async () => {
    setLoading(true);
    const status = statusForTab[activeTab];
    const cq = centerId ? `&center_id=${centerId}` : '';
    try {
      if (!status) {
        const [s1, s2, s3] = await Promise.all([
          fetch(`/api/rad-reporting/worklist?exam_workflow_status=EXAM_SCHEDULED&limit=100${cq}`, { headers: hdrs() }).then(r => r.json()),
          fetch(`/api/rad-reporting/worklist?exam_workflow_status=EXAM_COMPLETED&limit=100${cq}`, { headers: hdrs() }).then(r => r.json()),
          fetch(`/api/rad-reporting/worklist?exam_workflow_status=REPORT_COMPLETED&limit=100${cq}`, { headers: hdrs() }).then(r => r.json()),
        ]);
        const all = [
          ...(s1.studies || []),
          ...(s2.studies || []),
          ...(s3.studies || []),
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setStudies(all);
      } else {
        const r = await fetch(`/api/rad-reporting/worklist?exam_workflow_status=${status}&limit=100${cq}`, { headers: hdrs() });
        const d = await r.json();
        if (d.success) setStudies(d.studies || []);
      }
    } finally { setLoading(false); }
  }, [activeTab, centerId]);

  useEffect(() => { load(); loadKpis(); }, [load, loadKpis]);

  const handleAction = (action, study) => {
    if (action === 'exam-complete') setReporterModal(study);
    if (action === 'report-complete') setCompleteModal(study);
    if (action === 'consumables') setConsumablesModal(study);
  };

  const TABS = [
    { id: 'all',              label: 'All',              count: kpis.scheduled + kpis.examDone + kpis.reportDone },
    { id: 'scheduled',        label: 'Exam Scheduled',   count: kpis.scheduled },
    { id: 'exam_completed',   label: 'Exam Completed',   count: kpis.examDone },
    { id: 'report_completed', label: 'Report Completed', count: kpis.reportDone },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Worklist</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track exam and reporting workflow for all paid studies</p>
        </div>
        {isCorp && (
          <select
            value={centerId}
            onChange={e => setCenterId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 w-full sm:w-auto sm:min-w-[180px]">
            <option value="">All Centers</option>
            {centers.filter(c => c.active !== false).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-5">
          <p className="text-xl sm:text-2xl font-bold text-blue-700">{kpis.scheduled}</p>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Awaiting Exam</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-5">
          <p className="text-xl sm:text-2xl font-bold text-amber-700">{kpis.examDone}</p>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Awaiting Report</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-5">
          <p className="text-xl sm:text-2xl font-bold text-emerald-700">{kpis.reportDone}</p>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Reports Done</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search patient, accession, study…"
          className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Table / Cards */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Tab bar */}
        <div className="border-b border-slate-200 overflow-x-auto">
          <nav className="flex px-2 sm:px-4 -mb-px min-w-max">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`py-3 sm:py-3.5 px-2 sm:px-0 sm:mr-6 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1 sm:gap-1.5 whitespace-nowrap ${
                  activeTab === t.id
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === t.id ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
            <button onClick={() => load()}
              className="ml-auto py-3.5 px-2 text-xs text-slate-400 hover:text-teal-600 flex items-center gap-1 whitespace-nowrap">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </nav>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : filteredStudies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-10 h-10 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">{search ? `No results for "${search}"` : 'No studies in this stage'}</p>
            {search && <button onClick={() => setSearch('')} className="mt-2 text-xs text-teal-600 hover:underline">Clear search</button>}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filteredStudies.map(s => (
                <StudyCard key={s.id} study={s} onAction={handleAction} showRate={activeTab !== 'scheduled'} canReport={has('RADIOLOGY_REPORT')} />
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Patient</th>
                    <th className="px-4 py-3 text-left">Study</th>
                    <th className="px-4 py-3 text-left">Center</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Reporter</th>
                    {activeTab !== 'scheduled' && <th className="px-4 py-3 text-right">Rate</th>}
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudies.map(s => (
                    <StudyRow key={s.id} study={s} onAction={handleAction} showRate={activeTab !== 'scheduled'} canReport={has('RADIOLOGY_REPORT')} />
                  ))}
                </tbody>
              </table>
            </div>
            {search && (
              <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
                Showing {filteredStudies.length} of {studies.length} records
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {reporterModal && (
        <ExamCompleteModal
          study={reporterModal}
          onClose={() => setReporterModal(null)}
          onSaved={() => { setReporterModal(null); load(); loadKpis(); }}
        />
      )}
      {completeModal && (
        <CompleteReportModal
          study={completeModal}
          onClose={() => setCompleteModal(null)}
          onSaved={() => { setCompleteModal(null); load(); loadKpis(); }}
        />
      )}
      {consumablesModal && (
        <StudyConsumablesModal
          study={consumablesModal}
          onClose={() => setConsumablesModal(null)}
        />
      )}
    </div>
  );
};

export default StudyReporting;
