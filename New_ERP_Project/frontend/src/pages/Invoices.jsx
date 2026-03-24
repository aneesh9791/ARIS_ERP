import React, { useState, useEffect, useCallback } from 'react';

const AUTH_HEADER = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const StatusBadge = ({ status }) => {
  const map = {
    paid:        'bg-green-100 text-green-700 border-green-200',
    pending:     'bg-yellow-100 text-yellow-700 border-yellow-200',
    outstanding: 'bg-orange-100 text-orange-700 border-orange-200',
    overdue:     'bg-red-100 text-red-700 border-red-200',
    draft:       'bg-slate-100 text-slate-600 border-slate-200',
  };
  const dot = {
    paid: 'bg-green-500', pending: 'bg-yellow-500',
    outstanding: 'bg-orange-500', overdue: 'bg-red-500', draft: 'bg-slate-400',
  };
  const key = (status || 'draft').toLowerCase();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[key] || map.draft}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1 ${dot[key] || dot.draft}`} />
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft'}
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

// ─── Create Invoice Modal ──────────────────────────────────────────────────────
const CreateInvoiceModal = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({
    patient_name: '', service: '', amount: '', invoice_date: '', due_date: '', status: 'draft', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: AUTH_HEADER(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) { onSaved(data.invoice || data); onClose(); }
      else setError(data.error || data.message || 'Failed to create invoice');
    } catch { setError('Network error. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-teal-700">
          <h2 className="text-base font-semibold text-white">Create Invoice</h2>
          <button onClick={onClose} className="p-1.5 text-teal-200 hover:text-white hover:bg-teal-600 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Patient / Customer <span className="text-red-500">*</span></label>
            <input name="patient_name" value={form.patient_name} onChange={handleChange} required placeholder="Patient or customer name" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Service / Description <span className="text-red-500">*</span></label>
            <input name="service" value={form.service} onChange={handleChange} required placeholder="e.g. MRI Scan, Consultation" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹) <span className="text-red-500">*</span></label>
              <input name="amount" type="number" min="0" step="0.01" value={form.amount} onChange={handleChange} required placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select name="status" value={form.status} onChange={handleChange} className={inputCls}>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="outstanding">Outstanding</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Date</label>
              <input name="invoice_date" type="date" value={form.invoice_date} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
              <input name="due_date" type="date" value={form.due_date} onChange={handleChange} className={inputCls} />
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
            {saving ? 'Creating…' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Invoices Page ────────────────────────────────���────────────────────────────
const Invoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState({ total: 0, paid: 0, outstanding: 0, draft: 0 });

  const LIMIT = 10;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearchTerm(searchInput); setCurrentPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: LIMIT,
        ...(searchTerm && { search: searchTerm }),
        ...(statusFilter && { status: statusFilter }),
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
      });
      const res = await fetch(`/api/invoices?${params}`, { headers: AUTH_HEADER() });
      const data = await res.json();
      if (res.ok) {
        setInvoices(data.invoices || data.data || []);
        setTotal(data.total || data.count || (data.invoices || data.data || []).length);
        if (data.stats) setStats(data.stats);
      } else {
        setError(data.error || 'Failed to fetch invoices');
      }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }, [currentPage, searchTerm, statusFilter, dateFrom, dateTo]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this invoice?')) return;
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
      if (res.ok) { setInvoices(prev => prev.filter(i => i.id !== id)); setTotal(t => t - 1); }
      else setError('Failed to delete invoice');
    } catch { setError('Network error'); }
  };

  const handleDownloadPDF = (invoice) => {
    // Placeholder — integrate with actual PDF endpoint
    const url = `/api/invoices/${invoice.id}/pdf`;
    window.open(url, '_blank');
  };

  const fmtCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-screen-xl">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} invoice{total !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Total Invoices" value={stats.total || total}
          iconPath="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          iconBg="bg-teal-50" iconColor="text-teal-600" />
        <StatTile label="Paid" value={stats.paid || 0}
          iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          iconBg="bg-green-50" iconColor="text-green-600" />
        <StatTile label="Outstanding" value={stats.outstanding || 0}
          iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          iconBg="bg-orange-50" iconColor="text-orange-600" />
        <StatTile label="Draft" value={stats.draft || 0}
          iconPath="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          iconBg="bg-slate-50" iconColor="text-slate-500" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Search invoices…" value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400" />
            </div>
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="outstanding">Outstanding</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          {(searchInput || statusFilter || dateFrom || dateTo) && (
            <button onClick={() => { setSearchInput(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setCurrentPage(1); }}
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
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-12 h-12 mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium text-slate-500">No invoices found</p>
            <p className="text-xs text-slate-400 mt-1">Create your first invoice to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-teal-700">
                  {['Invoice #', 'Patient / Customer', 'Date', 'Due Date', 'Amount', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-teal-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-slate-600">#{inv.id || inv.invoice_number || '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{inv.patient_name || inv.customer_name || inv.patient || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-800">{fmtCurrency(inv.amount)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDownloadPDF(inv)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          PDF
                        </button>
                        <button onClick={() => handleDelete(inv.id)}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && invoices.length > 0 && (
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
        <CreateInvoiceModal
          onClose={() => setShowModal(false)}
          onSaved={(inv) => { setInvoices(prev => [inv, ...prev]); setTotal(t => t + 1); }}
        />
      )}
    </div>
  );
};

export default Invoices;
