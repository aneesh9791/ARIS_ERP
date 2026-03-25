import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, RefreshCw, Clock, User, Database, ChevronDown, ChevronUp } from 'lucide-react';

const API = (path) => `/api${path}`;
const token = () => localStorage.getItem('token');

const ENTITY_LABELS = {
  patients: 'Patient', users: 'User', centers: 'Center',
  studies: 'Study', patient_bills: 'Bill', chart_of_accounts: 'Chart of Accounts',
  item_master: 'Item Master', user_roles: 'User Role', vendors: 'Vendor',
  employees: 'Employee', ACCOUNTING_BILL: 'Accounting Bill',
};

const ACTION_COLORS = {
  CREATE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  UPDATE: 'bg-blue-50 text-blue-700 border-blue-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
};

function DiffRow({ label, oldVal, newVal }) {
  if (oldVal === newVal) return null;
  const fmt = (v) => {
    if (v === null || v === undefined) return <span className="text-gray-400 italic">—</span>;
    if (typeof v === 'object') return <span className="font-mono text-xs">{JSON.stringify(v)}</span>;
    return String(v);
  };
  return (
    <tr className="border-b border-gray-100">
      <td className="py-1 pr-3 text-xs text-gray-500 font-medium whitespace-nowrap">{label}</td>
      <td className="py-1 pr-3 text-xs text-red-600 line-through">{fmt(oldVal)}</td>
      <td className="py-1 text-xs text-emerald-700">{fmt(newVal)}</td>
    </tr>
  );
}

function RecordRow({ rec }) {
  const [open, setOpen] = useState(false);

  const entityLabel = ENTITY_LABELS[rec.entity_type] || rec.entity_type;
  const actionCls   = ACTION_COLORS[rec.action] || 'bg-gray-50 text-gray-700 border-gray-200';

  const oldV = rec.old_values || {};
  const newV = rec.new_values || {};
  const SKIP = ['updated_at', 'created_at', 'password_hash', 'password', 'pin'];
  const changedKeys = [...new Set([...Object.keys(oldV), ...Object.keys(newV)])]
    .filter(k => !SKIP.includes(k) && oldV[k] !== newV[k]);

  const ts = new Date(rec.timestamp);
  const dateStr = ts.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  const timeStr = ts.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => changedKeys.length > 0 && setOpen(o => !o)}
      >
        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
          <div className="font-medium text-gray-700">{dateStr}</div>
          <div className="text-gray-400">{timeStr}</div>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border ${actionCls}`}>
            {rec.action}
          </span>
        </td>
        <td className="px-4 py-3 text-xs">
          <span className="font-medium text-gray-700">{entityLabel}</span>
          <span className="ml-1.5 text-gray-400">#{rec.entity_id}</span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-600">
          {rec.user_name || rec.username || (rec.user_id ? `User #${rec.user_id}` : <span className="text-gray-400 italic">System</span>)}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">
          {rec.ip_address || '—'}
        </td>
        <td className="px-4 py-3 text-center">
          {changedKeys.length > 0 && (
            <span className="text-gray-400">
              {open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </span>
          )}
        </td>
      </tr>

      {open && changedKeys.length > 0 && (
        <tr className="bg-gray-50 border-b border-gray-100">
          <td colSpan={6} className="px-6 py-3">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left text-[10px] font-semibold text-gray-400 uppercase pb-1 pr-3 w-40">Field</th>
                  <th className="text-left text-[10px] font-semibold text-red-400 uppercase pb-1 pr-3">Before</th>
                  <th className="text-left text-[10px] font-semibold text-emerald-500 uppercase pb-1">After</th>
                </tr>
              </thead>
              <tbody>
                {changedKeys.map(k => (
                  <DiffRow key={k} label={k} oldVal={oldV[k]} newVal={newV[k]} />
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AuditLog() {
  const [records, setRecords]     = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const [search, setSearch]       = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction]       = useState('');
  const [days, setDays]           = useState('30');
  const [page, setPage]           = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        days, limit: LIMIT, offset: page * LIMIT,
        ...(entityType && { entity_type: entityType }),
        ...(action     && { action }),
      });
      const res  = await fetch(API(`/rbac/audit-trail?${params}`), {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [days, entityType, action, page]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? records.filter(r =>
        (r.entity_type || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.user_name   || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.username    || '').toLowerCase().includes(search.toLowerCase()) ||
        String(r.entity_id).includes(search)
      )
    : records;

  const entityTypes = [...new Set(records.map(r => r.entity_type))].sort();

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-0.5">Track all data changes across the system</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search entity, user…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-teal-500"
          />
        </div>

        {/* Entity type */}
        <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(0); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 text-gray-600">
          <option value="">All Entities</option>
          {entityTypes.map(t => (
            <option key={t} value={t}>{ENTITY_LABELS[t] || t}</option>
          ))}
        </select>

        {/* Action */}
        <select value={action} onChange={e => { setAction(e.target.value); setPage(0); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 text-gray-600">
          <option value="">All Actions</option>
          <option value="CREATE">Create</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
        </select>

        {/* Days */}
        <select value={days} onChange={e => { setDays(e.target.value); setPage(0); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 text-gray-600">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 1 year</option>
        </select>

        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/>
          Refresh
        </button>

        {/* Stats */}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
          <Database size={12}/>
          <span>{total.toLocaleString()} total records</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Timestamp','Action','Entity','User','IP Address',''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                <RefreshCw size={16} className="animate-spin inline mr-2"/>Loading…
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                No audit records found for the selected filters.
              </td></tr>
            ) : (
              filtered.map(r => <RecordRow key={r.id} rec={r}/>)
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {total > LIMIT && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">
                Previous
              </button>
              <button disabled={(page + 1) * LIMIT >= total} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
