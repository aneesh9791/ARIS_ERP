import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ d, d2, className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    {d2 && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d2} />}
  </svg>
);

const icons = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  patients: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2h-1m-6 0H5a2 2 0 00-2 2v12a2 2 0 002 2h4m-6 0h6m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  centers: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  customers: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  billing: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z',
  invoices: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  equipment: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
  reports: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-2.572 1.065c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-1.065 2.572c-1.756.426-1.756 2.924 0-3.35a1.724 1.724 0 001.066 2.573c1.756-.426 1.756-2.924 0-3.35a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-.426-1.756-2.924-1.756-3.35 0a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  settings2: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  menu: 'M4 6h16M4 12h16M4 18h16',
  chevronLeft: 'M15 19l-7-7 7-7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M19 9l-7 7-7-7',
  chevronUp: 'M5 15l7-7 7 7',
  bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  close: 'M6 18L18 6M6 6l12 12',
  history: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  procurement: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  stock: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  finance: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  equity:      'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z',
  equitySlice: 'M20.488 9H15V3.512A9.004 9.004 0 0120.488 9z',
  mwl:         'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  vendors: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  expenses: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  itemMaster: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  studyReporting: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  physician: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  hr: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
};

// ─── Navigation structure ──────────────────────────────────────────────────────
// permission: which permission is required to see this item (null = visible to all logged-in users)
const NAV_GROUPS = [
  {
    key: 'main',
    section: 'Main',
    items: [
      { to: '/dashboard', label: 'Dashboard', iconKey: 'dashboard', permission: 'DASHBOARD_VIEW' },
    ],
  },
  {
    key: 'clinical',
    section: 'Clinical',
    items: [
      { to: '/patients',              label: 'Patient Reg & Billing', iconKey: 'users',         permission: 'PATIENT_VIEW' },
      { to: '/patient-history',       label: 'Patient History',       iconKey: 'history',       permission: 'PATIENT_VIEW' },
      { to: '/study-reporting',       label: 'Worklist',              iconKey: 'studyReporting',permission: 'STUDY_VIEW' },
      { to: '/referring-physicians',  label: 'Ref. Physicians',       iconKey: 'physician',     permission: 'PHYSICIAN_VIEW' },
    ],
  },
  {
    key: 'finance',
    section: 'Finance',
    items: [
      { to: '/finance',    label: 'Finance',         iconKey: 'finance',  permission: 'JE_VIEW' },
      { to: '/equity',     label: 'Equity & Capital', iconKey: 'equity', iconKey2: 'equitySlice', permission: 'EQUITY_VIEW' },
      { to: '/petty-cash', label: 'Petty Cash',       iconKey: 'expenses', permission: 'PETTY_CASH_VIEW' },
    ],
  },
  {
    key: 'hr',
    section: 'HRMS',
    items: [
      { to: '/hr', label: 'HR & Payroll', iconKey: 'hr', permission: ['HR_DASHBOARD_VIEW','EMPLOYEE_VIEW','ATTENDANCE_VIEW','ATTENDANCE_MARK','LEAVE_APPLY','LEAVE_APPROVE','PAYROLL_VIEW'] },
    ],
  },
  {
    key: 'operations',
    section: 'Operations',
    items: [
      { to: '/assets',            label: 'Asset Management', iconKey: 'equipment',  permission: 'ASSET_VIEW' },
      { to: '/asset-maintenance', label: 'Asset Maintenance',iconKey: 'equipment',  permission: 'ASSET_MAINTENANCE_VIEW' },
      { to: '/procurement',       label: 'Procurement',      iconKey: 'procurement',permission: ['PR_VIEW','PO_VIEW','GRN_VIEW'] },
      { to: '/stock',             label: 'Stock Management', iconKey: 'stock',      permission: 'INVENTORY_VIEW' },
      { to: '/item-master',       label: 'Item Master',      iconKey: 'itemMaster', permission: 'INVENTORY_VIEW' },
    ],
  },
  {
    key: 'system',
    section: 'System',
    items: [
      { to: '/master-data',    label: 'Master Data',         iconKey: 'settings',                          permission: ['MASTER_DATA_VIEW','STUDY_CATALOG_VIEW','STUDY_PRICING_VIEW','RAD_REPORTING_MASTER_VIEW'] },
      { to: '/settings/users', label: 'User Management',     iconKey: 'users',                             permission: ['USER_VIEW','USER_WRITE'] },
      { to: '/settings/roles', label: 'Roles & Permissions', iconKey: 'settings', iconKey2: 'settings2',  permission: ['USER_VIEW','USER_WRITE'] },
      { to: '/settings/mwl',   label: 'MWL Gateway',         iconKey: 'mwl',                               permission: 'MWL_VIEW' },
      { to: '/settings',       label: 'Settings',            iconKey: 'settings', iconKey2: 'settings2',  permission: 'MASTER_DATA_VIEW' },
      { to: '/reports',        label: 'Reports',             iconKey: 'reports',                           permission: 'REPORTS_VIEW' },
    ],
  },
];

// Page title map for header
const PAGE_TITLES = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/patients': 'Patients',
  '/patient-history': 'Patient History',
  '/master-data': 'Master Data Settings',
  '/centers': 'Centers',
  '/customers': 'Customers',
  '/billing': 'Billing',
  '/invoices': 'Invoices',
  '/scanners': 'Equipment',
  '/hr': 'Human Resources',
  '/payroll': 'Payroll',
  '/assets':            'Asset Management',
  '/asset-maintenance': 'Asset Maintenance',
  '/procurement':       'Procurement',
  '/petty-cash':        'Petty Cash Vouchers',
  '/stock':             'Stock Management',
  '/item-master':       'Item Master',
  '/study-reporting':   'Worklist',
  '/finance':           'Finance',
  '/equity':            'Equity & Capital',
  '/vendors':           'Vendors',
  '/expenses':          'Expenses',
  '/pid-management':    'PID Management',
  '/study-management':  'Study Management',
  '/reports': 'Reports',
  '/settings':         'Settings',
  '/settings/users':   'User Management',
  '/settings/roles':   'Roles & Permissions',
  '/settings/mwl':     'DICOM MWL Gateway',
};

// ─── Change Password Modal ────────────────────────────────────────────────────
const ChangePasswordModal = ({ onClose }) => {
  const [form, setForm]     = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [err, setErr]       = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const submit = async ev => {
    ev.preventDefault();
    if (!form.currentPassword)                        { setErr('Current password is required'); return; }
    if (form.newPassword.length < 8)                  { setErr('New password must be at least 8 characters'); return; }
    if (form.newPassword !== form.confirmPassword)    { setErr('New passwords do not match'); return; }
    setSaving(true); setErr('');
    try {
      const token = localStorage.getItem('token');
      const r = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed to change password'); setSaving(false); return; }
      setSuccess('Password changed successfully!');
      setTimeout(onClose, 1500);
    } catch { setErr('Network error'); setSaving(false); }
  };

  const fi = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-slate-800">Change Password</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          {err     && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>}
          {success && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{success}</p>}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Current Password</label>
            <input type="password" value={form.currentPassword} onChange={set('currentPassword')} className={fi} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New Password <span className="text-slate-400">(min 8 characters)</span></label>
            <input type="password" value={form.newPassword} onChange={set('newPassword')} className={fi} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Confirm New Password</label>
            <input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} className={fi} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Header logo (top-right corner) ──────────────────────────────────────────
const HeaderLogo = () => {
  const [logoConfig, setLogoConfig] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('logoConfig')) || {}; } catch { return {}; }
  });
  React.useEffect(() => {
    const load = () => {
      try { setLogoConfig(JSON.parse(localStorage.getItem('logoConfig')) || {}); } catch {}
    };
    window.addEventListener('logoConfigUpdated', load);
    window.addEventListener('storage', e => { if (e.key === 'logoConfig') load(); });
    return () => {
      window.removeEventListener('logoConfigUpdated', load);
      window.removeEventListener('storage', load);
    };
  }, []);

  if (!logoConfig.customLogo) return null;
  return (
    <img
      src={logoConfig.customLogo}
      alt="ARIS Logo"
      style={{ height: '50px', width: 'auto', display: 'block' }}
    />
  );
};

// ─── Sidebar brand text ───────────────────────────────────────────────────────
const SidebarLogo = ({ collapsed }) => (
  <div className="flex-shrink-0 flex items-center justify-center h-14 border-b border-teal-800">
    {collapsed ? (
      <span style={{ fontFamily: "'Cinzel', serif", color: '#fbbf24', fontWeight: 700, fontSize: '1rem', WebkitTextStroke: '0.3px #fbbf24' }}>A</span>
    ) : (
      <span style={{ fontFamily: "'Cinzel', serif", color: '#fbbf24', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.12em', WebkitTextStroke: '0.3px #fbbf24' }}>
        ARIS ERP
      </span>
    )}
  </div>
);

// ─── Main Layout ──────────────────────────────────────────────────────────────
const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Desktop sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('aris_sidebar_collapsed') === 'true'; } catch { return false; }
  });

  // Mobile sidebar open state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Profile popover & change password
  const [showProfile, setShowProfile]             = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Nav group collapse states
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('aris_nav_groups');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // User info — loaded from localStorage (permissions are fetched from DB at login time)
  const [user] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; }
  });

  // Permission check — ALL_ACCESS bypasses everything (SUPER_ADMIN)
  // perm can be a string or array of strings (any match = allowed)
  const hasPermission = (perm) => {
    if (!perm) return true;
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    if (perms.includes('ALL_ACCESS')) return true;
    const required = Array.isArray(perm) ? perm : [perm];
    return required.some(p => perms.includes(p));
  };

  // Filtered nav groups — hide items the user has no permission for,
  // and hide entire sections if all their items are hidden
  const visibleNavGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => hasPermission(item.permission)),
  })).filter(group => group.items.length > 0);

  // Persist sidebar collapse
  useEffect(() => {
    try { localStorage.setItem('aris_sidebar_collapsed', sidebarCollapsed); } catch {}
  }, [sidebarCollapsed]);

  // Persist group collapse states
  useEffect(() => {
    try { localStorage.setItem('aris_nav_groups', JSON.stringify(collapsedGroups)); } catch {}
  }, [collapsedGroups]);

  // Close mobile sidebar and profile popover on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
    setShowProfile(false);
  }, [location.pathname]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }, [navigate]);

  const isActive = useCallback((to) => {
    if (to === '/dashboard') return location.pathname === '/' || location.pathname === '/dashboard';
    return location.pathname === to;
  }, [location.pathname]);

  const toggleGroup = useCallback((key) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const pageTitle = PAGE_TITLES[location.pathname] || 'ARIS ERP';

  // Get user initials
  const getInitials = (u) => {
    const name = u.name || u.username || u.email || 'A';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  // ── Sidebar content (shared between desktop + mobile) ──
  const SidebarContent = ({ isMobile = false }) => (
    <div className="flex flex-col h-full bg-teal-900">
      {/* Logo / Brand */}
      <SidebarLogo collapsed={!isMobile && sidebarCollapsed} />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 sidebar-scroll" style={{ scrollbarWidth: 'thin' }}>
        {visibleNavGroups.map((group) => {
          const groupCollapsed = collapsedGroups[group.key];
          const showLabel = isMobile || !sidebarCollapsed;

          return (
            <div key={group.key} className="mb-1">
              {/* Section header */}
              {showLabel && (
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold text-teal-400 uppercase tracking-wider hover:text-teal-300 transition-colors"
                >
                  <span>{group.section}</span>
                  <Icon
                    d={groupCollapsed ? icons.chevronRight : icons.chevronDown}
                    className="w-3 h-3 transition-transform duration-200"
                  />
                </button>
              )}

              {/* Nav items */}
              <div className={`overflow-hidden transition-all duration-200 ${groupCollapsed && showLabel ? 'max-h-0' : 'max-h-screen'}`}>
                {group.items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={!showLabel ? item.label : undefined}
                      className={`
                        flex items-center mx-2 mb-0.5 rounded-lg text-sm font-medium
                        transition-all duration-150 group
                        ${showLabel ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'}
                        ${active
                          ? 'bg-teal-700 text-white shadow-sm'
                          : 'text-teal-100 hover:bg-teal-800 hover:text-white'
                        }
                      `}
                    >
                      <span className={`flex-shrink-0 ${active ? 'text-teal-200' : 'text-teal-400 group-hover:text-teal-200'}`}>
                        {item.iconKey2 ? (
                          <Icon d={icons[item.iconKey]} d2={icons[item.iconKey2]} />
                        ) : (
                          <Icon d={icons[item.iconKey]} />
                        )}
                      </span>
                      {showLabel && (
                        <span className="ml-3 truncate">{item.label}</span>
                      )}
                      {active && showLabel && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-300 flex-shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Divider after each group when collapsed (mini mode) */}
              {!showLabel && (
                <div className="mx-3 my-1.5 border-t border-teal-800" />
              )}
            </div>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className={`flex-shrink-0 border-t border-teal-800 p-3 ${!isMobile && sidebarCollapsed ? 'flex flex-col items-center gap-2' : ''}`}>
        {(!isMobile && sidebarCollapsed) ? (
          // Mini mode — logout button
          <button onClick={handleLogout} title="Log Out"
            className="p-1.5 text-red-400 hover:text-white hover:bg-red-600 rounded-lg transition-colors">
            <Icon d={icons.logout} className="w-5 h-5" />
          </button>
        ) : (
          // Full mode — name, role, logout
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {getInitials(user)}
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name || user.username || user.email || 'Admin'}</p>
              <p className="text-xs text-teal-400 truncate capitalize">{user.role || 'Administrator'}</p>
            </div>
            <button onClick={handleLogout} title="Log Out"
              className="ml-2 p-1.5 text-red-400 hover:text-white hover:bg-red-600 rounded-lg transition-colors flex-shrink-0">
              <Icon d={icons.logout} className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="flex h-screen bg-slate-50 overflow-hidden">

        {/* ── Desktop Sidebar ─────────────────────────────────────────────────── */}
        <div
          className={`hidden md:flex flex-shrink-0 flex-col transition-all duration-300 ease-in-out ${
            sidebarCollapsed ? 'w-16' : 'w-60'
          }`}
        >
          <SidebarContent />
        </div>

        {/* ── Mobile Sidebar Overlay ──────────────────────────────────────────── */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-60 transition-opacity"
              onClick={() => setMobileSidebarOpen(false)}
              aria-hidden="true"
            />
            {/* Drawer */}
            <div className="relative flex flex-col w-64 h-full shadow-2xl transform transition-transform duration-300">
              {/* Close button */}
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="absolute top-3 right-3 z-10 p-1.5 text-teal-400 hover:text-white hover:bg-teal-700 rounded-lg transition-colors"
              >
                <Icon d={icons.close} className="w-5 h-5" />
              </button>
              <SidebarContent isMobile />
            </div>
          </div>
        )}

        {/* ── Main content area ───────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Top Header Bar */}
          <header className="flex-shrink-0 flex items-center h-16 bg-white border-b border-slate-200 px-4 shadow-sm">
            {/* Left: hamburger (mobile) + collapse toggle (desktop) + breadcrumb */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                aria-label="Open sidebar"
              >
                <Icon d={icons.menu} className="w-5 h-5" />
              </button>

              {/* Desktop collapse toggle */}
              <button
                onClick={() => setSidebarCollapsed(c => !c)}
                className="hidden md:flex p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <Icon d={sidebarCollapsed ? icons.chevronRight : icons.chevronLeft} className="w-5 h-5" />
              </button>

              {/* Page title */}
              <span className="text-sm font-semibold text-slate-800 truncate">{pageTitle}</span>
            </div>

            {/* Right: gear/profile dropdown + logo */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative">
                <button
                  onClick={() => setShowProfile(p => !p)}
                  title="Profile & Settings"
                  className={`p-2 rounded-lg transition-colors ${showProfile ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:text-teal-700 hover:bg-teal-50'}`}
                >
                  <Icon d={icons.settings} d2={icons.settings2} className="w-5 h-5" />
                </button>
                {showProfile && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                    <div className="px-4 py-3 bg-gradient-to-r from-teal-600 to-teal-500">
                      <p className="text-sm font-semibold text-white truncate">{user.name || user.username || user.email || 'Admin'}</p>
                      <p className="text-xs text-teal-100 capitalize">{user.role || 'Administrator'}</p>
                    </div>
                    <div className="p-1">
                      <button
                        onClick={() => { setShowProfile(false); setShowChangePassword(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        Change Password
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <HeaderLogo />
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-slate-50">
            <Outlet />
          </main>
        </div>

      </div>

      {/* Close profile popover on outside click — rendered outside overflow-hidden container */}
      {showProfile && (
        <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
      )}

      {/* Change Password Modal — rendered outside overflow-hidden container */}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
};

export default Layout;
