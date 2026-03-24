import { useState, useEffect, useCallback } from 'react';

const token = () => localStorage.getItem('token');
const hdrs  = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

// ── User Modal ─────────────────────────────────────────────────────────────────
const UserModal = ({ user, centers, roles, onClose, onSaved }) => {
  const isEdit = !!user;
  const EMPTY = { username: '', name: '', email: '', password: '', role: roles[0]?.role || '', center_id: '', department_id: '', active: true };
  const [form, setForm] = useState(isEdit ? { ...EMPTY, ...user, password: '', center_id: user.center_id || '' } : EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setErr('');
    if (!form.name.trim()) return setErr('Name is required');
    if (!form.email.trim()) return setErr('Email is required');
    if (!isEdit && !form.password) return setErr('Password is required');
    if (!isEdit && !form.username.trim()) return setErr('Username is required');

    const body = {
      name:          form.name.trim(),
      email:         form.email.trim(),
      role:          form.role,
      center_id:     form.center_id ? parseInt(form.center_id) : null,
      department_id: form.department_id ? parseInt(form.department_id) : null,
      ...(isEdit && { active: form.active }),
    };
    if (!isEdit) { body.username = form.username.trim(); body.password = form.password; }
    if (form.password && isEdit) body.password = form.password;

    setSaving(true);
    try {
      const url    = isEdit ? `/api/users/${user.id}` : '/api/users';
      const method = isEdit ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: hdrs(), body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || (d.errors?.[0]?.msg) || 'Save failed'); return; }
      onSaved();
    } catch { setErr('Network error'); }
    finally   { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-teal-600 to-teal-700">
          <h2 className="text-lg font-semibold text-white">{isEdit ? 'Edit User' : 'Create New User'}</h2>
          <button onClick={onClose} className="text-teal-100 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{err}</div>}

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username <span className="text-red-500">*</span></label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.username} onChange={e => set('username', e.target.value)} placeholder="e.g. john.doe" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
              <input type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.email} onChange={e => set('email', e.target.value)} placeholder="user@aris.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role <span className="text-red-500">*</span></label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.role} onChange={e => set('role', e.target.value)}>
                {roles.map(r => <option key={r.role} value={r.role}>{r.role_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Center</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.center_id} onChange={e => set('center_id', e.target.value)}>
                <option value="">— All Centers —</option>
                {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isEdit ? 'New Password (leave blank to keep current)' : 'Password *'}
            </label>
            <input type="password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.password} onChange={e => set('password', e.target.value)}
              placeholder={isEdit ? 'Leave blank to keep unchanged' : 'Min 8 characters'} />
          </div>

          {isEdit && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Status</label>
              <button
                onClick={() => set('active', !form.active)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.active ? 'bg-teal-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.active ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className={`text-sm font-medium ${form.active ? 'text-teal-700' : 'text-gray-500'}`}>{form.active ? 'Active' : 'Inactive'}</span>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Update User' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function UserManagement() {
  const [users,   setUsers]   = useState([]);
  const [centers, setCenters] = useState([]);
  const [roles,   setRoles]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [modal,   setModal]   = useState(null);   // null | 'create' | user-object
  const [toast,   setToast]   = useState('');
  const [filters, setFilters] = useState({ search: '', role: '', center_id: '', active: 'true' });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search)    params.set('search',    filters.search);
      if (filters.role)      params.set('role',       filters.role);
      if (filters.center_id) params.set('center_id',  filters.center_id);
      params.set('active', filters.active);
      const r = await fetch(`/api/users?${params}`, { headers: hdrs() });
      const d = await r.json();
      if (d.success) setUsers(d.users);
      else setError(d.error || 'Failed to load users');
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/centers', { headers: hdrs() })
      .then(r => r.json())
      .then(d => { if (d.centers || d.success) setCenters(d.centers || []); })
      .catch(() => {});

    fetch('/api/rbac/roles?active_only=true', { headers: hdrs() })
      .then(r => r.json())
      .then(d => { if (d.success) setRoles(d.roles); })
      .catch(() => {});
  }, []);

  const unlock = async (u) => {
    if (!window.confirm(`Unlock account for ${u.name}?`)) return;
    const r = await fetch(`/api/users/${u.id}/unlock`, { method: 'POST', headers: hdrs() });
    if (r.ok) { showToast(`${u.name} unlocked`); load(); }
  };

  const onSaved = () => { setModal(null); showToast('User saved successfully'); load(); };

  const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never';

  const isLocked = (u) => u.locked_until && new Date(u.locked_until) > new Date();

  const roleLabel = (roleCode) => roles.find(r => r.role === roleCode)?.role_name || roleCode;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-teal-700 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage system users, roles, and access</p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span> Add User
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search name, email, username…"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <select value={filters.role} onChange={e => setFilters(f => ({ ...f, role: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">All Roles</option>
            {roles.map(r => <option key={r.role} value={r.role}>{r.role_name}</option>)}
          </select>
          <select value={filters.center_id} onChange={e => setFilters(f => ({ ...f, center_id: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">All Centers</option>
            {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filters.active} onChange={e => setFilters(f => ({ ...f, active: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {error && <div className="p-4 text-red-600 text-sm">{error}</div>}
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-700">User</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Role</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Center</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Last Login</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{u.name}</div>
                      <div className="text-xs text-gray-500">{u.username} · {u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.center_name || <span className="text-gray-400 italic">All Centers</span>}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDateTime(u.last_login)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                        {isLocked(u) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 w-fit">
                            Locked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isLocked(u) && (
                          <button onClick={() => unlock(u)}
                            className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100">
                            Unlock
                          </button>
                        )}
                        <button onClick={() => setModal(u)}
                          className="text-xs px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100">
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          {users.length} user{users.length !== 1 ? 's' : ''} shown
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <UserModal
          user={modal === 'create' ? null : modal}
          centers={centers}
          roles={roles}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
