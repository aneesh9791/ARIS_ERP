import { useState, useEffect, useCallback, useRef } from 'react';

const AUTH_HEADER = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};
const JSON_HEADER = () => ({ ...AUTH_HEADER(), 'Content-Type': 'application/json' });

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

const EMPTY_DIRECTOR = { director_name: '', designation: '', din: '', email: '', phone: '' };

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Andaman & Nicobar Islands','Chandigarh',
  'Dadra & Nagar Haveli and Daman & Diu','Delhi','Jammu & Kashmir','Ladakh',
  'Lakshadweep','Puducherry',
];

// ── Section wrapper ──────────────────────────────────────────────────────────
const Section = ({ title, subtitle, accent = '#0d9488', children }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-5">
    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3"
         style={{ borderLeft: `4px solid ${accent}` }}>
      <div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <div className="px-5 py-4">{children}</div>
  </div>
);

// ── Director row ─────────────────────────────────────────────────────────────
const DirectorRow = ({ director, onSave, onDelete, isNew = false }) => {
  const [form, setForm]       = useState({ ...EMPTY_DIRECTOR, ...director });
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving]   = useState(false);
  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    setEditing(false);
  };

  if (!editing) return (
    <div className="flex items-center gap-4 py-3 border-b border-slate-100 last:border-0">
      <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-teal-700">{form.director_name?.[0]?.toUpperCase() || 'D'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{form.director_name}</p>
        <p className="text-xs text-slate-400">{form.designation}{form.din ? ` · DIN: ${form.din}` : ''}</p>
      </div>
      <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
        {form.email && <span>{form.email}</span>}
        {form.phone && <span>{form.phone}</span>}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={() => setEditing(true)}
          className="px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg">
          Edit
        </button>
        <button onClick={onDelete}
          className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg">
          Remove
        </button>
      </div>
    </div>
  );

  return (
    <div className="border border-teal-200 rounded-xl p-4 bg-teal-50/30 mb-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
          <input value={form.director_name} onChange={set('director_name')} className={inputCls} placeholder="e.g. Dr. Rajesh Kumar" />
        </div>
        <div>
          <label className={labelCls}>Designation</label>
          <input value={form.designation} onChange={set('designation')} className={inputCls} placeholder="e.g. Managing Director" />
        </div>
        <div>
          <label className={labelCls}>DIN (Director ID Number)</label>
          <input value={form.din} onChange={set('din')} className={inputCls} placeholder="8-digit DIN" maxLength={8} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="director@company.com" />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input value={form.phone} onChange={set('phone')} className={inputCls} placeholder="+91 98XX XXXXXX" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        {!isNew && (
          <button onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
        )}
        <button onClick={handleSave} disabled={saving || !form.director_name.trim()}
          className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Director'}
        </button>
      </div>
    </div>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────
const SimpleSettingsPage = () => {
  const [company,   setCompany]   = useState({});
  const [directors, setDirectors] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState('');
  const [logoPreview, setLogoPreview] = useState(null);
  const [uploading,   setUploading]   = useState(null); // 'uploading'|null
  const [logoError,   setLogoError]   = useState('');
  const [showAddDir,  setShowAddDir]  = useState(false);
  const fileRef = useRef();

  const set = f => e => setCompany(p => ({ ...p, [f]: e.target.value }));

  const fetchCompany = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await fetch('/api/settings/company', { headers: AUTH_HEADER() });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setCompany(data.company  || {});
      setDirectors(data.directors || []);
      if (data.company?.logo_path) setLogoPreview(data.company.logo_path);
    } catch (err) {
      if (!silent) setError('Could not load settings: ' + err.message);
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { fetchCompany(); }, [fetchCompany]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch('/api/settings/company', {
        method: 'PUT', headers: JSON_HEADER(), body: JSON.stringify(company),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      // Sync to localStorage so print functions (bills, POs) always have fresh data
      try { localStorage.setItem('companyInfo', JSON.stringify(company)); } catch (_) {}
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  // ── Sync logo to localStorage so Logo.jsx updates everywhere instantly ──
  const syncLogoToApp = (logoUrl) => {
    try {
      const existing = JSON.parse(localStorage.getItem('logoConfig') || '{}');
      const updated  = { ...existing, customLogo: logoUrl };
      localStorage.setItem('logoConfig', JSON.stringify(updated));
      window.dispatchEvent(new Event('logoConfigUpdated'));
    } catch (_) {}
  };

  const handleLogoChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
    setLogoError('');
    setUploading('uploading');
    const fd = new FormData();
    fd.append('logo', file);
    try {
      const res = await fetch('/api/settings/company/logo', {
        method: 'POST', headers: AUTH_HEADER(), body: fd,
      });
      const d = await res.json();
      if (d.success) {
        const url = d.logo_path + '?t=' + Date.now();
        setLogoPreview(url);
        setCompany(p => ({ ...p, logo_path: d.logo_path }));
        syncLogoToApp(url);
        fetchCompany(true); // silent re-sync — no loading flicker
      } else {
        setLogoError(d.error || d.message || 'Upload failed');
        setLogoPreview(null);
      }
    } catch (err) {
      setLogoError('Network error: ' + err.message);
      setLogoPreview(null);
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleRemoveLogo = async () => {
    await fetch('/api/settings/company/logo', { method: 'DELETE', headers: AUTH_HEADER() });
    setLogoPreview(null);
    setCompany(p => ({ ...p, logo_path: null }));
    if (fileRef.current) fileRef.current.value = '';
    syncLogoToApp(null);
  };

  const handleAddDirector = async form => {
    const res  = await fetch('/api/settings/company/directors', {
      method: 'POST', headers: JSON_HEADER(), body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.success) { setDirectors(p => [...p, data.director]); setShowAddDir(false); }
  };

  const handleUpdateDirector = async (id, form) => {
    const res  = await fetch(`/api/settings/company/directors/${id}`, {
      method: 'PUT', headers: JSON_HEADER(), body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.success) setDirectors(p => p.map(d => d.id === id ? data.director : d));
  };

  const handleDeleteDirector = async id => {
    if (!window.confirm('Remove this director?')) return;
    await fetch(`/api/settings/company/directors/${id}`, { method: 'DELETE', headers: AUTH_HEADER() });
    setDirectors(p => p.filter(d => d.id !== id));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading…</div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Company Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Organisation profile, legal details and billing appearance</p>
        </div>
        <div className="flex items-center gap-3">
          {saved  && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
          {error  && <span className="text-sm text-red-500">{error}</span>}
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save All Changes'}
          </button>
        </div>
      </div>

      {/* ── Logo ── */}
      <Section title="Logo" subtitle="Appears on bills, reports and the application header" accent="#0d9488">
        <div className="flex items-center gap-6">
          <div className="w-28 h-28 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
            ) : (
              <div className="text-center">
                <svg className="w-8 h-8 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-slate-400 mt-1">No logo</p>
              </div>
            )}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            <button onClick={() => fileRef.current?.click()}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 shadow-sm">
              {uploading ? 'Uploading…' : 'Upload Logo'}
            </button>
            {logoPreview && (
              <button onClick={handleRemoveLogo}
                className="ml-3 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                Remove
              </button>
            )}
            {logoError && (
              <p className="text-xs text-red-600 mt-2 font-medium">{logoError}</p>
            )}
            <p className="text-xs text-slate-400 mt-2">PNG, JPG, SVG or WebP · Max 2 MB · Recommended 400 × 400 px</p>
          </div>
        </div>
      </Section>

      {/* ── Company Identity ── */}
      <Section title="Company Identity" subtitle="Trading name, tagline and online presence" accent="#2563eb">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Company / Organisation Name <span className="text-red-500">*</span></label>
            <input value={company.company_name||''} onChange={set('company_name')} className={inputCls} placeholder="e.g. ARIS Healthcare Pvt Ltd" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Tagline / Slogan</label>
            <input value={company.tagline||''} onChange={set('tagline')} className={inputCls} placeholder="e.g. Advancing Healthcare Through Technology" />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input value={company.website||''} onChange={set('website')} className={inputCls} placeholder="https://www.yourcompany.com" />
          </div>
          <div>
            <label className={labelCls}>Official Email</label>
            <input type="email" value={company.email||''} onChange={set('email')} className={inputCls} placeholder="info@yourcompany.com" />
          </div>
          <div>
            <label className={labelCls}>Primary Phone</label>
            <input value={company.phone||''} onChange={set('phone')} className={inputCls} placeholder="+91 XXXXX XXXXX" />
          </div>
          <div>
            <label className={labelCls}>Alternate Phone</label>
            <input value={company.alternate_phone||''} onChange={set('alternate_phone')} className={inputCls} placeholder="+91 XXXXX XXXXX" />
          </div>
        </div>
      </Section>

      {/* ── Address ── */}
      <Section title="Registered Address" subtitle="Used on invoices, bills and official documents" accent="#7c3aed">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Address Line 1</label>
            <input value={company.address_line1||''} onChange={set('address_line1')} className={inputCls} placeholder="Building / Street / Locality" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Address Line 2</label>
            <input value={company.address_line2||''} onChange={set('address_line2')} className={inputCls} placeholder="Area / Landmark (optional)" />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input value={company.city||''} onChange={set('city')} className={inputCls} placeholder="City" />
          </div>
          <div>
            <label className={labelCls}>State</label>
            <select value={company.state||''} onChange={set('state')} className={inputCls}>
              <option value="">— Select State —</option>
              {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>PIN Code</label>
            <input value={company.pincode||''} onChange={set('pincode')} className={inputCls} placeholder="6-digit PIN" maxLength={6} />
          </div>
          <div>
            <label className={labelCls}>Country</label>
            <input value={company.country||'India'} onChange={set('country')} className={inputCls} />
          </div>
        </div>
      </Section>

      {/* ── Legal & Tax ── */}
      <Section title="Legal & Tax Identifiers" subtitle="Statutory registration numbers for compliance and billing" accent="#ea580c">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>PAN Number</label>
            <input value={company.pan_number||''} onChange={set('pan_number')} className={inputCls}
              placeholder="AAAAA0000A" maxLength={10}
              style={{ textTransform: 'uppercase' }}
              onInput={e => e.target.value = e.target.value.toUpperCase()} />
          </div>
          <div>
            <label className={labelCls}>GSTIN</label>
            <input value={company.gstin||''} onChange={set('gstin')} className={inputCls}
              placeholder="22AAAAA0000A1Z5" maxLength={15}
              style={{ textTransform: 'uppercase' }}
              onInput={e => e.target.value = e.target.value.toUpperCase()} />
          </div>
          <div>
            <label className={labelCls}>TAN</label>
            <input value={company.tan||''} onChange={set('tan')} className={inputCls}
              placeholder="AAAA00000A" maxLength={10}
              style={{ textTransform: 'uppercase' }}
              onInput={e => e.target.value = e.target.value.toUpperCase()} />
          </div>
          <div>
            <label className={labelCls}>CIN (Company Identification No.)</label>
            <input value={company.cin||''} onChange={set('cin')} className={inputCls}
              placeholder="U85110KA2010PTC123456" maxLength={21}
              style={{ textTransform: 'uppercase' }}
              onInput={e => e.target.value = e.target.value.toUpperCase()} />
          </div>
          <div>
            <label className={labelCls}>MSME / Udyam Number</label>
            <input value={company.msme_number||''} onChange={set('msme_number')} className={inputCls} placeholder="UDYAM-XX-00-0000000" />
          </div>
          <div>
            <label className={labelCls}>Date of Incorporation</label>
            <input type="date" value={company.incorporation_date?.split('T')[0]||''} onChange={set('incorporation_date')} className={inputCls} />
          </div>
        </div>
      </Section>

      {/* ── Directors ── */}
      <Section title="Directors & Key Partners" subtitle="Authorised signatories and board members" accent="#0891b2">
        {directors.length === 0 && !showAddDir && (
          <p className="text-sm text-slate-400 mb-3">No directors added yet.</p>
        )}
        {directors.map(d => (
          <DirectorRow
            key={d.id}
            director={d}
            onSave={form => handleUpdateDirector(d.id, form)}
            onDelete={() => handleDeleteDirector(d.id)}
          />
        ))}
        {showAddDir && (
          <DirectorRow
            director={EMPTY_DIRECTOR}
            onSave={handleAddDirector}
            isNew
          />
        )}
        {!showAddDir && (
          <button onClick={() => setShowAddDir(true)}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Director / Partner
          </button>
        )}
      </Section>

      {/* ── Invoice / Bill Appearance ── */}
      <Section title="Invoice / Bill Print Settings" subtitle="Header, footer and terms printed on patient invoices and bills" accent="#be185d">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Invoice Header Text</label>
            <input value={company.bill_header_text||''} onChange={set('bill_header_text')} className={inputCls}
              placeholder="e.g. Tax Invoice — Original for Recipient" />
          </div>
          <div>
            <label className={labelCls}>Invoice Footer Text</label>
            <textarea value={company.bill_footer_text||''} onChange={set('bill_footer_text')} rows={2}
              className={inputCls} placeholder="e.g. Thank you for choosing ARIS Healthcare. All disputes subject to local jurisdiction." />
          </div>
          <div>
            <label className={labelCls}>Invoice Terms & Conditions</label>
            <textarea value={company.terms_and_conditions||''} onChange={set('terms_and_conditions')} rows={3}
              className={inputCls} placeholder="e.g. 1. Fees once paid are non-refundable. 2. Reports will be delivered within 24 hours…" />
          </div>
        </div>
      </Section>

      {/* ── Purchase Order Appearance ── */}
      <Section title="Purchase Order Print Settings" subtitle="Header, footer and terms printed on purchase orders (POs)" accent="#0369a1">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>PO Header Text</label>
            <input value={company.po_header_text||''} onChange={set('po_header_text')} className={inputCls}
              placeholder="e.g. Purchase Order — Please supply goods as per specifications below" />
          </div>
          <div>
            <label className={labelCls}>PO Footer Text</label>
            <textarea value={company.po_footer_text||''} onChange={set('po_footer_text')} rows={2}
              className={inputCls} placeholder="e.g. Authorised signatory required. Subject to Bengaluru jurisdiction." />
          </div>
          <div>
            <label className={labelCls}>PO Terms & Conditions</label>
            <textarea value={company.po_terms_conditions||''} onChange={set('po_terms_conditions')} rows={3}
              className={inputCls} placeholder="e.g. 1. Goods to be supplied as per specifications. 2. Subject to quality inspection on receipt. 3. Payment within 30 days of invoice." />
          </div>
        </div>
      </Section>

      {/* Sticky save reminder */}
      <div className="sticky bottom-4 flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl shadow-lg disabled:opacity-50">
          {saving ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>
    </div>
  );
};

export default SimpleSettingsPage;
