import React, { useState, useEffect, useCallback } from 'react';

const AUTH_HEADER = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const StatusBadge = ({ status }) => {
  const map = {
    active:      'bg-green-100 text-green-700 border-green-200',
    maintenance: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    inactive:    'bg-slate-100 text-slate-500 border-slate-200',
    retired:     'bg-red-100 text-red-600 border-red-200',
  };
  const dot = {
    active: 'bg-green-500', maintenance: 'bg-yellow-500',
    inactive: 'bg-slate-400', retired: 'bg-red-500',
  };
  const key = (status || 'inactive').toLowerCase();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[key] || map.inactive}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1 ${dot[key] || dot.inactive}`} />
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
    </span>
  );
};

const StatTile = ({ label, value, iconPath, iconBg, iconColor }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg} mb-3`}>
      <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
      </svg>
    </div>
    <p className="text-2xl font-bold text-slate-800">{value}</p>
    <p className="text-sm text-slate-500 mt-0.5">{label}</p>
  </div>
);

const inputCls = `w-full px-3 py-2 text-sm border border-slate-300 rounded-lg
  focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500
  placeholder:text-slate-400 transition-colors`;

// ─── Add Equipment Modal ───────────────────────────────────────────────────────
const AddEquipmentModal = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: '', type: '', center: '', status: 'active',
    last_maintenance: '', next_maintenance: '', serial_number: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/equipment', {
        method: 'POST',
        headers: AUTH_HEADER(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) { onSaved(data.equipment || data); onClose(); }
      else setError(data.error || data.message || 'Failed to add equipment');
    } catch { setError('Network error. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black bg-opacity-40" onClick={onClose} />
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-teal-700">
          <h2 className="text-base font-semibold text-white">Add Equipment</h2>
          <button onClick={onClose} className="p-1.5 text-teal-200 hover:text-white hover:bg-teal-600 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Equipment Name <span className="text-red-500">*</span></label>
            <input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. MRI Scanner 3T" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type <span className="text-red-500">*</span></label>
              <input name="type" value={form.type} onChange={handleChange} required placeholder="e.g. MRI, CT, X-Ray" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select name="status" value={form.status} onChange={handleChange} className={inputCls}>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
                <option value="retired">Retired</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Center / Location</label>
            <input name="center" value={form.center} onChange={handleChange} placeholder="Assigned center or location" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Serial Number</label>
            <input name="serial_number" value={form.serial_number} onChange={handleChange} placeholder="Equipment serial number" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Maintenance</label>
              <input name="last_maintenance" type="date" value={form.last_maintenance} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Next Maintenance</label>
              <input name="next_maintenance" type="date" value={form.next_maintenance} onChange={handleChange} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} placeholder="Optional notes…" className={inputCls + ' resize-none'} />
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors disabled:opacity-60 flex items-center gap-2">
            {saving && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
            {saving ? 'Saving…' : 'Add Equipment'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Equipment Page ────────────────────────────────────────────────────────────
const Equipment = () => {
  const [equipment, setEquipment] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ status: '', type: '', center: '' });
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState({ total: 0, active: 0, maintenance: 0, inactive: 0 });

  const LIMIT = 10;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearchTerm(searchInput); setCurrentPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchEquipment = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: LIMIT,
        ...(searchTerm && { search: searchTerm }),
        ...(filters.status && { status: filters.status }),
        ...(filters.type && { type: filters.type }),
        ...(filters.center && { center: filters.center }),
      });
      const res = await fetch(`/api/equipment?${params}`, { headers: AUTH_HEADER() });
      const data = await res.json();
      if (res.ok) {
        setEquipment(data.equipment || data.data || []);
        setTotal(data.total || data.count || (data.equipment || data.data || []).length);
        if (data.stats) setStats(data.stats);
      } else {
        setError(data.error || 'Failed to fetch equipment');
      }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }, [currentPage, searchTerm, filters]);

  useEffect(() => { fetchEquipment(); }, [fetchEquipment]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this equipment record?')) return;
    try {
      const res = await fetch(`/api/equipment/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
      if (res.ok) { setEquipment(prev => prev.filter(e => e.id !== id)); setTotal(t => t - 1); }
      else setError('Failed to delete equipment');
    } catch { setError('Network error'); }
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const clearFilters = () => { setFilters({ status: '', type: '', center: '' }); setCurrentPage(1); };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';

  // Compute stats from local data if API doesn't provide them
  const computedStats = {
    total: total || equipment.length,
    active: stats.active || equipment.filter(e => (e.status || '').toLowerCase() === 'active').length,
    maintenance: stats.maintenance || equipment.filter(e => (e.status || '').toLowerCase() === 'maintenance').length,
    inactive: stats.inactive || equipment.filter(e => (e.status || '').toLowerCase() === 'inactive').length,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-screen-xl">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Equipment</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} item{total !== 1 ? 's' : ''} registered</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Equipment
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Total Equipment" value={computedStats.total}
          iconPath="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"
          iconBg="bg-teal-50" iconColor="text-teal-600" />
        <StatTile label="Active" value={computedStats.active}
          iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          iconBg="bg-green-50" iconColor="text-green-600" />
        <StatTile label="In Maintenance" value={computedStats.maintenance}
          iconPath="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          iconBg="bg-yellow-50" iconColor="text-yellow-600" />
        <StatTile label="Inactive" value={computedStats.inactive}
          iconPath="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          iconBg="bg-slate-50" iconColor="text-slate-500" />
      </div>

      {/* Search + Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search equipment…" value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400" />
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-teal-50 border-teal-300 text-teal-700'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filters
            {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-teal-600" />}
          </button>
        </div>

        {/* Collapsible filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select value={filters.status}
                onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
                <option value="retired">Retired</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <input value={filters.type}
                onChange={e => { setFilters(f => ({ ...f, type: e.target.value })); setCurrentPage(1); }}
                placeholder="e.g. MRI, CT, X-Ray"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Center</label>
              <input value={filters.center}
                onChange={e => { setFilters(f => ({ ...f, center: e.target.value })); setCurrentPage(1); }}
                placeholder="Filter by center"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400" />
            </div>
            {hasActiveFilters && (
              <div className="col-span-1 sm:col-span-3 flex justify-end">
                <button onClick={clearFilters} className="text-xs text-teal-600 hover:text-teal-800 font-medium underline underline-offset-2">
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
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
        ) : equipment.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-12 h-12 mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
            <p className="text-sm font-medium text-slate-500">No equipment found</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchInput || hasActiveFilters ? 'Try adjusting your search or filters' : 'Add your first equipment record to get started'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-teal-700">
                  {['Equipment Name', 'Type', 'Center', 'Status', 'Last Maintenance', 'Next Maintenance', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {equipment.map((eq) => {
                  const nextMaint = eq.next_maintenance ? new Date(eq.next_maintenance) : null;
                  const isOverdueMaint = nextMaint && nextMaint < new Date();
                  return (
                    <tr key={eq.id} className="hover:bg-teal-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{eq.name}</p>
                            {eq.serial_number && <p className="text-xs text-slate-400">S/N: {eq.serial_number}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{eq.type || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{eq.center || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={eq.status} /></td>
                      <td className="px-4 py-3 text-sm text-slate-500">{fmtDate(eq.last_maintenance)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${isOverdueMaint ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                          {fmtDate(eq.next_maintenance)}
                          {isOverdueMaint && <span className="ml-1 text-xs">(Overdue)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(eq.id)}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors">
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && equipment.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-xs text-slate-500">Page <span className="font-medium text-slate-700">{currentPage}</span> of <span className="font-medium text-slate-700">{totalPages}</span></p>
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
        <AddEquipmentModal
          onClose={() => setShowModal(false)}
          onSaved={(eq) => { setEquipment(prev => [eq, ...prev]); setTotal(t => t + 1); }}
        />
      )}
    </div>
  );
};

export default Equipment;
