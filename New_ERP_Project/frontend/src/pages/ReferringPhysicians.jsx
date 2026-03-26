import { useState, useEffect, useCallback } from 'react';

const AUTH_HEADER = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

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
                  <td className="px-4 py-3 font-medium text-slate-800">{p.first_name} {p.last_name}</td>
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

export default function ReferringPhysicians() {
  const [physicians, setPhysicians] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  const fetchPhysicians = useCallback(async () => {
    try {
      const res = await fetch('/api/referring-physicians?active_only=false', { headers: AUTH_HEADER() });
      if (res.ok) {
        const data = await res.json();
        setPhysicians(data.physicians || []);
      } else {
        setError('Failed to fetch referring physicians');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPhysicians(); }, [fetchPhysicians]);

  const handleCreate = async (data) => {
    const res = await fetch('/api/referring-physicians', {
      method: 'POST', headers: AUTH_HEADER(), body: JSON.stringify(data),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.errors?.[0]?.msg || d.error || 'Failed to create physician'); }
    const body = await res.json();
    setPhysicians(prev => [...prev, body.physician]);
  };

  const handleUpdate = async (id, data) => {
    const res = await fetch(`/api/referring-physicians/${id}`, {
      method: 'PUT', headers: AUTH_HEADER(), body: JSON.stringify(data),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.errors?.[0]?.msg || d.error || 'Failed to update physician'); }
    const body = await res.json();
    setPhysicians(prev => prev.map(p => p.id === id ? body.physician : p));
  };

  const handleDelete = async (id) => {
    const res = await fetch(`/api/referring-physicians/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete physician'); }
    setPhysicians(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f766e 60%, #0d9488 100%)' }}>
        <div className="max-w-screen-xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Referring Physicians</h1>
              <p className="text-xs sm:text-sm mt-0.5" style={{ color: '#99f6e4' }}>
                Doctors &amp; specialists who refer patients
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
              <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              <span>Loading…</span>
            </div>
          ) : (
            <PhysicianMaster
              physicians={physicians}
              onPhysicianCreate={handleCreate}
              onPhysicianUpdate={handleUpdate}
              onPhysicianDelete={handleDelete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
