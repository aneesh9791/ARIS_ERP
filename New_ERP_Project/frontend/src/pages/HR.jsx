import { useState, useEffect, useCallback } from 'react';
import { today } from '../utils/serverDate';
import { getPermissions } from '../utils/permissions';

// ── Helpers ────────────────────────────────────────────────────
const token = () => localStorage.getItem('token');
const api = (path, opts = {}) => fetch(path, {
  ...opts,
  headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...opts.headers },
});
const fmt  = n => `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Parse YYYY-MM-DD directly to avoid timezone off-by-one
const fmtD = d => {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  if (!y || !m || !day) return '—';
  return `${parseInt(day)} ${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y}`;
};

const INDIAN_BANKS = [
  // Public Sector
  'State Bank of India','Bank of Baroda','Bank of India','Bank of Maharashtra',
  'Canara Bank','Central Bank of India','Indian Bank','Indian Overseas Bank',
  'Punjab & Sind Bank','Punjab National Bank','UCO Bank','Union Bank of India',
  // Private Sector
  'Axis Bank','Bandhan Bank','City Union Bank','CSB Bank','DCB Bank',
  'Dhanlaxmi Bank','Federal Bank','HDFC Bank','ICICI Bank','IDBI Bank',
  'IDFC First Bank','IndusInd Bank','Jammu & Kashmir Bank','Karnataka Bank',
  'Karur Vysya Bank','Kotak Mahindra Bank','Nainital Bank','RBL Bank',
  'South Indian Bank','Tamilnad Mercantile Bank','Yes Bank',
  // Small Finance Banks
  'AU Small Finance Bank','Capital Small Finance Bank','Equitas Small Finance Bank',
  'ESAF Small Finance Bank','Fincare Small Finance Bank','Jana Small Finance Bank',
  'North East Small Finance Bank','Suryoday Small Finance Bank',
  'Ujjivan Small Finance Bank','Utkarsh Small Finance Bank',
  // Payments Banks
  'Airtel Payments Bank','India Post Payments Bank','Fino Payments Bank',
  'Jio Payments Bank','NSDL Payments Bank','Paytm Payments Bank',
  // Co-operative Banks
  'Saraswat Bank','Abhyudaya Bank','Cosmos Bank','ShamraoVithal Bank',
  'TJSB Sahakari Bank','Vasai Vikas Sahakari Bank',
  // Foreign Banks
  'Citibank','Deutsche Bank','DBS Bank','HSBC Bank','Standard Chartered Bank',
];

const DEPT_COLORS = {
  Radiology:  '#0d9488',
  Nursing:    '#7c3aed',
  Admin:      '#0369a1',
  IT:         '#b45309',
  Finance:    '#15803d',
  HR:         '#be123c',
  Operations: '#c2410c',
  Management: '#1e40af',
};

const STATUS_CFG = {
  PRESENT:  { bg: '#dcfce7', color: '#166534', label: 'Present' },
  ABSENT:   { bg: '#fee2e2', color: '#991b1b', label: 'Absent' },
  LEAVE:    { bg: '#fef3c7', color: '#92400e', label: 'Leave' },
  HALF_DAY: { bg: '#ffedd5', color: '#9a3412', label: 'Half Day' },
  WEEKEND:  { bg: '#ede9fe', color: '#5b21b6', label: 'Weekend' },
  DRAFT:    { bg: '#f1f5f9', color: '#475569', label: 'Draft' },
  APPROVED: { bg: '#dbeafe', color: '#1e40af', label: 'Approved' },
  PAID:     { bg: '#ede9fe', color: '#5b21b6', label: 'Paid' },
};

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white appearance-none text-slate-700';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide';

const Badge = ({ status, customLabel }) => {
  const cfg = STATUS_CFG[status] || { bg: '#f1f5f9', color: '#475569', label: status };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}>
      {customLabel || cfg.label}
    </span>
  );
};

const Spin = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
  </div>
);

const Toast = ({ msg, type }) => {
  if (!msg) return null;
  const styles = {
    success: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    error:   { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    info:    { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  };
  const s = styles[type] || styles.info;
  return (
    <div className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:top-4 z-[200] px-4 sm:px-5 py-3 rounded-xl shadow-lg text-sm font-semibold border sm:min-w-[260px]"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}>
      {msg}
    </div>
  );
};

const KpiCard = ({ label, value, sub, color = '#0d9488', icon }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-start gap-4">
    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: color + '18' }}>
      <svg className="w-5 h-5" fill="none" stroke={color} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
    </div>
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold mt-0.5" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Modal wrapper ──────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 overflow-y-auto py-4 sm:py-8 px-2 sm:px-4">
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} relative`}>
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-sm sm:text-base">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none w-8 h-8 flex items-center justify-center">×</button>
      </div>
      <div className="px-4 sm:px-6 py-4 sm:py-5">{children}</div>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════
// TAB 1 — DASHBOARD
// ════════════════════════════════════════════════════════════════
function DashboardTab({ onTabSwitch, canMark = false }) {
  const [employees, setEmployees] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, attRes] = await Promise.all([
        api('/api/payroll/employees?active_only=true'),
        api(`/api/payroll/attendance?start_date=${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01&end_date=${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31&limit=500`),
      ]);
      const empData = empRes.ok ? await empRes.json() : { employees: [] };
      const attData = attRes.ok ? await attRes.json() : { attendance: [] };
      setEmployees(empData.employees || []);
      const todayStr = today();
      setTodayAttendance((attData.attendance || []).filter(a => a.attendance_date?.slice(0, 10) === todayStr));
    } catch (_) { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spin />;

  const activeEmps = employees.filter(e => e.active !== false);
  const presentToday = todayAttendance.filter(a => a.status === 'PRESENT').length;
  const onLeaveToday = todayAttendance.filter(a => a.status === 'LEAVE' || a.status === 'HALF_DAY').length;

  // Department breakdown
  const deptMap = {};
  activeEmps.forEach(e => { deptMap[e.department] = (deptMap[e.department] || 0) + 1; });
  const deptEntries = Object.entries(deptMap).sort((a, b) => b[1] - a[1]);
  const maxDept = deptEntries[0]?.[1] || 1;

  // Recent joins — last 5 by date_of_joining
  const recentJoins = [...activeEmps]
    .filter(e => e.date_of_joining)
    .sort((a, b) => new Date(b.date_of_joining) - new Date(a.date_of_joining))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Total Employees" value={employees.length}
          color="#0d9488" icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        <KpiCard label="Active Employees" value={activeEmps.length}
          color="#15803d" sub="Currently employed"
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard label="Present Today" value={presentToday}
          color="#0369a1" sub={`of ${activeEmps.length} employees`}
          icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        <KpiCard label="On Leave Today" value={onLeaveToday}
          color="#b45309" sub="Leave / Half Day"
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Department Breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-bold text-slate-700 mb-4 text-sm uppercase tracking-wide">Department Breakdown</h3>
          {deptEntries.length === 0 ? (
            <p className="text-slate-400 text-sm">No data available</p>
          ) : (
            <div className="space-y-3">
              {deptEntries.map(([dept, count]) => (
                <div key={dept}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{dept}</span>
                    <span className="text-xs font-bold" style={{ color: DEPT_COLORS[dept] || '#0d9488' }}>{count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(count / maxDept) * 100}%`,
                        background: DEPT_COLORS[dept] || '#0d9488',
                      }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Joins */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-bold text-slate-700 mb-4 text-sm uppercase tracking-wide">Recent Joins</h3>
          {recentJoins.length === 0 ? (
            <p className="text-slate-400 text-sm">No recent joins</p>
          ) : (
            <div className="space-y-3">
              {recentJoins.map(emp => (
                <div key={emp.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: DEPT_COLORS[emp.department] || '#0d9488' }}>
                    {(emp.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{emp.name}</p>
                    <p className="text-xs text-slate-400">{emp.department} · {emp.position}</p>
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">{fmtD(emp.date_of_joining)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h3 className="font-bold text-slate-700 mb-4 text-sm uppercase tracking-wide">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => onTabSwitch('employees', 'add')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
            style={{ background: '#0d9488' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Employee
          </button>
          {canMark && (
            <button onClick={() => onTabSwitch('attendance', 'mark')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
              style={{ background: '#0369a1' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Mark Attendance
            </button>
          )}
          <button onClick={() => onTabSwitch('payroll', null)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
            style={{ background: '#7c3aed' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Run Payroll
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Employee form sub-components — defined at module level so they never
//    get recreated on re-render (prevents focus/cursor loss on input)
const EmpSection = ({ title, children }) => (
  <div className="mb-6">
    <div className="flex items-center gap-2 mb-3">
      <h4 className="text-xs font-bold text-teal-700 uppercase tracking-widest">{title}</h4>
      <div className="flex-1 h-px bg-teal-50" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">{children}</div>
  </div>
);

const SPAN_CLS = { 1: '', 2: 'sm:col-span-2', 3: 'sm:col-span-2 lg:col-span-3' };
// span: 1 (default) | 2 | 3 (full row)
const EmpFLD = ({ label, fkey, type = 'text', span = 1, maxLength, form, onChange }) => (
  <div className={SPAN_CLS[span] || ''}>
    <label className={labelCls}>{label}</label>
    <input type={type} value={form[fkey] || ''} maxLength={maxLength}
      onChange={e => onChange(fkey, e.target.value)} className={inputCls} />
  </div>
);

// 3-dropdown date picker — avoids native browser date input inconsistencies
// Value is always YYYY-MM-DD string or ''
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const parseDateVal = v => {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-');
    return { y: parseInt(y), m: parseInt(m), d: parseInt(d) };
  }
  return { y: '', m: '', d: '' };
};
const DateInput = ({ label, value, onChange, minYear, maxYear, span = 1 }) => {
  const now = new Date();
  const init = parseDateVal(value);
  const [iY, setIY] = useState(init.y);
  const [iM, setIM] = useState(init.m);
  const [iD, setID] = useState(init.d);

  // Sync when external value changes (e.g. edit employee loads saved date)
  useEffect(() => {
    const p = parseDateVal(value);
    setIY(p.y); setIM(p.m); setID(p.d);
  }, [value]);

  const minY = minYear || 1950;
  const maxY = maxYear || now.getFullYear();
  const years = Array.from({ length: maxY - minY + 1 }, (_, i) => maxY - i);
  const daysInMonth = (iY && iM) ? new Date(iY, iM, 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const notify = (y, m, d) => {
    if (y && m && d) onChange(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  };
  const onY = v => { const y = +v; setIY(y); notify(y, iM, iD); };
  const onM = v => {
    const m = +v;
    setIM(m);
    // Clamp day if it exceeds new month's max
    const max = new Date(iY || now.getFullYear(), m, 0).getDate();
    const nd = iD > max ? '' : iD;
    setID(nd);
    notify(iY, m, nd);
  };
  const onD = v => { const d = +v; setID(d); notify(iY, iM, d); };

  const sel = 'border border-slate-200 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white text-slate-700 appearance-none';
  return (
    <div className={SPAN_CLS[span] || ''}>
      <label className={labelCls}>{label}</label>
      <div className="flex gap-1.5">
        <select value={iD} onChange={e => onD(e.target.value)} className={sel + ' w-20'}>
          <option value="">DD</option>
          {days.map(n => <option key={n} value={n}>{String(n).padStart(2,'0')}</option>)}
        </select>
        <select value={iM} onChange={e => onM(e.target.value)} className={sel + ' flex-1'}>
          <option value="">Month</option>
          {MONTHS_FULL.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
        </select>
        <select value={iY} onChange={e => onY(e.target.value)} className={sel + ' w-24'}>
          <option value="">YYYY</option>
          {years.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// EMPLOYEE FORM MODAL
// ════════════════════════════════════════════════════════════════
const EMPTY_EMP = {
  employee_code: '',
  name: '', email: '', phone: '', date_of_birth: '', address: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  department: '', department_id: '', designation_id: '', position: '',
  employment_type: 'FULL_TIME', center_id: '', date_of_joining: '',
  basic_salary: '', pan_number: '', aadhaar_number: '',
  bank_name: '', bank_account_number: '', ifsc_code: '', notes: '',
  weekly_offs: 1,
};

function EmployeeModal({ emp, centers, onClose, onSaved }) {
  const [form, setForm] = useState(emp ? { ...EMPTY_EMP, ...emp } : { ...EMPTY_EMP });
  const [depts, setDepts] = useState([]);
  const [desigs, setDesigs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = !!emp?.id;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    api('/api/payroll/departments').then(r => r.ok ? r.json() : { departments: [] }).then(d => setDepts(d.departments || []));
    api('/api/payroll/designations').then(r => r.ok ? r.json() : { designations: [] }).then(d => setDesigs(d.designations || []));
  }, []);

  const onDeptChange = (deptId) => {
    const dept = depts.find(d => d.id == deptId);
    setForm(f => ({ ...f, department_id: deptId, department: dept?.name || '' }));
  };

  const onDesigChange = (desigId) => {
    const desig = desigs.find(d => d.id == desigId);
    setForm(f => ({ ...f, designation_id: desigId, position: desig?.name || '' }));
  };

  const validate = () => {
    const req = ['employee_code', 'name', 'email', 'phone', 'center_id', 'date_of_joining', 'basic_salary', 'pan_number', 'aadhaar_number', 'bank_name', 'bank_account_number', 'ifsc_code'];
    for (const k of req) {
      if (!form[k]?.toString().trim()) return `Field "${k.replace(/_/g, ' ')}" is required.`;
    }
    if (!form.department_id && !form.department) return 'Department is required.';
    return '';
  };

  const save = async () => {
    const e = validate();
    if (e) { setErr(e); return; }
    setSaving(true);
    setErr('');
    try {
      const body = {
        ...form,
        basic_salary: parseFloat(form.basic_salary),
        department_id: form.department_id ? parseInt(form.department_id, 10) : null,
        designation_id: form.designation_id ? parseInt(form.designation_id, 10) : null,
        position: form.position || '—',
      };
      const res = isEdit
        ? await api(`/api/payroll/employees/${emp.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/payroll/employees', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message || d.error || d.errors?.[0]?.msg || 'Save failed');
      } else {
        onSaved(isEdit ? 'updated' : 'created');
      }
    } catch (_) { setErr('Network error'); }
    setSaving(false);
  };

  return (
    <Modal title={isEdit ? 'Edit Employee' : 'Add Employee'} onClose={onClose} wide>
      {err && <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
      <div className="max-h-[70vh] overflow-y-auto pr-2">

        {/* ── Personal Information ── */}
        <EmpSection title="Personal Information">
          <EmpFLD label="Full Name *" fkey="name" span={2} form={form} onChange={set} />
          <EmpFLD label="Phone *" fkey="phone" type="tel" maxLength={10} form={form} onChange={set} />
          <EmpFLD label="Email *" fkey="email" type="email" span={2} form={form} onChange={set} />
          <DateInput label="Date of Birth" value={form.date_of_birth || ''} onChange={v => set('date_of_birth', v)} minYear={1950} maxYear={new Date().getFullYear() - 18} />
          <EmpFLD label="Emergency Contact Name" form={form} fkey="emergency_contact_name" onChange={set} />
          <EmpFLD label="Emergency Contact Phone" fkey="emergency_contact_phone" type="tel" maxLength={10} form={form} onChange={set} />
          <EmpFLD label="Address" fkey="address" span={3} form={form} onChange={set} />
        </EmpSection>

        {/* ── Job Details ── */}
        <EmpSection title="Job Details">
          <EmpFLD label="Employee Code *" fkey="employee_code" form={form} onChange={set} />
          <div>
            <label className={labelCls}>Department *</label>
            <select value={form.department_id || ''} onChange={e => onDeptChange(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Designation</label>
            <select value={form.designation_id || ''} onChange={e => onDesigChange(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {desigs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Center *</label>
            <select value={form.center_id} onChange={e => set('center_id', e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Employment Type *</label>
            <select value={form.employment_type || 'FULL_TIME'} onChange={e => set('employment_type', e.target.value)} className={inputCls}>
              <option value="FULL_TIME">Full Time</option>
              <option value="PART_TIME">Part Time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERN">Intern</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Weekly Off Days</label>
            <input type="number" min={0} max={6} step={1}
              value={form.weekly_offs ?? 1}
              onChange={e => set('weekly_offs', +e.target.value)}
              className={inputCls} placeholder="0–6" />
          </div>
          <DateInput label="Date of Joining *" value={form.date_of_joining || ''} onChange={v => set('date_of_joining', v)} minYear={2000} maxYear={new Date().getFullYear() + 1} span={2} />
          <EmpFLD label="Basic Salary (₹) *" fkey="basic_salary" type="number" form={form} onChange={set} />
        </EmpSection>

        {/* ── Identity Documents ── */}
        <EmpSection title="Identity Documents">
          <EmpFLD label="PAN Number *" fkey="pan_number" maxLength={10} form={form} onChange={set} />
          <EmpFLD label="Aadhaar Number *" fkey="aadhaar_number" maxLength={12} form={form} onChange={set} />
        </EmpSection>

        {/* ── Bank Details ── */}
        <EmpSection title="Bank Details">
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>Bank Name *</label>
            <select value={form.bank_name || ''} onChange={e => set('bank_name', e.target.value)} className={inputCls}>
              <option value="">— Select Bank —</option>
              {INDIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <EmpFLD label="Account Number *" fkey="bank_account_number" span={2} form={form} onChange={set} />
          <EmpFLD label="IFSC Code *" fkey="ifsc_code" form={form} onChange={set} />
        </EmpSection>

        {/* ── Notes ── */}
        <div>
          <label className={labelCls}>Notes</label>
          <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2}
            className={inputCls + ' resize-none'} />
        </div>

      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm font-semibold">Cancel</button>
        <button onClick={save} disabled={saving}
          className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity hover:opacity-90"
          style={{ background: '#0d9488' }}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Employee'}
        </button>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB 2 — EMPLOYEES
// ════════════════════════════════════════════════════════════════
function EmployeesTab({ openAdd, onAddHandled, centerId = '' }) {
  const { has } = getPermissions();
  const [employees, setEmployees] = useState([]);
  const [centers, setCenters] = useState([]);
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [centerFilter, setCenterFilter] = useState(centerId);
  const [activeOnly, setActiveOnly] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [toast, setToast] = useState({ msg: '', type: '' });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3500);
  };

  useEffect(() => { setCenterFilter(centerId); }, [centerId]);

  useEffect(() => {
    api('/api/payroll/departments').then(r => r.ok ? r.json() : { departments: [] }).then(d => setDepts(d.departments || []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ active_only: activeOnly });
    if (deptFilter) params.set('department', deptFilter);
    if (centerFilter) params.set('center_id', centerFilter);
    try {
      const [empRes, ctrRes] = await Promise.all([
        api(`/api/payroll/employees?${params}`),
        api('/api/centers'),
      ]);
      const empData = empRes.ok ? await empRes.json() : { employees: [] };
      const ctrData = ctrRes.ok ? await ctrRes.json() : { centers: [] };
      setEmployees(empData.employees || []);
      setCenters(ctrData.centers || []);
    } catch (_) {}
    setLoading(false);
  }, [activeOnly, deptFilter, centerFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (openAdd) { setEditEmp(null); setShowModal(true); onAddHandled(); }
  }, [openAdd, onAddHandled]);

  const deactivate = async (emp) => {
    if (!window.confirm(`Deactivate ${emp.name}?`)) return;
    try {
      const res = await api(`/api/payroll/employees/${emp.id}`, { method: 'DELETE' });
      if (res.ok) { showToast(`${emp.name} deactivated`); load(); }
      else { const d = await res.json().catch(() => ({})); showToast(d.message || 'Failed', 'error'); }
    } catch (_) { showToast('Network error', 'error'); }
  };

  const filtered = employees.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      if (!e.name?.toLowerCase().includes(q) && !e.employee_code?.toLowerCase().includes(q) && !e.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const centerName = id => centers.find(c => c.id == id)?.name || id || '—';

  return (
    <div>
      <Toast msg={toast.msg} type={toast.type} />

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
        <input placeholder="Search by name, code, email…" value={search} onChange={e => setSearch(e.target.value)}
          className={inputCls + ' max-w-xs'} />
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className={inputCls + ' w-full sm:w-44'}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={centerFilter} onChange={e => setCenterFilter(e.target.value)} className={inputCls + ' w-full sm:w-40'}>
          <option value="">All Centers</option>
          {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div className={`w-10 h-5 rounded-full relative transition-colors ${activeOnly ? 'bg-teal-500' : 'bg-slate-300'}`}
            onClick={() => setActiveOnly(a => !a)}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${activeOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-xs font-semibold text-slate-600">Active Only</span>
        </label>
        <div className="flex-1" />
        {has('EMPLOYEE_WRITE') && (
        <button onClick={() => { setEditEmp(null); setShowModal(true); }}
          className="px-4 py-2 rounded-xl text-white text-sm font-semibold flex items-center gap-2 hover:opacity-90"
          style={{ background: '#0d9488' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Employee
        </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? <Spin /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Emp Code', 'Name', 'Department', 'Position', 'Center', 'Basic Salary', 'Joining Date', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400">No employees found</td></tr>
                )}
                {filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{emp.employee_code || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: DEPT_COLORS[emp.department] || '#0d9488' }}>
                          {(emp.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div>{emp.name}</div>
                          <div className="text-xs text-slate-400 font-normal">{emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: (DEPT_COLORS[emp.department] || '#0d9488') + '18', color: DEPT_COLORS[emp.department] || '#0d9488' }}>
                        {emp.department || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{emp.position || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{centerName(emp.center_id)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{fmt(emp.basic_salary)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtD(emp.date_of_joining)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge status={emp.active !== false ? 'PRESENT' : 'ABSENT'} customLabel={emp.active !== false ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-2">
                        {has('EMPLOYEE_WRITE') && (
                          <button onClick={() => { setEditEmp(emp); setShowModal(true); }}
                            className="px-3 py-1 text-xs font-semibold rounded-lg text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors">
                            Edit
                          </button>
                        )}
                        {has('EMPLOYEE_WRITE') && emp.active !== false && (
                          <button onClick={() => deactivate(emp)}
                            className="px-3 py-1 text-xs font-semibold rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <EmployeeModal
          emp={editEmp}
          centers={centers}
          onClose={() => setShowModal(false)}
          onSaved={(action) => { showToast(`Employee ${action} successfully`); setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB 3 — ATTENDANCE
// ════════════════════════════════════════════════════════════════
const ATT_DOT = {
  PRESENT:  { bg: '#16a34a', title: 'Present' },
  ABSENT:   { bg: '#dc2626', title: 'Absent' },
  LEAVE:    { bg: '#d97706', title: 'Leave' },
  HALF_DAY: { bg: '#ea580c', title: 'Half Day' },
  WEEKEND:  { bg: '#7c3aed', title: 'Weekend' },
};
const ATT_CYCLE = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'WEEKEND'];

function AttendanceTab({ openMark, onMarkHandled, centerId = '', canMark = false }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [centerFilter, setCenterFilter] = useState(centerId);
  const [subView, setSubView] = useState('grid'); // 'grid' | 'summary'
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [summary, setSummary] = useState([]);
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [marking, setMarking] = useState({});
  const [toast, setToast] = useState({ msg: '', type: '' });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3500);
  };

  useEffect(() => { setCenterFilter(centerId); }, [centerId]);

  const load = useCallback(async () => {
    setLoading(true);
    const daysInMo = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const endDate   = `${year}-${String(month).padStart(2,'0')}-${String(daysInMo).padStart(2,'0')}`;
    const attParams = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: 500 });
    const sumParams = new URLSearchParams({ month, year });
    if (centerFilter) { attParams.set('center_id', centerFilter); sumParams.set('center_id', centerFilter); }
    try {
      const [empRes, attRes, sumRes, ctrRes] = await Promise.all([
        api(`/api/payroll/employees?active_only=true${centerFilter ? '&center_id=' + centerFilter : ''}`),
        api(`/api/payroll/attendance?${attParams}`),
        api(`/api/payroll/attendance/summary?${sumParams}`),
        api('/api/centers'),
      ]);
      setEmployees((empRes.ok ? await empRes.json() : { employees: [] }).employees || []);
      setAttendance((attRes.ok ? await attRes.json() : { attendance: [] }).attendance || []);
      setSummary((sumRes.ok ? await sumRes.json() : { summary: [] }).summary || []);
      setCenters((ctrRes.ok ? await ctrRes.json() : { centers: [] }).centers || []);
    } catch (_) {}
    setLoading(false);
  }, [month, year, centerFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (openMark) { setShowMarkModal(true); onMarkHandled(); }
  }, [openMark, onMarkHandled]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const DOW = ['S','M','T','W','T','F','S'];

  // Build lookup: empId -> day -> { status, id }
  const attLookup = {};
  attendance.forEach(a => {
    // Use string slice to avoid timezone-related off-by-one (new Date('YYYY-MM-DD') is UTC)
    const day = parseInt((a.attendance_date || '').slice(8, 10), 10);
    const empId = a.employee_id;
    if (!attLookup[empId]) attLookup[empId] = {};
    attLookup[empId][day] = { status: a.status, id: a.id };
  });

  // Contracted off days per employee for this month
  const contractedOffs = (emp) =>
    Math.round(daysInMonth * (parseInt(emp.weekly_offs) || 1) / 7);

  // How many WEEKEND days already marked for this employee this month
  const weekendCount = (empId) =>
    Object.values(attLookup[empId] || {}).filter(v => v.status === 'WEEKEND').length;

  const isFuture = (day) => new Date(year, month - 1, day) > new Date();

  // Click a cell → cycle to next status; skip WEEKEND if contract limit reached
  const markCell = async (emp, day) => {
    const key = `${emp.id}-${day}`;
    if (!canMark || marking[key] || isFuture(day)) return;
    const existing = attLookup[emp.id]?.[day];
    const cur = existing?.status;
    let idx = cur ? (ATT_CYCLE.indexOf(cur) + 1) % ATT_CYCLE.length : 0;
    // Skip WEEKEND if at limit (only when cycling *to* WEEKEND, not when leaving it)
    if (ATT_CYCLE[idx] === 'WEEKEND' && weekendCount(emp.id) >= contractedOffs(emp)) {
      idx = (idx + 1) % ATT_CYCLE.length;
    }
    const nextSt = ATT_CYCLE[idx];
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    setMarking(m => ({ ...m, [key]: true }));
    // Optimistic update
    setAttendance(prev =>
      existing?.id
        ? prev.map(a => a.id === existing.id ? { ...a, status: nextSt } : a)
        : [...prev, { id: `tmp-${key}`, employee_id: emp.id, attendance_date: dateStr, status: nextSt }]
    );
    try {
      let res;
      if (existing?.id) {
        res = await api(`/api/payroll/attendance/${existing.id}`, { method: 'PUT', body: JSON.stringify({ status: nextSt }) });
      } else {
        res = await api('/api/payroll/attendance', { method: 'POST', body: JSON.stringify({ employee_id: emp.id, attendance_date: dateStr, status: nextSt }) });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to update', 'error');
        load(); // revert optimistic
      } else if (!existing?.id) {
        // Replace tmp id with real id from server
        const d = await res.json().catch(() => ({}));
        if (d.attendance?.id) {
          setAttendance(prev => prev.map(a =>
            a.id === `tmp-${key}` ? { ...a, id: d.attendance.id } : a
          ));
        }
      }
    } catch (_) {
      showToast('Network error', 'error');
      load();
    }
    setMarking(m => ({ ...m, [key]: false }));
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const YEARS = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div>
      <Toast msg={toast.msg} type={toast.type} />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
        <select value={month} onChange={e => setMonth(+e.target.value)} className={inputCls + ' w-full sm:w-32'}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(+e.target.value)} className={inputCls + ' w-full sm:w-24'}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={centerFilter} onChange={e => setCenterFilter(e.target.value)} className={inputCls + ' w-full sm:w-40'}>
          <option value="">All Centers</option>
          {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex rounded-xl overflow-hidden border border-slate-200">
          {[['grid', 'Monthly Grid'], ['summary', 'Summary']].map(([v, l]) => (
            <button key={v} onClick={() => setSubView(v)}
              className="px-4 py-2 text-xs font-semibold transition-colors"
              style={subView === v ? { background: '#0d9488', color: '#fff' } : { background: '#fff', color: '#475569' }}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {canMark && (
          <button onClick={() => setShowMarkModal(true)}
            className="px-4 py-2 rounded-xl text-white text-sm font-semibold flex items-center gap-2 hover:opacity-90"
            style={{ background: '#0369a1' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Mark Attendance
          </button>
        )}
      </div>

      {loading ? <Spin /> : (
        <>
          {subView === 'grid' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-2 text-left font-bold text-slate-600 sticky left-0 bg-slate-50 min-w-[170px]">Employee</th>
                      {days.map(d => (
                        <th key={d} className="px-0 py-2 text-center w-7 text-slate-500">
                          <div className="font-bold text-xs">{d}</div>
                          <div className="text-slate-300 text-xs font-normal">{DOW[new Date(year, month-1, d).getDay()]}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {employees.length === 0 && (
                      <tr><td colSpan={days.length + 1} className="text-center py-10 text-slate-400">No employees</td></tr>
                    )}
                    {employees.map(emp => {
                      const usedOffs = weekendCount(emp.id);
                      const maxOffs  = contractedOffs(emp);
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/40">
                          <td className="px-4 py-2 sticky left-0 bg-white font-semibold text-slate-700 whitespace-nowrap border-r border-slate-100">
                            <div className="text-sm">{emp.name}</div>
                            <div className="text-slate-400 font-normal text-xs">{emp.department}</div>
                            <div className="text-xs mt-0.5 font-normal"
                              style={{ color: usedOffs >= maxOffs ? '#dc2626' : '#0d9488' }}>
                              {usedOffs}/{maxOffs} offs
                            </div>
                          </td>
                          {days.map(d => {
                            const rec    = attLookup[emp.id]?.[d];
                            const st     = rec?.status;
                            const future = isFuture(d);
                            const busy   = marking[`${emp.id}-${d}`];
                            return (
                              <td key={d} className="px-0 py-1.5 text-center">
                                <button
                                  onClick={() => markCell(emp, d)}
                                  disabled={future || busy}
                                  title={st ? `${ATT_DOT[st]?.title} — click to change` : (future ? 'Future date' : 'Not marked — click to mark')}
                                  className="inline-block w-8 h-8 sm:w-6 sm:h-6 rounded-md transition-all hover:scale-110 disabled:opacity-30 disabled:cursor-default focus:outline-none focus:ring-1 focus:ring-teal-400"
                                  style={{ background: busy ? '#e2e8f0' : st ? ATT_DOT[st].bg : future ? '#f8fafc' : '#f1f5f9' }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t border-slate-100 bg-slate-50">
                {Object.entries(ATT_DOT).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-4 rounded-md" style={{ background: v.bg }} />
                    <span className="text-xs text-slate-500">{v.title}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 rounded-md bg-slate-100" />
                  <span className="text-xs text-slate-400">Not marked</span>
                </div>
                <span className="text-xs text-slate-400 ml-2">Click any past/today cell to cycle status</span>
              </div>
            </div>
          )}

          {subView === 'summary' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['Employee', 'Department', 'Present', 'Absent', 'Leave', 'Half Day', 'Weekend'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {summary.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-10 text-slate-400">No summary data for this period</td></tr>
                    )}
                    {summary.map((row, i) => {
                      return (
                        <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">{row.employee_name || row.name || '—'}</td>
                          <td className="px-4 py-3 text-slate-500">{row.department || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">{row.present_days || 0}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">{row.absent_days || 0}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">{row.leave_days || 0}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">{row.half_days || 0}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">{row.weekend_days || 0}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {showMarkModal && (
        <MarkAttendanceModal
          employees={employees}
          onClose={() => setShowMarkModal(false)}
          onSaved={() => { showToast('Attendance saved successfully'); setShowMarkModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Mark Attendance Modal ──────────────────────────────────────
function MarkAttendanceModal({ employees, onClose, onSaved }) {
  const [date, setDate] = useState(today());
  const [records, setRecords] = useState({});
  // existingIds: empId -> attendance record id (for PUT)
  const [existingIds, setExistingIds] = useState({});
  // weekendCounts: empId -> number of WEEKEND days already marked this month (excluding today's record)
  const [weekendCounts, setWeekendCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const init = {};
    employees.forEach(e => { init[e.id] = 'PRESENT'; });
    setRecords(init);
  }, [employees]);

  // When date changes: load existing attendance for that date + month weekend counts
  useEffect(() => {
    if (!date || employees.length === 0) return;
    const [y, m] = date.split('-');
    const daysInMo = new Date(+y, +m, 0).getDate();
    const start = `${y}-${m}-01`;
    const end   = `${y}-${m}-${String(daysInMo).padStart(2,'0')}`;
    api(`/api/payroll/attendance?start_date=${start}&end_date=${end}&limit=500`)
      .then(r => r.ok ? r.json() : { attendance: [] })
      .then(d => {
        const ids = {};
        const counts = {};
        (d.attendance || []).forEach(a => {
          // Existing record for this exact date → pre-fill status + store id for PUT
          if ((a.attendance_date || '').slice(0, 10) === date) {
            ids[a.employee_id] = a.id;
            setRecords(prev => ({ ...prev, [a.employee_id]: a.status }));
          }
          // Weekend counts for the month (exclude today's record — it will be overwritten)
          if (a.status === 'WEEKEND' && (a.attendance_date || '').slice(0, 10) !== date) {
            counts[a.employee_id] = (counts[a.employee_id] || 0) + 1;
          }
        });
        setExistingIds(ids);
        setWeekendCounts(counts);
      })
      .catch(() => {});
  }, [date, employees]);

  const contractedOffs = (emp) => {
    if (!date) return 0;
    const [y, m] = date.split('-');
    const daysInMo = new Date(+y, +m, 0).getDate();
    return Math.round(daysInMo * (parseInt(emp.weekly_offs) || 1) / 7);
  };

  const setStatus = (empId, status) => setRecords(r => ({ ...r, [empId]: status }));

  const save = async () => {
    if (!date) { setErr('Please select a date'); return; }
    setSaving(true);
    setErr('');
    try {
      const entries = Object.entries(records);
      const results = await Promise.all(entries.map(([employee_id, status]) => {
        const existId = existingIds[+employee_id] || existingIds[employee_id];
        if (existId) {
          // Record exists → update it
          return api(`/api/payroll/attendance/${existId}`, {
            method: 'PUT',
            body: JSON.stringify({ status }),
          });
        }
        // New record → insert it
        return api('/api/payroll/attendance', {
          method: 'POST',
          body: JSON.stringify({ employee_id: +employee_id, attendance_date: date, status }),
        });
      }));
      const failed = results.filter(r => !r.ok).length;
      if (failed > 0) setErr(`${failed} record(s) failed to save. Rest were saved.`);
      else onSaved();
    } catch (_) { setErr('Network error'); }
    setSaving(false);
  };

  const STATUS_OPTS = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'WEEKEND'];

  return (
    <Modal title="Mark Attendance" onClose={onClose} wide>
      {err && <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
      <div className="mb-4 max-w-sm">
        <DateInput label="Attendance Date" value={date} onChange={setDate}
          minYear={new Date().getFullYear() - 1} maxYear={new Date().getFullYear()} />
      </div>
      <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-100">
        {employees.length === 0 && <p className="text-slate-400 text-sm p-4">No employees to mark</p>}
        {employees.map((emp, i) => (
          <div key={emp.id} className={`flex items-center gap-3 px-4 py-3 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: DEPT_COLORS[emp.department] || '#0d9488' }}>
              {(emp.name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{emp.name}</div>
              <div className="text-xs text-slate-400">{emp.department} · {emp.position}</div>
            </div>
            <div className="flex gap-1.5 flex-wrap justify-end items-center">
              {STATUS_OPTS.map(s => {
                const cfg = STATUS_CFG[s];
                const active = records[emp.id] === s;
                const maxOffs = contractedOffs(emp);
                const used = weekendCounts[emp.id] || 0;
                const weekendDisabled = s === 'WEEKEND' && used >= maxOffs && !active;
                return (
                  <button key={s} onClick={() => !weekendDisabled && setStatus(emp.id, s)}
                    disabled={weekendDisabled}
                    title={s === 'WEEKEND' ? `${used}/${maxOffs} weekend days used` : ''}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    style={active
                      ? { background: cfg.bg, color: cfg.color, borderColor: cfg.color }
                      : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                    {cfg.label}
                    {s === 'WEEKEND' && <span className="ml-1 opacity-60">({used}/{maxOffs})</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm font-semibold">Cancel</button>
        <button onClick={save} disabled={saving}
          className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
          style={{ background: '#0369a1' }}>
          {saving ? 'Saving…' : `Save Attendance (${employees.length} employees)`}
        </button>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB 4 — PAYROLL
// ════════════════════════════════════════════════════════════════

// Defined at module level to prevent re-render/focus issues
const ParamField = ({ label, fkey, step = '0.01', params, onChange }) => (
  <div>
    <label className={labelCls}>{label}</label>
    <input type="number" step={step} value={params[fkey]} onChange={e => onChange(fkey, e.target.value)} className={inputCls} />
  </div>
);

const DEFAULT_PARAMS = {
  basic_salary_multiplier: '1',
  hra_percentage: '40',
  da_percentage: '10',
  pf_percentage: '12',
  esi_percentage: '0.75',
  professional_tax: '200',
};

function PayrollTab({ centerId = '' }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [centerFilter, setCenterFilter] = useState(centerId);
  const [centers, setCenters] = useState([]);
  const [benefitsEnabled, setBenefitsEnabled] = useState(false); // OFF by default — small org
  const [params, setParams] = useState({ ...DEFAULT_PARAMS });
  const [calculations, setCalculations] = useState(null);
  const [calcSummary, setCalcSummary] = useState(null);
  const [register, setRegister] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [approvalResult, setApprovalResult] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 4000);
  };

  const setP = (k, v) => setParams(p => ({ ...p, [k]: v }));

  useEffect(() => { setCenterFilter(centerId); }, [centerId]);

  useEffect(() => {
    api('/api/centers').then(r => r.ok ? r.json() : { centers: [] }).then(d => setCenters(d.centers || [])).catch(() => {});
  }, []);

  const loadRegister = useCallback(async () => {
    setLoading(true);
    const params2 = new URLSearchParams({ month, year });
    if (centerFilter) params2.set('center_id', centerFilter);
    try {
      const res = await api(`/api/payroll/register?${params2}`);
      const d = res.ok ? await res.json() : { records: [] };
      setRegister(d.records || []);
    } catch (_) {}
    setLoading(false);
  }, [month, year, centerFilter]);

  useEffect(() => { loadRegister(); }, [loadRegister]);

  const calculate = async () => {
    if (!centerFilter) { showToast('Please select a center first', 'error'); return; }
    setCalcLoading(true);
    setCalculations(null);
    setCalcSummary(null);
    setApprovalResult(null);
    try {
      const body = {
        center_id: +centerFilter,
        month: +month,
        year: +year,
        basic_salary_multiplier: parseFloat(params.basic_salary_multiplier),
        hra_percentage:   benefitsEnabled ? parseFloat(params.hra_percentage)   : 0,
        da_percentage:    benefitsEnabled ? parseFloat(params.da_percentage)    : 0,
        pf_percentage:    benefitsEnabled ? parseFloat(params.pf_percentage)    : 0,
        esi_percentage:   benefitsEnabled ? parseFloat(params.esi_percentage)   : 0,
        professional_tax: benefitsEnabled ? parseFloat(params.professional_tax) : 0,
      };
      const res = await api('/api/payroll/calculate', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.message || d.error || 'Calculation failed', 'error');
      } else {
        const d = await res.json();
        const payroll = d.payroll || d;
        setCalculations(payroll.calculations || []);
        setCalcSummary(payroll.summary || null);
        showToast('Payroll calculated successfully', 'success');
      }
    } catch (_) { showToast('Network error', 'error'); }
    setCalcLoading(false);
  };

  const approve = async () => {
    if (!centerFilter) { showToast('Please select a center', 'error'); return; }
    if (!window.confirm(`Approve payroll for ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year}? This will post a journal entry.`)) return;
    setApproveLoading(true);
    try {
      const body = { center_id: +centerFilter, month: +month, year: +year };
      const res = await api('/api/payroll/approve', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.message || d.error || 'Approval failed', 'error');
      } else {
        const d = await res.json();
        setApprovalResult(d.summary || d);
        if (d.je_warning) {
          showToast(`Approved — ${d.je_warning}`, 'info');
        } else {
          showToast('Payroll approved and posted to Finance', 'success');
        }
        loadRegister();
      }
    } catch (_) { showToast('Network error', 'error'); }
    setApproveLoading(false);
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const YEARS = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="space-y-6">
      <Toast msg={toast.msg} type={toast.type} />

      {/* Period + Center selector */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <h3 className="font-bold text-slate-700 mb-4 text-sm uppercase tracking-wide">Pay Period</h3>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className={labelCls}>Month</label>
            <select value={month} onChange={e => { setMonth(+e.target.value); setCalculations(null); }} className={inputCls + ' w-full sm:w-32'}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Year</label>
            <select value={year} onChange={e => { setYear(+e.target.value); setCalculations(null); }} className={inputCls + ' w-full sm:w-24'}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Center *</label>
            <select value={centerFilter} onChange={e => { setCenterFilter(e.target.value); setCalculations(null); }} className={inputCls + ' w-48'}>
              <option value="">Select Center…</option>
              {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Step 1 — Calculate */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Step 1 — Calculate Payroll</h3>
          <span className="text-xs text-slate-400">Configure components, then click Calculate</span>
        </div>

        {/* Statutory Benefits Toggle */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl border border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => setBenefitsEnabled(v => !v)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${benefitsEnabled ? 'bg-teal-500' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${benefitsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <div>
            <span className="text-sm font-semibold text-slate-700">Statutory Benefits</span>
            <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${benefitsEnabled ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500'}`}>
              {benefitsEnabled ? 'Enabled — HRA, DA, PF, ESI, Prof Tax applied' : 'Disabled — Basic salary only, no deductions'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <ParamField label="Salary Multiplier" fkey="basic_salary_multiplier" params={params} onChange={setP} />
          {benefitsEnabled && <>
            <ParamField label="HRA %" fkey="hra_percentage" params={params} onChange={setP} />
            <ParamField label="DA %" fkey="da_percentage" params={params} onChange={setP} />
            <ParamField label="PF %" fkey="pf_percentage" params={params} onChange={setP} />
            <ParamField label="ESI %" fkey="esi_percentage" params={params} onChange={setP} />
            <ParamField label="Prof Tax (₹)" fkey="professional_tax" step="1" params={params} onChange={setP} />
          </>}
        </div>
        <button onClick={calculate} disabled={calcLoading}
          className="px-6 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-60 hover:opacity-90 flex items-center gap-2"
          style={{ background: '#0d9488' }}>
          {calcLoading ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Calculating…</>
          ) : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>Calculate Payroll</>
          )}
        </button>
      </div>

      {/* Calculation Results */}
      {calculations && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Payroll Breakdown</h3>
            {calcSummary && (
              <div className="flex flex-wrap gap-2 sm:gap-4 text-xs">
                <span className="text-slate-500">Total Employees: <strong className="text-slate-800">{calcSummary.total_employees}</strong></span>
                <span className="text-slate-500">Total Gross: <strong className="text-teal-700">{fmt(calcSummary.total_gross)}</strong></span>
                <span className="text-slate-500">Total Net: <strong className="text-green-700">{fmt(calcSummary.total_net)}</strong></span>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Employee', 'Dept', 'Days', 'Basic',
                    ...(benefitsEnabled ? ['HRA', 'DA', 'Gross'] : []),
                    ...(benefitsEnabled ? ['PF', 'ESI', 'Prof Tax'] : []),
                    'Net Salary'].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {calculations.map((row, i) => (
                  <tr key={i} className="hover:bg-teal-50/20 transition-colors">
                    <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">{row.employee_name || row.name}</td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{row.department}</td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{row.attendance_summary?.present_days ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{fmt(row.earnings?.basic_salary ?? row.basic_salary)}</td>
                    {benefitsEnabled && <>
                      <td className="px-3 py-3 text-blue-600 whitespace-nowrap">{fmt(row.earnings?.hra ?? row.hra)}</td>
                      <td className="px-3 py-3 text-indigo-600 whitespace-nowrap">{fmt(row.earnings?.da ?? row.da)}</td>
                      <td className="px-3 py-3 font-bold text-teal-700 whitespace-nowrap">{fmt(row.earnings?.prorated_gross_salary ?? row.gross_salary)}</td>
                      <td className="px-3 py-3 text-red-500 whitespace-nowrap">-{fmt(row.deductions?.pf ?? row.pf_deduction)}</td>
                      <td className="px-3 py-3 text-red-500 whitespace-nowrap">-{fmt(row.deductions?.esi ?? row.esi_deduction)}</td>
                      <td className="px-3 py-3 text-red-500 whitespace-nowrap">-{fmt(row.deductions?.professional_tax ?? row.professional_tax)}</td>
                    </>}
                    <td className="px-3 py-3 font-bold text-green-700 whitespace-nowrap">{fmt(row.net_salary)}</td>
                  </tr>
                ))}
                {calcSummary && (
                  <tr className="bg-teal-50 border-t-2 border-teal-200 font-bold">
                    <td className="px-3 py-3 text-teal-800 uppercase text-xs tracking-wide">TOTALS</td>
                    <td className="px-3 py-3 text-teal-600">{calcSummary.total_employees} employees</td>
                    <td />
                    <td />
                    {benefitsEnabled && <><td /><td /><td className="px-3 py-3 text-teal-800">{fmt(calcSummary.total_gross)}</td><td /><td /><td /></>}
                    <td className="px-3 py-3 text-green-800">{fmt(calcSummary.total_net)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Step 2 — Approve */}
          <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h4 className="font-bold text-slate-700 text-sm">Step 2 — Approve & Post to Finance</h4>
                <p className="text-xs text-slate-400 mt-0.5">This will approve the payroll and create a journal entry in the Finance module.</p>
              </div>
              <button onClick={approve} disabled={approveLoading}
                className="px-6 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-60 hover:opacity-90 flex items-center gap-2"
                style={{ background: '#7c3aed' }}>
                {approveLoading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Approving…</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>Approve & Post to Finance</>
                )}
              </button>
            </div>
            {approvalResult && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-bold text-green-700">Payroll Approved Successfully</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-slate-500">Employees: </span><strong className="text-slate-800">{approvalResult.total_employees}</strong></div>
                  <div><span className="text-slate-500">Total Gross: </span><strong className="text-teal-700">{fmt(approvalResult.total_gross)}</strong></div>
                  <div><span className="text-slate-500">Total Net: </span><strong className="text-green-700">{fmt(approvalResult.total_net)}</strong></div>
                  {approvalResult.journal_entry_id && (
                    <div><span className="text-slate-500">Journal Entry ID: </span><strong className="text-purple-700">#{approvalResult.journal_entry_id}</strong></div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payroll Register */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Payroll Register</h3>
          <button onClick={loadRegister} className="text-xs text-teal-600 hover:underline font-semibold">Refresh</button>
        </div>
        {loading ? <Spin /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Employee', 'Code', 'Department', 'Period', 'Basic',
                    ...(benefitsEnabled ? ['Gross', 'PF', 'ESI', 'Prof Tax'] : []),
                    'Net Salary', 'Status'].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {register.length === 0 && (
                  <tr><td colSpan={benefitsEnabled ? 11 : 7} className="text-center py-10 text-slate-400">No payroll records for this period</td></tr>
                )}
                {register.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">{row.employee_name}</td>
                    <td className="px-3 py-3 font-mono text-slate-400 whitespace-nowrap">{row.employee_code || '—'}</td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{row.department}</td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(row.pay_period_month || 1) - 1]} {row.pay_period_year}</td>
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{fmt(row.basic_salary)}</td>
                    {benefitsEnabled && <>
                      <td className="px-3 py-3 font-semibold text-teal-700 whitespace-nowrap">{fmt(row.gross_salary)}</td>
                      <td className="px-3 py-3 text-red-500 whitespace-nowrap">-{fmt(row.pf_deduction)}</td>
                      <td className="px-3 py-3 text-red-500 whitespace-nowrap">-{fmt(row.esi_deduction)}</td>
                      <td className="px-3 py-3 text-red-500 whitespace-nowrap">-{fmt(row.professional_tax)}</td>
                    </>}
                    <td className="px-3 py-3 font-bold text-green-700 whitespace-nowrap">{fmt(row.net_salary)}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><Badge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB 5 — LEAVE MANAGEMENT
// ════════════════════════════════════════════════════════════════
const LEAVE_STATUS = {
  PENDING:   { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
  APPROVED:  { bg: '#dcfce7', color: '#166534', label: 'Approved' },
  REJECTED:  { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
  CANCELLED: { bg: '#f1f5f9', color: '#475569', label: 'Cancelled' },
};

function LeaveTab({ centerId = '' }) {
  const now = new Date();
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [empFilter, setEmpFilter] = useState('');
  const [showApply, setShowApply] = useState(false);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [applyForm, setApplyForm] = useState({
    employee_id: '', leave_type_id: '', from_date: '', to_date: '', reason: '',
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3500);
  };

  const setAF = (k, v) => setApplyForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (empFilter) params.set('employee_id', empFilter);
    try {
      const [reqRes, empRes, ltRes] = await Promise.all([
        api(`/api/payroll/leave-requests?${params}`),
        api(`/api/payroll/employees?active_only=true&limit=200${centerId ? '&center_id=' + centerId : ''}`),
        api('/api/payroll/leave-types'),
      ]);
      setRequests(reqRes.ok ? (await reqRes.json()).requests || [] : []);
      setEmployees(empRes.ok ? (await empRes.json()).employees || [] : []);
      setLeaveTypes(ltRes.ok ? (await ltRes.json()).leave_types || [] : []);
    } catch (_) {}
    setLoading(false);
  }, [statusFilter, empFilter]);

  useEffect(() => { load(); }, [load]);

  const loadBalances = async (empId) => {
    if (!empId) { setBalances([]); return; }
    const res = await api(`/api/payroll/leave-balances?employee_id=${empId}&year=${now.getFullYear()}`);
    const d = res.ok ? await res.json() : { balances: [] };
    setBalances(d.balances || []);
  };

  const applyLeave = async () => {
    if (!applyForm.employee_id || !applyForm.leave_type_id || !applyForm.from_date || !applyForm.to_date)
      return showToast('Fill all required fields', 'error');
    const res = await api('/api/payroll/leave-requests', { method: 'POST', body: JSON.stringify(applyForm) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast('Leave request submitted');
      setShowApply(false);
      setApplyForm({ employee_id: '', leave_type_id: '', from_date: '', to_date: '', reason: '' });
      setBalances([]);
      load();
    } else {
      showToast(d.error || d.errors?.[0]?.msg || 'Failed', 'error');
    }
  };

  const approve = async (id) => {
    const res = await api(`/api/payroll/leave-requests/${id}/approve`, { method: 'PUT' });
    if (res.ok) { showToast('Leave approved'); load(); }
    else { const d = await res.json().catch(() => ({})); showToast(d.error || 'Failed', 'error'); }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return showToast('Rejection reason required', 'error');
    const res = await api(`/api/payroll/leave-requests/${rejectId}/reject`, {
      method: 'PUT', body: JSON.stringify({ rejection_reason: rejectReason }),
    });
    if (res.ok) { showToast('Leave rejected'); setRejectId(null); setRejectReason(''); load(); }
    else { const d = await res.json().catch(() => ({})); showToast(d.error || 'Failed', 'error'); }
  };

  const cancel = async (id) => {
    if (!window.confirm('Cancel this leave request?')) return;
    const res = await api(`/api/payroll/leave-requests/${id}/cancel`, { method: 'PUT' });
    if (res.ok) { showToast('Cancelled'); load(); }
  };

  return (
    <div>
      <Toast msg={toast.msg} type={toast.type} />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputCls + ' w-full sm:w-36'}>
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} className={inputCls + ' w-full sm:w-52'}>
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowApply(true)}
          className="px-4 py-2 rounded-xl text-white text-sm font-semibold flex items-center gap-2 hover:opacity-90"
          style={{ background: '#0d9488' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Apply Leave
        </button>
      </div>

      {/* Leave Requests Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? <Spin /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Employee', 'Leave Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Applied On', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {requests.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400">No leave requests found</td></tr>
                )}
                {requests.map(r => {
                  const sc = LEAVE_STATUS[r.status] || LEAVE_STATUS.PENDING;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-800 text-xs">{r.employee_name}</div>
                        <div className="text-slate-400 text-xs">{r.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-700">{r.leave_type_name}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{fmtD(r.from_date)}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{fmtD(r.to_date)}</td>
                      <td className="px-4 py-3 font-bold text-slate-800 text-center">{r.days}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[160px] truncate" title={r.reason || ''}>{r.reason || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                        {r.rejection_reason && <div className="text-xs text-red-500 mt-0.5 max-w-[120px] truncate" title={r.rejection_reason}>{r.rejection_reason}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtD(r.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          {r.status === 'PENDING' && (<>
                            <button onClick={() => approve(r.id)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg text-green-700 bg-green-50 hover:bg-green-100">
                              Approve
                            </button>
                            <button onClick={() => { setRejectId(r.id); setRejectReason(''); }}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg text-red-600 bg-red-50 hover:bg-red-100">
                              Reject
                            </button>
                          </>)}
                          {['PENDING','APPROVED'].includes(r.status) && (
                            <button onClick={() => cancel(r.id)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-500 bg-slate-100 hover:bg-slate-200">
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Apply Leave Modal */}
      {showApply && (
        <Modal title="Apply Leave" onClose={() => setShowApply(false)}>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Employee *</label>
              <select value={applyForm.employee_id} onChange={e => { setAF('employee_id', e.target.value); loadBalances(e.target.value); }} className={inputCls}>
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Leave Type *</label>
              <select value={applyForm.leave_type_id} onChange={e => setAF('leave_type_id', e.target.value)} className={inputCls}>
                <option value="">Select type…</option>
                {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name} ({lt.days_per_year} days/yr)</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DateInput label="From *" value={applyForm.from_date} onChange={v => setAF('from_date', v)} minYear={new Date().getFullYear() - 1} maxYear={new Date().getFullYear() + 1} />
              <DateInput label="To *" value={applyForm.to_date} onChange={v => setAF('to_date', v)} minYear={new Date().getFullYear() - 1} maxYear={new Date().getFullYear() + 1} />
            </div>
            <div>
              <label className={labelCls}>Reason</label>
              <textarea value={applyForm.reason} onChange={e => setAF('reason', e.target.value)} rows={2} className={inputCls + ' resize-none'} />
            </div>
            {balances.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Leave Balances ({now.getFullYear()})</p>
                <div className="grid grid-cols-3 gap-2">
                  {balances.map(b => (
                    <div key={b.id} className="text-center">
                      <div className="text-xs text-slate-400">{b.leave_type_name}</div>
                      <div className="font-bold text-teal-700">{parseFloat(b.balance || 0).toFixed(1)}</div>
                      <div className="text-xs text-slate-300">available</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <button onClick={() => setShowApply(false)} className="px-4 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm font-semibold">Cancel</button>
            <button onClick={applyLeave} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{ background: '#0d9488' }}>Submit Request</button>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <Modal title="Reject Leave Request" onClose={() => setRejectId(null)}>
          <div>
            <label className={labelCls}>Rejection Reason *</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
              className={inputCls + ' resize-none'} placeholder="Provide reason for rejection…" />
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <button onClick={() => setRejectId(null)} className="px-4 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm font-semibold">Cancel</button>
            <button onClick={reject} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{ background: '#dc2626' }}>Reject Leave</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ROOT — HR PAGE
// ════════════════════════════════════════════════════════════════
const HR_FULL_ROLES = ['SUPER_ADMIN', 'CENTER_MANAGER', 'HR_MANAGER'];

const ALL_TABS = [
  { id: 'dashboard',  label: 'Dashboard',  perms: ['HR_DASHBOARD_VIEW'] },
  { id: 'employees',  label: 'Employees',  perms: ['EMPLOYEE_VIEW','EMPLOYEE_CREATE','EMPLOYEE_EDIT'] },
  { id: 'attendance', label: 'Attendance', perms: ['ATTENDANCE_VIEW','ATTENDANCE_MARK'] },
  { id: 'payroll',    label: 'Payroll',    perms: ['PAYROLL_VIEW','PAYROLL_CREATE','PAYROLL_APPROVE'] },
  { id: 'leave',      label: 'Leave',      perms: ['LEAVE_APPLY','LEAVE_APPROVE'] },
];

function getVisibleTabs(user) {
  const role = user?.role || '';
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const fullAccess = HR_FULL_ROLES.includes(role) || perms.includes('ALL_ACCESS');
  return ALL_TABS.filter(t => {
    if (t.perms === null) return true;               // dashboard always shown
    if (fullAccess) return true;
    return t.perms.some(p => perms.includes(p));
  });
}

export default function HR() {
  const { isCorp, userCenterId, user } = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      const cid = String(u.center_id || u.centerId || '');
      return { isCorp: !cid, userCenterId: cid, user: u };
    } catch { return { isCorp: false, userCenterId: '', user: {} }; }
  })();

  const TABS = getVisibleTabs(user);
  const userPerms = Array.isArray(user?.permissions) ? user.permissions : [];
  const hasFullAccess = HR_FULL_ROLES.includes(user?.role) || userPerms.includes('ALL_ACCESS');
  const canMark = hasFullAccess || userPerms.includes('ATTENDANCE_MARK');
  const [activeTab, setActiveTab] = useState(() => TABS[0]?.id || 'dashboard');
  const [empAction, setEmpAction]   = useState(null);   // 'add'
  const [attAction, setAttAction]   = useState(null);   // 'mark'
  const [centerId, setCenterId]     = useState(userCenterId);
  const [centers, setCenters]       = useState([]);

  useEffect(() => {
    if (!isCorp) return; // center users don't need the list
    api('/api/centers').then(r => r.ok ? r.json() : {}).then(d => {
      setCenters(Array.isArray(d) ? d : (d.centers || []));
    }).catch(() => {});
  }, [isCorp]);

  const switchTab = (tab, action) => {
    if (!TABS.find(t => t.id === tab)) return; // ignore if not permitted
    setActiveTab(tab);
    if (tab === 'employees' && action === 'add') setEmpAction('add');
    if (tab === 'attendance' && action === 'mark') setAttAction('mark');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page Header */}
      <div className="px-3 sm:px-6 pt-3 sm:pt-4 pb-0"
        style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f766e 60%,#0d9488 100%)' }}>
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-bold text-white tracking-tight truncate">HR Management</h1>
                <p className="text-teal-200 text-xs mt-0.5 hidden sm:block">Employees · Attendance · Leave · Payroll</p>
              </div>
            </div>
            {isCorp && (
              <select
                value={centerId}
                onChange={e => setCenterId(e.target.value)}
                className="bg-white/15 text-white border border-white/30 rounded-xl px-2 sm:px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white/40 w-32 sm:min-w-[200px] cursor-pointer flex-shrink-0">
                <option value="">All Centers</option>
                {centers.filter(c => c.active !== false).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Tabs — horizontal scroll on mobile */}
          <div className="flex gap-0.5 overflow-x-auto pb-0 scrollbar-hide">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="px-3 sm:px-5 py-2 text-xs sm:text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap flex-shrink-0"
                style={activeTab === tab.id
                  ? { background: '#f8fafc', color: '#0d9488' }
                  : { background: 'transparent', color: 'rgba(255,255,255,0.75)' }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-screen-xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {activeTab === 'dashboard'  && <DashboardTab onTabSwitch={switchTab} canMark={canMark} />}
        {activeTab === 'employees'  && (
          <EmployeesTab
            openAdd={empAction === 'add'}
            onAddHandled={() => setEmpAction(null)}
            centerId={centerId}
          />
        )}
        {activeTab === 'attendance' && (
          <AttendanceTab
            openMark={attAction === 'mark'}
            onMarkHandled={() => setAttAction(null)}
            centerId={centerId}
            canMark={canMark}
          />
        )}
        {activeTab === 'payroll'    && <PayrollTab centerId={centerId} />}
        {activeTab === 'leave'      && <LeaveTab centerId={centerId} />}
      </div>
    </div>
  );
}
