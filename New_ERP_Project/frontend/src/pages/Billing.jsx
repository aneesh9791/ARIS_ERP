import { useState, useEffect, useCallback, useRef } from 'react';
import { getPermissions } from '../utils/permissions';


const AUTH_HEADER = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const StatusBadge = ({ status }) => {
  const map = {
    paid:    'bg-green-100 text-green-700 border-green-200',
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    overdue: 'bg-red-100 text-red-700 border-red-200',
    draft:   'bg-slate-100 text-slate-600 border-slate-200',
    billed:  'bg-blue-100 text-blue-700 border-blue-200',
  };
  const key = (status || '').toLowerCase();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[key] || map.draft}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1 ${
        key === 'paid' ? 'bg-green-500' : key === 'pending' ? 'bg-yellow-500' : key === 'overdue' ? 'bg-red-500' : key === 'billed' ? 'bg-blue-500' : 'bg-slate-400'
      }`} />
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
    </span>
  );
};

const StatTile = ({ label, value, sub, iconPath, iconBg, iconColor }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
    <div className="flex items-start justify-between">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
        </svg>
      </div>
    </div>
    <div className="mt-3">
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const inputCls = `w-full px-3 py-2 text-sm border border-slate-300 rounded-lg
  focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500
  placeholder:text-slate-400 transition-colors`;

const fmtCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Bill Consumables Section ──────────────────────────────────────────────────
// Receives rows/setRows from parent (NewBillModal owns the state).
// Parent directly saves the rows after bill creation — no forwardRef needed.
// ─── New Bill Modal ────────────────────────────────────────────────────────────
const NewBillModal = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({
    service: '', amount: '', payment_mode: 'CASH', status: 'BILLED', notes: '',
    study_definition_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef(null);

  // Study definitions — filtered to selected/user center
  const [studyDefs, setStudyDefs] = useState([]);
  const [studyDefsErr, setStudyDefsErr] = useState('');
  const [selectedDef, setSelectedDef] = useState(null);

  // Add-on line items
  const [contrastOptions, setContrastOptions] = useState([]); // available contrast add-ons for modality
  const [contrastItem, setContrastItem]       = useState(null);   // selected { id, name, price } or null
  const [dicomItem, setDicomItem]             = useState(null);   // { id, name, price } or null
  const [dicomChecked, setDicomChecked]       = useState(true);   // checkbox state
  const [addonsLoading, setAddonsLoading]     = useState(false);

  // Center selector (for admin/corporate users with no assigned center)
  const [centers, setCenters] = useState([]);
  const [selectedCenterId, setSelectedCenterId] = useState('');

  const userCenterId = (() => {
    try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return u.center_id || u.centerId || ''; }
    catch { return ''; }
  })();
  const isAdminUser = !userCenterId; // no center assigned → show center picker

  // Load centers list for admin users
  useEffect(() => {
    if (!isAdminUser) return;
    fetch('/api/centers', { headers: AUTH_HEADER() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const list = (data?.centers || []).filter(c => c.corporate_entity_id != null);
        setCenters(list);
      })
      .catch(() => {});
  }, [isAdminUser]);

  // Effective center id: use selectedCenterId if admin, else user's own center
  const effectiveCenterId = isAdminUser ? selectedCenterId : String(userCenterId);

  useEffect(() => {
    const loadStudies = async () => {
      setStudyDefsErr('');
      try {
        const url = effectiveCenterId
          ? `/api/masters/study-definitions?active_only=true&center_id=${effectiveCenterId}`
          : '/api/masters/study-definitions?active_only=true';
        const defsRes = await fetch(url, { headers: AUTH_HEADER() });
        const defsData = await defsRes.json();
        if (!defsData.studies) { setStudyDefsErr(defsData.error || 'Failed to load studies'); return; }
        setStudyDefs(defsData.studies);
      } catch { setStudyDefsErr('Network error loading studies'); }
    };
    loadStudies();
  }, [effectiveCenterId]);

  // Debounced patient search
  useEffect(() => {
    if (!patientSearch.trim() || patientSearch.length < 2) {
      setPatientResults([]);
      return;
    }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/patients?search=${encodeURIComponent(patientSearch)}&limit=6`, { headers: AUTH_HEADER() })
        .then(r => r.ok ? r.json() : null)
        .then(data => { setPatientResults(data?.patients || data?.data || []); })
        .catch(() => setPatientResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [patientSearch]);

  const selectPatient = (p) => {
    setSelectedPatient(p);
    setPatientSearch('');
    setPatientResults([]);
  };

  // Fetch add-ons whenever the selected study changes
  useEffect(() => {
    if (!selectedDef) {
      setContrastOptions([]);
      setContrastItem(null);
      setDicomItem(null);
      return;
    }
    setAddonsLoading(true);
    const modality = selectedDef.modality || '';
    Promise.all([
      // Contrast options — only if study is contrast-type
      selectedDef.is_contrast_study
        ? fetch(`/api/service-management/services/addons/contrast?modality=${modality}`, { headers: AUTH_HEADER() })
            .then(r => r.ok ? r.json() : null)
        : Promise.resolve(null),
      // DICOM — always fetch
      fetch('/api/service-management/services/addons', { headers: AUTH_HEADER() })
        .then(r => r.ok ? r.json() : null),
    ])
      .then(([contrastData, allAddons]) => {
        const options = contrastData?.data || [];
        setContrastOptions(options);
        setContrastItem(null); // user must pick from dropdown
        const dicom = (allAddons?.data || []).find(s => s.item_type === 'DICOM_CD' && s.is_active);
        setDicomItem(dicom ? { id: dicom.id, name: dicom.name, price: dicom.price } : null);
        setDicomChecked(true);
      })
      .catch(() => { setContrastOptions([]); setContrastItem(null); setDicomItem(null); })
      .finally(() => setAddonsLoading(false));
  }, [selectedDef]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (name === 'study_definition_id') {
      const def = studyDefs.find(d => d.id === parseInt(value, 10)) || null;
      setSelectedDef(def);
      // Auto-fill amount from center price
      if (def?.center_price) {
        setForm(f => ({ ...f, [name]: value, amount: Number(def.center_price).toFixed(2) }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatient) { setError('Please search and select a patient.'); return; }
    if (!form.amount || parseFloat(form.amount) < 0) { setError('Please enter a valid amount.'); return; }

    setSaving(true);
    setError('');
    try {
      const addonTotal = (contrastItem ? Number(contrastItem.price) : 0)
                       + (dicomChecked && dicomItem ? Number(dicomItem.price) : 0);
      const totalAmount = parseFloat(form.amount) + addonTotal;

      // Build add-on notes suffix
      const addonNotes = [
        contrastItem ? `Contrast: ${contrastItem.name} ₹${Number(contrastItem.price).toFixed(2)}` : null,
        dicomChecked && dicomItem ? `DICOM CD: ${dicomItem.name} ₹${Number(dicomItem.price).toFixed(2)}` : null,
      ].filter(Boolean).join('; ');

      const payload = {
        patient_id: selectedPatient.id,
        service: form.service,
        amount: totalAmount,
        payment_mode: form.payment_mode,
        status: form.status,
        notes: [form.notes, addonNotes].filter(Boolean).join(' | '),
        addon_contrast: contrastItem ? { id: contrastItem.id, name: contrastItem.name, price: Number(contrastItem.price) } : null,
        addon_dicom: dicomChecked && dicomItem ? { id: dicomItem.id, name: dicomItem.name, price: Number(dicomItem.price) } : null,
      };

      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: AUTH_HEADER(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.message || 'Failed to create bill');
        return;
      }

      const bill = data.bill || data;

      onSaved(bill);
      onClose();
    } catch { setError('Network error. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-teal-700 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">New Bill</h2>
          <button onClick={onClose} className="p-1.5 text-teal-200 hover:text-white hover:bg-teal-600 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

          {/* Patient search */}
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Patient <span className="text-red-500">*</span>
            </label>
            {selectedPatient ? (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-teal-50 border border-teal-300 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-900">{selectedPatient.name}</p>
                  <p className="text-xs text-teal-600">
                    PID: {selectedPatient.pid}
                    {selectedPatient.phone ? ` · ${selectedPatient.phone}` : ''}
                    {selectedPatient.gender ? ` · ${selectedPatient.gender}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-teal-600 hover:text-teal-900 font-medium px-2 py-1 rounded hover:bg-teal-100 transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={patientSearch}
                  onChange={e => setPatientSearch(e.target.value)}
                  placeholder="Search by name, PID, or phone…"
                  className={inputCls}
                  autoComplete="off"
                />
                {searchLoading && (
                  <div className="absolute right-3 top-2.5">
                    <svg className="w-4 h-4 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
                {patientResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                    {patientResults.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectPatient(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-teal-50 border-b border-slate-100 last:border-0 transition-colors"
                      >
                        <p className="text-sm font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-500">
                          {p.pid}
                          {p.phone ? ` · ${p.phone}` : ''}
                          {p.gender ? ` · ${p.gender}` : ''}
                          {p.date_of_birth ? ` · DOB ${new Date(p.date_of_birth).toLocaleDateString('en-IN')}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {patientSearch.length >= 2 && !searchLoading && patientResults.length === 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-3 text-xs text-slate-500">
                    No patients found for "{patientSearch}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Center selector — only shown for admin/corporate users with no assigned center */}
          {isAdminUser && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Center
                <span className="ml-1 text-xs text-slate-400 font-normal">(select to filter studies by center pricing)</span>
              </label>
              <select
                value={selectedCenterId}
                onChange={e => { setSelectedCenterId(e.target.value); setForm(f => ({ ...f, study_definition_id: '' })); setSelectedDef(null); }}
                className={inputCls}
              >
                <option value="">— All Centers —</option>
                {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* Service / description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Service / Description</label>
            <input name="service" value={form.service} onChange={handleChange}
              placeholder="e.g. MRI Brain Contrast" className={inputCls} />
          </div>

          {/* Study type → enables consumable pre-fill */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Study Type
              <span className="ml-1 text-xs text-slate-400 font-normal">(optional — auto-loads add-ons)</span>
            </label>
            <select name="study_definition_id" value={form.study_definition_id} onChange={handleChange} className={inputCls}>
              <option value="">{studyDefs.length === 0 && !studyDefsErr ? 'Loading studies…' : 'None / Not applicable'}</option>
              {studyDefs.map(d => (
                <option key={d.id} value={d.id}>
                  {d.study_name}{d.is_contrast_study ? ' · Contrast' : ''} ({d.modality})
                </option>
              ))}
            </select>
            {/* Contrast badge shown below selector when a contrast study is selected */}
            {selectedDef?.is_contrast_study && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                  Contrast Study
                </span>
                <span className="text-xs text-amber-600">Contrast add-on required — select below</span>
              </div>
            )}
            {studyDefsErr && <p className="text-xs text-red-600 mt-1">{studyDefsErr}</p>}
            {!studyDefsErr && studyDefs.length === 0 && <p className="text-xs text-amber-600 mt-1">No study definitions found — add studies in Master Data → Study Catalogue first.</p>}
          </div>

          {/* ─── Add-on line items ───────────────────────────────────────── */}
          {(contrastOptions.length > 0 || dicomItem || addonsLoading) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Add-on Services</p>

              {/* Contrast — dropdown selection */}
              {contrastOptions.length > 0 && (
                <div className="bg-white rounded-lg px-3 py-2.5 border border-amber-100">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 flex-shrink-0">Contrast</span>
                    <span className="text-xs text-slate-500">Select contrast agent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={contrastItem?.id || ''}
                      onChange={e => {
                        const opt = contrastOptions.find(o => o.id === parseInt(e.target.value));
                        setContrastItem(opt ? { id: opt.id, name: opt.name, price: opt.price } : null);
                      }}
                      className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    >
                      <option value="">— None —</option>
                      {contrastOptions.map(o => (
                        <option key={o.id} value={o.id}>{o.name} — ₹{Number(o.price).toFixed(2)}</option>
                      ))}
                    </select>
                    {contrastItem && (
                      <span className="text-sm font-semibold text-amber-700 flex-shrink-0">₹{Number(contrastItem.price).toFixed(2)}</span>
                    )}
                  </div>
                </div>
              )}

              {/* DICOM CD — checkbox */}
              {dicomItem && (
                <div className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-orange-100">
                  <label className="flex items-center gap-2 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={dicomChecked}
                      onChange={e => setDicomChecked(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 flex-shrink-0"
                    />
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 flex-shrink-0">DICOM</span>
                    <span className="text-sm text-slate-700 truncate">{dicomItem.name}</span>
                  </label>
                  <span className="text-sm font-medium text-slate-800 flex-shrink-0">₹{Number(dicomItem.price).toFixed(2)}</span>
                </div>
              )}

              {/* Add-on subtotal hint */}
              {(() => {
                const addonTotal = (contrastItem ? Number(contrastItem.price) : 0) + (dicomChecked && dicomItem ? Number(dicomItem.price) : 0);
                return addonTotal > 0 ? (
                  <p className="text-xs text-slate-400 text-right pt-1">
                    Add-ons subtotal: <span className="font-medium text-slate-600">₹{addonTotal.toFixed(2)}</span>
                    {form.amount ? (
                      <span className="ml-2">· Bill total: <span className="font-semibold text-teal-700">₹{(Number(form.amount) + addonTotal).toFixed(2)}</span></span>
                    ) : null}
                  </p>
                ) : null;
              })()}
            </div>
          )}

          {/* Amount, Payment Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹) <span className="text-red-500">*</span></label>
              <input name="amount" type="number" min="0" step="0.01" value={form.amount}
                onChange={handleChange} required placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Mode</label>
              <select name="payment_mode" value={form.payment_mode} onChange={handleChange} className={inputCls}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="INSURANCE">Insurance</option>
                <option value="COMBINED">Combined</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select name="status" value={form.status} onChange={handleChange} className={inputCls}>
              <option value="BILLED">Billed (Unpaid)</option>
              <option value="PAID">Paid</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange}
              rows={2} placeholder="Optional notes…" className={inputCls + ' resize-none'} />
          </div>

        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <button onClick={onClose} type="button"
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
            {saving && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? 'Creating Bill…' : 'Create Bill'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Billing Page ──────────────────────────────────────────────────────────────
const Billing = () => {
  const { has } = getPermissions();
  const [bills, setBills] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState({ total_billed: 0, collected: 0, pending: 0, overdue: 0 });

  const LIMIT = 10;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: LIMIT,
        ...(statusFilter && { payment_status: statusFilter }),
        ...(dateFrom && { start_date: dateFrom }),
        ...(dateTo && { end_date: dateTo }),
      });
      const res = await fetch(`/api/billing?${params}`, { headers: AUTH_HEADER() });
      const data = await res.json();
      if (res.ok) {
        setBills(data.bills || data.data || []);
        setTotal(data.pagination?.total || data.total || (data.bills || data.data || []).length);
        if (data.stats) setStats(data.stats);
      } else {
        setError(data.error || 'Failed to fetch bills');
      }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }, [currentPage, statusFilter, dateFrom, dateTo]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Page Header */}
      <div className="px-6 pt-6 pb-5"
        style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f766e 60%,#0d9488 100%)' }}>
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Billing</h1>
              <p className="text-teal-200 text-sm mt-0.5">{total} bill{total !== 1 ? 's' : ''} total · Invoices &amp; payment tracking</p>
            </div>
          </div>
          {has('BILLING_WRITE') && (
            <button onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-teal-700 bg-white hover:bg-teal-50 rounded-xl shadow-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Bill
            </button>
          )}
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-6">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatTile label="Total Billed" value={fmtCurrency(stats.total_billed)}
            iconPath="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            iconBg="bg-teal-50" iconColor="text-teal-600" />
          <StatTile label="Collected" value={fmtCurrency(stats.collected)}
            iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            iconBg="bg-green-50" iconColor="text-green-600" />
          <StatTile label="Pending" value={fmtCurrency(stats.pending)}
            iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            iconBg="bg-yellow-50" iconColor="text-yellow-600" />
          <StatTile label="Overdue" value={fmtCurrency(stats.overdue)}
            iconPath="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            iconBg="bg-red-50" iconColor="text-red-600" />
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">All statuses</option>
                <option value="BILLED">Billed</option>
                <option value="PAID">Paid</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-slate-600 mb-1">From date</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-slate-600 mb-1">To date</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            {(statusFilter || dateFrom || dateTo) && (
              <button onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo(''); setCurrentPage(1); }}
                className="px-3 py-2 text-sm text-teal-600 hover:text-teal-800 font-medium border border-teal-200 bg-teal-50 rounded-lg transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
          ) : bills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <svg className="w-12 h-12 mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
              </svg>
              <p className="text-sm font-medium text-slate-500">No bills found</p>
              <p className="text-xs text-slate-400 mt-1">Create your first bill to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-teal-700">
                    {['Invoice #', 'Patient', 'Amount', 'GST', 'Total', 'Mode', 'Status', 'Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map((b) => (
                    <tr key={b.id} className="hover:bg-teal-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-slate-600">
                        {b.invoice_number || `#${b.id}`}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{b.patient_name || '—'}</p>
                        {b.patient_pid && <p className="text-xs text-slate-400">{b.patient_pid}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{fmtCurrency(b.subtotal || b.total_amount)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{fmtCurrency(b.total_gst)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800">{fmtCurrency(b.total_amount)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{b.payment_mode || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.payment_status} /></td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {b.bill_date ? new Date(b.bill_date).toLocaleDateString('en-IN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && bills.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
              <p className="text-xs text-slate-500">
                Page <span className="font-medium text-slate-700">{currentPage}</span> of{' '}
                <span className="font-medium text-slate-700">{totalPages}</span>
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Previous
                </button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {showModal && (
          <NewBillModal
            onClose={() => setShowModal(false)}
            onSaved={(bill) => { setBills(prev => [bill, ...prev]); setTotal(t => t + 1); }}
          />
        )}
      </div>
    </div>
  );
};

export default Billing;
