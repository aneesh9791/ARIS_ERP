import { useState, useEffect, useCallback } from 'react';

const token = () => localStorage.getItem('token');
const hdrs  = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

// Cycle through these colors for permission groups (index-based, no hardcoding)
const GROUP_COLORS = [
  { badge: 'bg-purple-100 text-purple-800', header: 'bg-purple-50 border-purple-200' },
  { badge: 'bg-blue-100 text-blue-800',     header: 'bg-blue-50 border-blue-200' },
  { badge: 'bg-indigo-100 text-indigo-800', header: 'bg-indigo-50 border-indigo-200' },
  { badge: 'bg-teal-100 text-teal-800',     header: 'bg-teal-50 border-teal-200' },
  { badge: 'bg-cyan-100 text-cyan-800',     header: 'bg-cyan-50 border-cyan-200' },
  { badge: 'bg-violet-100 text-violet-800', header: 'bg-violet-50 border-violet-200' },
  { badge: 'bg-pink-100 text-pink-800',     header: 'bg-pink-50 border-pink-200' },
  { badge: 'bg-orange-100 text-orange-800', header: 'bg-orange-50 border-orange-200' },
  { badge: 'bg-lime-100 text-lime-800',     header: 'bg-lime-50 border-lime-200' },
  { badge: 'bg-amber-100 text-amber-800',   header: 'bg-amber-50 border-amber-200' },
  { badge: 'bg-sky-100 text-sky-800',       header: 'bg-sky-50 border-sky-200' },
  { badge: 'bg-red-100 text-red-800',       header: 'bg-red-50 border-red-200' },
];

function fmtPerm(p) {
  return p.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
}

function parseJsonArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

// ── Edit Permissions Modal ─────────────────────────────────────────────────────
const EditRoleModal = ({ role, groups, onClose, onSaved }) => {
  const [perms,  setPerms]  = useState(new Set(parseJsonArr(role.permissions)));
  const [form,   setForm]   = useState({ role_name: role.role_name || '', description: role.description || '' });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const toggle = (p) => setPerms(prev => {
    const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n;
  });

  const toggleGroup = (group) => {
    const all = group.perms.every(p => perms.has(p));
    setPerms(prev => {
      const n = new Set(prev);
      group.perms.forEach(p => all ? n.delete(p) : n.add(p));
      return n;
    });
  };

  const save = async () => {
    setErr('');
    if (!form.role_name.trim()) return setErr('Role name is required');
    if (!form.description.trim() || form.description.trim().length < 5) return setErr('Description required (min 5 chars)');
    setSaving(true);
    try {
      const body = {
        role_name:              form.role_name.trim(),
        description:            form.description.trim(),
        permissions:            Array.from(perms),
        dashboard_widgets:      parseJsonArr(role.dashboard_widgets),
        report_access:          parseJsonArr(role.report_access),
        is_corporate_role:      role.is_corporate_role || false,
        can_access_all_centers: role.can_access_all_centers || false,
        allowed_centers:        role.allowed_centers || [],
        notes:                  role.notes || '',
      };
      const r = await fetch(`/api/rbac/roles/${role.id}`, { method: 'PUT', headers: hdrs(), body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || (d.errors?.[0]?.msg) || 'Save failed'); return; }
      onSaved();
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-teal-600 to-teal-700 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Edit Role: {role.role_name}</h2>
            <p className="text-teal-100 text-xs mt-0.5">Code: {role.role}</p>
          </div>
          <button onClick={onClose} className="text-teal-100 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{err}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role Name <span className="text-red-500">*</span></label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.role_name} onChange={e => setForm(f => ({ ...f, role_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>

          <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2">
            <span className="text-teal-700 font-semibold text-sm">{perms.size} permissions selected</span>
            <span className="text-gray-400 text-xs">·</span>
            <button onClick={() => setPerms(new Set())} className="text-xs text-red-600 hover:underline">Clear all</button>
          </div>

          {groups.map((group, i) => {
            const cc = GROUP_COLORS[i % GROUP_COLORS.length];
            const groupSelected = group.perms.filter(p => perms.has(p)).length;
            const allSelected = groupSelected === group.perms.length;
            return (
              <div key={group.label} className={`border rounded-lg overflow-hidden ${cc.header}`}>
                <div className={`px-4 py-2.5 border-b flex items-center gap-2 ${cc.header}`}>
                  <input type="checkbox" checked={allSelected} onChange={() => toggleGroup(group)}
                    className="w-4 h-4 rounded cursor-pointer" />
                  <span className="font-medium text-sm text-gray-800">{group.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cc.badge}`}>
                    {groupSelected}/{group.perms.length}
                  </span>
                </div>
                <div className="p-3 bg-white grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {group.perms.map(p => (
                    <label key={p} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-2 py-1">
                      <input type="checkbox" checked={perms.has(p)} onChange={() => toggle(p)} className="w-4 h-4 rounded" />
                      <span className="text-gray-700">{fmtPerm(p)}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Role Card ──────────────────────────────────────────────────────────────────
const RoleCard = ({ role, groups, onEdit }) => {
  const [expanded, setExpanded] = useState(false);
  const perms = parseJsonArr(role.permissions);

  // Group the role's assigned perms using the same groups from API
  const permsByGroup = groups
    .map(g => ({ label: g.label, active: g.perms.filter(p => perms.includes(p)) }))
    .filter(g => g.active.length > 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{role.role_name}</h3>
            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{role.role}</span>
            {role.is_corporate_role && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Corporate</span>
            )}
          </div>
          {role.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{role.description}</p>}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="font-medium text-teal-700">{perms.length} permissions</span>
            <span>{parseInt(role.user_count) || 0} active users</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setExpanded(e => !e)}
            className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            {expanded ? 'Hide' : 'View'} Permissions
          </button>
          <button onClick={() => onEdit(role)}
            className="text-xs px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100">
            Edit
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
          {permsByGroup.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No permissions assigned</p>
          ) : (
            permsByGroup.map(g => (
              <div key={g.label}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.active.map(p => (
                    <span key={p} className="text-xs bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                      {fmtPerm(p)}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function RoleManagement() {
  const [roles,   setRoles]   = useState([]);
  const [groups,  setGroups]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [editing, setEditing] = useState(null);
  const [toast,   setToast]   = useState('');
  const [search,  setSearch]  = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch('/api/rbac/roles?active_only=true', { headers: hdrs() }),
        fetch('/api/rbac/permissions',            { headers: hdrs() }),
      ]);
      const [rolesData, permsData] = await Promise.all([rolesRes.json(), permsRes.json()]);
      if (rolesData.success) setRoles(rolesData.roles);
      else setError(rolesData.error || 'Failed to load roles');
      if (permsData.success) setGroups(permsData.groups || []);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSaved = () => { setEditing(null); showToast('Role updated successfully'); load(); };

  const filtered = roles.filter(r =>
    !search ||
    r.role.toLowerCase().includes(search.toLowerCase()) ||
    r.role_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPerms = roles.reduce((sum, r) => sum + (parseJsonArr(r.permissions).length), 0);
  const totalUsers = roles.reduce((sum, r) => sum + (parseInt(r.user_count) || 0), 0);

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-teal-700 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Roles &amp; Permissions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure what each role can do in the system</p>
        </div>
      </div>

      {!loading && roles.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Roles',       value: roles.length },
            { label: 'Active Users',      value: totalUsers   },
            { label: 'Total Permissions', value: totalPerms   },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <input type="text" placeholder="Search roles…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading roles…</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <RoleCard key={r.id || r.role} role={r} groups={groups} onEdit={setEditing} />
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
              No roles found
            </div>
          )}
        </div>
      )}

      {editing && (
        <EditRoleModal role={editing} groups={groups} onClose={() => setEditing(null)} onSaved={onSaved} />
      )}
    </div>
  );
}
