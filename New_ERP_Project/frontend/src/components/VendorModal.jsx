import { useState } from 'react';

const token = () => localStorage.getItem('token');
const apiFetch = (path, opts = {}) =>
  fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...opts.headers },
  });

const VENDOR_TYPES  = ['SUPPLIER', 'SERVICE', 'CONTRACTOR', 'UTILITY', 'OTHER'];

const INDIAN_BANKS = [
  'State Bank of India', 'Bank of Baroda', 'Bank of India', 'Bank of Maharashtra',
  'Canara Bank', 'Central Bank of India', 'Indian Bank', 'Indian Overseas Bank',
  'Punjab & Sind Bank', 'Punjab National Bank', 'UCO Bank', 'Union Bank of India',
  'Axis Bank', 'Bandhan Bank', 'City Union Bank', 'CSB Bank', 'DCB Bank',
  'Dhanlaxmi Bank', 'Federal Bank', 'HDFC Bank', 'ICICI Bank', 'IDBI Bank',
  'IDFC First Bank', 'IndusInd Bank', 'Jammu & Kashmir Bank', 'Karnataka Bank',
  'Karur Vysya Bank', 'Kotak Mahindra Bank', 'RBL Bank', 'South Indian Bank',
  'Tamilnad Mercantile Bank', 'Yes Bank',
  'AU Small Finance Bank', 'Equitas Small Finance Bank', 'ESAF Small Finance Bank',
  'Ujjivan Small Finance Bank', 'Utkarsh Small Finance Bank',
  'Airtel Payments Bank', 'India Post Payments Bank', 'Fino Payments Bank',
  'Citibank', 'DBS Bank', 'Deutsche Bank', 'HSBC Bank', 'Standard Chartered Bank',
  'Saraswat Bank', 'Cosmos Bank', 'Other',
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const EMPTY = {
  vendor_code: '', vendor_name: '', vendor_type: 'SUPPLIER', contact_person: '',
  phone: '', email: '', address: '', city: '', state: '', postal_code: '',
  is_taxpayer: true, gst_number: '', pan_number: '', payment_terms: '',
  bank_name: '', bank_account_number: '', ifsc_code: '', notes: '',
};

/**
 * Shared VendorModal — used by Vendors, Finance (AP), and Procurement pages.
 *
 * Props:
 *   vendor   — null → Add mode; vendor object → Edit mode
 *   onClose  — called when user cancels
 *   onSaved(vendor) — called after successful save, receives the saved vendor object
 */
export default function VendorModal({ vendor, onClose, onSaved }) {
  const [form, setForm] = useState(
    vendor ? { ...vendor, is_taxpayer: vendor.is_taxpayer ?? true } : { ...EMPTY }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setErr('');
    if (!form.vendor_code.trim()) return setErr('Vendor code is required');
    if (!form.vendor_name.trim()) return setErr('Vendor name is required');
    if (!form.address.trim())     return setErr('Address is required');
    if (!form.city.trim())        return setErr('City is required');
    if (!form.state)              return setErr('State is required');
    setSaving(true);
    try {
      const r = await apiFetch(
        vendor ? `/api/vendors/${vendor.id}` : '/api/vendors',
        { method: vendor ? 'PUT' : 'POST', body: JSON.stringify(form) }
      );
      const d = await r.json();
      if (!r.ok) { setErr(d.error || d.errors?.[0]?.msg || 'Failed'); setSaving(false); return; }
      onSaved(d.vendor);
    } catch { setErr('Network error'); setSaving(false); }
  };

  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
  const lbl = 'block text-xs font-semibold text-slate-600 mb-1.5';
  const sec = 'text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-3';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between rounded-t-2xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
          <div>
            <p className="text-white font-bold text-sm">{vendor ? 'Edit Vendor' : 'Add New Vendor'}</p>
            <p className="text-teal-200 text-xs mt-0.5">
              {vendor ? `Editing ${vendor.vendor_code}` : 'Saved to Vendor Master — available across all modules'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {err && (
            <div className="mx-5 mt-4">
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>
            </div>
          )}

          {/* Basic Information */}
          <div className="px-5 pt-4 pb-3">
            <p className={sec}>Basic Information</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Vendor Code <span className="text-red-500">*</span></label>
                  <input value={form.vendor_code} onChange={e => set('vendor_code', e.target.value)}
                    className={inp + ' uppercase font-mono'} placeholder="e.g. VEN-001" />
                </div>
                <div>
                  <label className={lbl}>Vendor Type <span className="text-red-500">*</span></label>
                  <select value={form.vendor_type} onChange={e => set('vendor_type', e.target.value)} className={inp}>
                    {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Vendor Name <span className="text-red-500">*</span></label>
                <input value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)}
                  className={inp} placeholder="e.g. Siemens Healthineers India" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Contact Person</label>
                  <input value={form.contact_person || ''} onChange={e => set('contact_person', e.target.value)}
                    className={inp} placeholder="Name" />
                </div>
                <div>
                  <label className={lbl}>Phone</label>
                  <input value={form.phone || ''} onChange={e => set('phone', e.target.value)}
                    className={inp} placeholder="+91 9XXXXXXXXX" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Email</label>
                  <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)}
                    className={inp} placeholder="vendor@email.com" />
                </div>
                <div>
                  <label className={lbl}>Payment Terms</label>
                  <input value={form.payment_terms || ''} onChange={e => set('payment_terms', e.target.value)}
                    className={inp} placeholder="e.g. Net 30" />
                </div>
              </div>
              <div>
                <label className={lbl}>Address <span className="text-red-500">*</span></label>
                <textarea rows={2} value={form.address || ''} onChange={e => set('address', e.target.value)}
                  className={inp + ' resize-none'} placeholder="Street / Building" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>City <span className="text-red-500">*</span></label>
                  <input value={form.city || ''} onChange={e => set('city', e.target.value)}
                    className={inp} placeholder="e.g. Kochi" />
                </div>
                <div>
                  <label className={lbl}>State <span className="text-red-500">*</span></label>
                  <select value={form.state || ''} onChange={e => set('state', e.target.value)} className={inp}>
                    <option value="">Select state…</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Postal Code</label>
                  <input value={form.postal_code || ''} onChange={e => set('postal_code', e.target.value)}
                    className={inp} placeholder="600001" />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 mx-5" />

          {/* Tax & Compliance */}
          <div className="px-5 py-3">
            <p className={sec}>Tax & Compliance</p>
            {/* Taxpayer toggle */}
            <div className="flex items-center gap-2 mb-3 cursor-pointer select-none w-fit"
              onClick={() => { const v = !form.is_taxpayer; set('is_taxpayer', v); if (!v) set('gst_number', ''); }}>
              <div style={{
                width: 36, height: 20, borderRadius: 999, position: 'relative', flexShrink: 0,
                background: form.is_taxpayer ? '#0d9488' : '#cbd5e1',
                transition: 'background 0.2s',
              }}>
                <div style={{
                  position: 'absolute', top: 2,
                  left: form.is_taxpayer ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  transition: 'left 0.15s',
                }} />
              </div>
              <span className="text-xs font-semibold text-slate-700">GST Registered (Taxpayer)</span>
              {!form.is_taxpayer && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">No GST on purchases</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>GSTIN {form.is_taxpayer && <span className="text-red-500">*</span>}</label>
                <input value={form.gst_number || ''} onChange={e => set('gst_number', e.target.value)}
                  disabled={!form.is_taxpayer}
                  className={inp + ' uppercase font-mono' + (!form.is_taxpayer ? ' bg-slate-100 text-slate-400 cursor-not-allowed' : '')}
                  placeholder={form.is_taxpayer ? '22AAAAA0000A1Z5' : 'N/A — not a taxpayer'} />
              </div>
              <div>
                <label className={lbl}>PAN Number</label>
                <input value={form.pan_number || ''} onChange={e => set('pan_number', e.target.value)}
                  className={inp + ' uppercase font-mono'} placeholder="AAAAA0000A" />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 mx-5" />

          {/* Bank Details */}
          <div className="px-5 py-3 pb-4">
            <p className={sec}>Bank Details <span className="text-slate-400 normal-case font-normal">(optional)</span></p>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Bank Name</label>
                <select value={form.bank_name || ''} onChange={e => set('bank_name', e.target.value)} className={inp}>
                  <option value="">— Select Bank —</option>
                  {INDIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Account Number</label>
                  <input value={form.bank_account_number || ''} onChange={e => set('bank_account_number', e.target.value)}
                    className={inp + ' font-mono'} placeholder="Account number" />
                </div>
                <div>
                  <label className={lbl}>IFSC Code</label>
                  <input value={form.ifsc_code || ''} onChange={e => set('ifsc_code', e.target.value)}
                    className={inp + ' uppercase font-mono'} placeholder="HDFC0001234" />
                </div>
              </div>
              <div>
                <label className={lbl}>Notes</label>
                <textarea rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)}
                  className={inp + ' resize-none'} placeholder="Optional notes…" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : vendor ? 'Save Changes' : 'Add Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}
