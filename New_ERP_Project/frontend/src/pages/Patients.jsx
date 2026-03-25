import { useState, useEffect } from 'react';
import { getPermissions } from '../utils/permissions';

const token = () => localStorage.getItem('token');
const api = (path, opts = {}) => fetch(path, {
  ...opts,
  headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...opts.headers },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const calcAge = dob => {
  if (!dob) return '—';
  const y = new Date().getFullYear() - new Date(dob).getFullYear();
  return `${y} yrs`;
};
const fmt = n => `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const MODALITY_BG = { MRI: '#6d28d9', CT: '#0369a1', XRAY: '#0f766e', ULTRASOUND: '#b45309', MAMMOGRAPHY: '#be185d', PET: '#7c2d12' };

// ── Small reusable pieces ─────────────────────────────────────────────────────
const Field = ({ label, required, hint, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
  </div>
);
const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const ModalityBadge = ({ m }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-white"
    style={{ background: MODALITY_BG[m] || '#475569' }}>{m}</span>
);

// ── Print Bill ────────────────────────────────────────────────────────────────
const PrintBill = ({ bill, patient, onClose }) => {
  const handlePrint = async () => {
    // Fetch live company settings
    let co = {};
    try {
      const r = await fetch('/api/settings/company', { headers: { Authorization: `Bearer ${token()}` } });
      const d = await r.json();
      co = d.company || {};
    } catch { /* ignore */ }
    if (!co.company_name) {
      try { co = { ...co, ...JSON.parse(localStorage.getItem('companyInfo') || '{}') }; } catch { /* ignore */ }
    }

    // Logo — prefer localStorage base64
    const lgc = (() => { try { return JSON.parse(localStorage.getItem('logoConfig')) || {}; } catch { return {}; } })();
    const logoSrc = lgc.customLogo || co.logo_path || null;

    const coName     = co.company_name || 'ARIS Healthcare';
    const coAddr     = [co.address_line1, co.address_line2].filter(Boolean).join(', ');
    const coCityLine = [co.city, co.state, co.pincode].filter(Boolean).join(', ');
    const coTaxLine  = co.gstin ? `GSTIN: ${co.gstin}` : '';
    const coContact  = [co.phone ? `Ph: ${co.phone}` : '', co.email || ''].filter(Boolean).join('  |  ');

    const billHeader = co.bill_header_text || '';
    const billFooter = co.bill_footer_text || 'Thank you for choosing our services. Wishing you good health!';
    const termsText  = co.terms_and_conditions || '';

    const AC = '#0d9488';
    const w = window.open('', '_blank');
    const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>Invoice ${bill.bill_number}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;font-size:12px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      .page{width:210mm;min-height:297mm;margin:0 auto;padding:0 0 24mm;position:relative}

      /* Header band */
      .hdr-band{background:linear-gradient(135deg,#0f766e 0%,#0d9488 60%,#14b8a6 100%);color:#fff;text-align:center;padding:7px 14mm;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;border-bottom:3px solid #0f766e}

      /* Main header */
      .hdr{display:flex;justify-content:space-between;align-items:center;padding:10px 14mm 10px;border-bottom:3px solid ${AC}}
      .hdr-left{flex:1}
      .hdr-center{flex:0 0 auto;display:flex;justify-content:center;align-items:center;padding:0 16px}
      .co-info{display:flex;flex-direction:column;gap:2px}
      .co-name{font-size:16px;font-weight:800;color:#1e293b;line-height:1.2}
      .co-line{font-size:9px;color:#64748b;line-height:1.5}
      .co-tax{font-size:9px;color:#475569;font-weight:600}
      .hdr-right{text-align:right;flex-shrink:0;flex:1}
      .inv-title{font-size:26px;font-weight:900;color:${AC};letter-spacing:-1px;line-height:1}
      .inv-meta{margin-top:6px;font-size:10px;line-height:1.9;color:#475569}
      .inv-meta b{color:#1e293b}
      .badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:9px;font-weight:700}
      .badge-paid{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
      .badge-pending{background:#fef3c7;color:#92400e;border:1px solid #fde68a}

      /* Body */
      .body{padding:0 14mm}

      /* Patient info box */
      .pt-box{background:#f0fdfa;border:1px solid #99f6e4;border-radius:7px;padding:10px 14px;margin:12px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:7px 18px}
      .pt-label{font-size:8px;text-transform:uppercase;font-weight:700;color:#94a3b8;letter-spacing:.05em}
      .pt-val{font-size:12px;font-weight:600;margin-top:1px;color:#1e293b}

      /* Table */
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      thead tr{background:${AC}}
      th{padding:8px 10px;text-align:left;font-size:9.5px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.05em}
      th.r,td.r{text-align:right}
      tbody tr:nth-child(even){background:#f0fdfa}
      td{padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#334155}

      /* Totals */
      .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:14px}
      .totals{width:240px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
      .tot-row{display:flex;justify-content:space-between;padding:5px 11px;font-size:11px;border-bottom:1px solid #f1f5f9;color:#475569}
      .tot-disc{color:#16a34a}
      .grand{display:flex;justify-content:space-between;padding:8px 11px;background:${AC};color:#fff;font-size:14px;font-weight:800}

      /* Notes */
      .notes-box{background:#f0fdfa;border:1px solid #99f6e4;border-radius:5px;padding:7px 11px;margin-bottom:12px;font-size:10px;color:#134e4a}

      /* Terms */
      .terms-box{margin-top:10px;padding-top:10px;border-top:1px dashed #e2e8f0;margin-bottom:12px}
      .terms-hdr{font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
      .t-line{display:flex;gap:5px;font-size:8.5px;color:#94a3b8;line-height:1.65;padding:1px 0}
      .t-num{flex-shrink:0;color:#64748b;font-weight:700;min-width:14px}

      /* Signature */
      .sig-row{display:flex;justify-content:space-between;margin-top:24px;padding-top:10px}
      .sig-box{text-align:center;width:160px}
      .sig-line{border-top:1px solid #334155;padding-top:5px;font-size:9px;color:#64748b}

      /* Footer band */
      .ftr-band{position:fixed;bottom:0;left:0;right:0;background:linear-gradient(135deg,#0f766e 0%,#0d9488 60%,#14b8a6 100%);border-top:3px solid #0f766e;padding:6px 14mm;display:flex;justify-content:space-between;align-items:center;font-size:8.5px;color:rgba(255,255,255,0.9)}
      .ftr-text{font-style:italic;color:rgba(255,255,255,0.75);flex:1;text-align:center;padding:0 12px}
    </style>
    </head><body>
    <div class="page">

      ${billHeader ? `<div class="hdr-band">${billHeader}</div>` : ''}

      <!-- Company Header -->
      <div class="hdr">
        <div class="hdr-left">
          <div class="co-info">
            <div class="co-name">${coName}</div>
            ${coAddr     ? `<div class="co-line">${coAddr}</div>` : ''}
            ${coCityLine ? `<div class="co-line">${coCityLine}</div>` : ''}
            ${coTaxLine  ? `<div class="co-tax">${coTaxLine}</div>` : ''}
            ${coContact  ? `<div class="co-line">${coContact}</div>` : ''}
          </div>
        </div>
        <div class="hdr-center">
          ${logoSrc ? `<img src="${logoSrc}" style="max-height:64px;max-width:160px;object-fit:contain;" />` : ''}
        </div>
        <div class="hdr-right">
          <div class="inv-title">INVOICE</div>
          <div class="inv-meta">
            <b>Bill #:</b> ${bill.bill_number || '—'}<br>
            <b>Date:</b> ${new Date(bill.bill_date || Date.now()).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}<br>
            <b>Status:</b>&nbsp;<span class="badge ${bill.payment_status === 'PAID' ? 'badge-paid' : 'badge-pending'}">${bill.payment_status}</span>
          </div>
        </div>
      </div>

      <div class="body">

        <!-- Patient Details -->
        <div class="pt-box">
          ${[['Patient', patient.name], ['PID', patient.pid || '—'], ['Phone', patient.phone || '—'], ['Gender', patient.gender || '—'], ['Age', calcAge(patient.date_of_birth)], ['Payment Mode', bill.payment_mode || '—']].map(([l, v]) => `<div><div class="pt-label">${l}</div><div class="pt-val">${v}</div></div>`).join('')}
        </div>

        <!-- Services Table -->
        <table>
          <thead><tr><th style="width:28px">#</th><th>Study / Service</th><th>Code</th><th class="r">Amount</th></tr></thead>
          <tbody>
            ${(bill.study_details || []).map((s, i) => `<tr><td>${i + 1}</td><td>${s.study_name}</td><td>${s.study_code || '—'}</td><td class="r">${fmt(s.rate)}</td></tr>`).join('')}
          </tbody>
        </table>

        <!-- Totals -->
        <div class="totals-wrap">
          <div class="totals">
            <div class="tot-row"><span>Subtotal</span><span>${fmt(bill.subtotal)}</span></div>
            ${bill.discount_amount > 0 ? `<div class="tot-row tot-disc"><span>Discount</span><span>− ${fmt(bill.discount_amount)}</span></div>` : ''}
            ${bill.gst_amount > 0 ? `<div class="tot-row"><span>GST</span><span>${fmt(bill.gst_amount)}</span></div>` : ''}
            <div class="grand"><span>Total</span><span>${fmt(bill.total_amount)}</span></div>
          </div>
        </div>

        ${bill.notes ? `<div class="notes-box"><b>Notes:</b> ${bill.notes}</div>` : ''}

        ${termsText ? `<div class="terms-box"><div class="terms-hdr">Terms &amp; Conditions</div>${termsText.split(/\r?\n/).filter(l=>l.trim()).map((l,i)=>`<div class="t-line"><span class="t-num">${i+1}.</span><span>${l.trim().replace(/^\d+[\.\)]\s*/,'')}</span></div>`).join('')}</div>` : ''}

        <div class="sig-row">
          <div style="flex:1"></div>
          <div class="sig-box"><div class="sig-line">Authorised Signatory</div></div>
        </div>

      </div>

      <!-- Footer Band -->
      <div class="ftr-band">
        <span style="white-space:nowrap">${coName}</span>
        <span class="ftr-text">${billFooter}</span>
        <span style="white-space:nowrap">Printed: ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>
      </div>

    </div></body></html>`;
    w.document.documentElement.innerHTML = html;
    setTimeout(() => w.print(), 500);
  };

  const isPaid = bill.payment_status === 'PAID';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'rgba(15,23,42,0.55)' }}>
      <div className="flex min-h-full items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col my-auto">

        {/* ── Top: success hero ── */}
        <div className="relative px-6 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(160deg, #0f766e 0%, #0d9488 60%, #14b8a6 100%)' }}>
          {/* close */}
          <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          {/* check circle */}
          <div className="mx-auto mb-3 w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
              <svg className="w-7 h-7" style={{ color: '#0d9488' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          </div>
          <p className="text-white font-extrabold text-xl leading-tight">{isPaid ? 'Payment Successful' : 'Bill Generated'}</p>
          <p className="text-teal-100 text-sm mt-1">{patient.name}{patient.pid ? <span className="font-mono ml-1 opacity-75">· {patient.pid}</span> : ''}</p>
          {/* bill meta row */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: isPaid ? '#dcfce7' : '#fef3c7', color: isPaid ? '#166534' : '#92400e' }}>
              {bill.payment_status}
            </span>
            <span className="text-teal-200 text-xs font-mono">#{bill.invoice_number || bill.bill_number || '—'}</span>
            <span className="text-teal-200 text-xs">{new Date(bill.bill_date || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>

        {/* ── Payment mode + reference chip row ── */}
        <div className="flex justify-center gap-2 -mt-3 relative z-10 flex-wrap px-6">
          <span className="px-4 py-1.5 rounded-full text-xs font-bold shadow-md border border-teal-100"
            style={{ background: '#f0fdfa', color: '#0f766e' }}>
            {bill.payment_mode || 'Cash'}
          </span>
          {bill.payment_reference && (
            <span className="px-4 py-1.5 rounded-full text-xs font-bold shadow-md border border-slate-200 flex items-center gap-1"
              style={{ background: '#f8fafc', color: '#475569' }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/>
              </svg>
              Ref: {bill.payment_reference}
            </span>
          )}
        </div>

        {/* ── Services list ── */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Services</p>
          <div className="space-y-1">
            {(bill.study_details || []).map((s, i) => (
              <div key={i} className="flex justify-between items-center px-3 py-2.5 rounded-xl" style={{ background: i % 2 === 0 ? '#f8fafc' : 'white' }}>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <span className="text-sm font-medium text-slate-700">{s.study_name}</span>
                  {s.item_type === 'CONTRAST' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#b45309' }}>Contrast</span>}
                  {s.item_type === 'DICOM_CD' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#ede9fe', color: '#6d28d9' }}>DICOM</span>}
                </div>
                <span className="text-sm font-bold text-slate-800">{fmt(s.rate)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Totals ── */}
        <div className="mx-6 mt-3 mb-4 rounded-2xl overflow-hidden border border-slate-200">
          <div className="px-4 py-3 space-y-2 bg-slate-50 border-b border-slate-200">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span><span>{fmt(bill.subtotal)}</span>
            </div>
            {bill.discount_amount > 0 && (
              <div className="flex justify-between text-sm font-medium text-green-600">
                <span>Discount</span><span>− {fmt(bill.discount_amount)}</span>
              </div>
            )}
            {bill.gst_amount > 0 && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>GST (18%)</span><span>{fmt(bill.gst_amount)}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between items-center px-4 py-4" style={{ background: 'linear-gradient(135deg, #f0fdfa, #ccfbf1)' }}>
            <span className="font-bold text-teal-800 text-base">Total Paid</span>
            <span className="font-extrabold text-teal-700 text-3xl tracking-tight">{fmt(bill.total_amount)}</span>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="px-6 pb-6 flex flex-col gap-2.5">
          <button onClick={handlePrint}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-white font-bold text-base transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #0f766e, #0d9488)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
            </svg>
            Print Invoice
          </button>
          <button onClick={onClose}
            className="w-full py-3 rounded-xl text-slate-500 font-semibold text-sm hover:bg-slate-100 transition-colors">
            Close
          </button>
        </div>

      </div>
      </div>
    </div>
  );
};

// ── Patient Registration Form ─────────────────────────────────────────────────
const PatientForm = ({ onSave, onCancel }) => {
  // Get center_id from the logged-in user stored at login
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; } })();
  const centerIdFromUser = currentUser.center_id || currentUser.centerId || null;

  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', gender: '', date_of_birth: '', email: '',
    blood_group: '', allergies: '', referring_physician_code: '',
    id_proof_type: '', id_proof_number: '',
  });
  const [physicians, setPhysicians] = useState([]);
  const [errors, setErrors]         = useState({});
  const [saving, setSaving]         = useState(false);
  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  useEffect(() => {
    api('/api/masters/referring-physician-master')
      .then(r => r.json())
      .then(d => setPhysicians(d.referring_physician_masters || []))
      .catch(() => {});
  }, []);

  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'Required';
    if (!form.phone.trim() || form.phone.replace(/\D/g, '').length < 10) e.phone = 'Valid 10-digit phone required';
    if (!form.gender) e.gender = 'Required';
    return e;
  };

  const handleSubmit = async ev => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      const fullName = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(' ');
      const payload = {
        name: fullName,
        phone: form.phone.replace(/\D/g, ''),
        gender: form.gender,
        has_insurance: false,
        ...(centerIdFromUser ? { center_id: parseInt(centerIdFromUser) } : {}),
        ...(form.date_of_birth   ? { date_of_birth: form.date_of_birth }             : {}),
        ...(form.email           ? { email: form.email }                              : {}),
        ...(form.blood_group     ? { blood_group: form.blood_group }                  : {}),
        ...(form.allergies       ? { allergies: form.allergies }                      : {}),
        ...(form.referring_physician_code ? { referring_physician_code: form.referring_physician_code } : {}),
        ...(form.id_proof_type   ? { id_proof_type: form.id_proof_type }     : {}),
        ...(form.id_proof_number ? { id_proof_number: form.id_proof_number } : {}),
      };
      const res  = await api('/api/patients', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok && (data.patient || data.id)) {
        onSave(data.patient || data);
      } else {
        const msg = data.errors?.[0]?.msg || data.error || 'Registration failed';
        setErrors({ submit: msg });
      }
    } catch { setErrors({ submit: 'Network error — check connection' }); }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Center info banner */}
      {centerIdFromUser && (
        <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs text-teal-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
          </svg>
          Patient will be registered under your centre (ID: {centerIdFromUser})
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="First Name" required>
          <input value={form.first_name} onChange={set('first_name')}
            className={`${inp} ${errors.first_name ? 'border-red-400' : ''}`}
            placeholder="e.g. Priya" />
          {errors.first_name && <p className="text-xs text-red-500 mt-0.5">{errors.first_name}</p>}
        </Field>
        <Field label="Last Name">
          <input value={form.last_name} onChange={set('last_name')} className={inp} placeholder="e.g. Menon" />
        </Field>
        <Field label="Phone" required>
          <input value={form.phone} onChange={set('phone')}
            className={`${inp} ${errors.phone ? 'border-red-400' : ''}`}
            placeholder="10-digit mobile" maxLength={10} />
          {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
        </Field>
        <Field label="Gender" required>
          <select value={form.gender} onChange={set('gender')}
            className={`${inp} ${errors.gender ? 'border-red-400' : ''}`}>
            <option value="">Select…</option>
            {['MALE','FEMALE','OTHER'].map(g => <option key={g} value={g}>{g[0] + g.slice(1).toLowerCase()}</option>)}
          </select>
          {errors.gender && <p className="text-xs text-red-500 mt-0.5">{errors.gender}</p>}
        </Field>
        <Field label="Date of Birth" hint="Used to calculate age">
          <input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} className={inp}
            max={new Date().toISOString().split('T')[0]} />
        </Field>
        <Field label="Blood Group">
          <select value={form.blood_group} onChange={set('blood_group')} className={inp}>
            <option value="">Unknown</option>
            {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(b => <option key={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={set('email')} className={inp} placeholder="optional" />
        </Field>
        <Field label="Referring Physician">
          <select value={form.referring_physician_code} onChange={set('referring_physician_code')} className={inp}>
            <option value="">— None —</option>
            {physicians.map(p => (
              <option key={p.physician_code} value={p.physician_code}>
                {p.physician_name}{p.specialty ? ` (${p.specialty})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ID Type">
          <select value={form.id_proof_type} onChange={set('id_proof_type')} className={inp}>
            <option value="">— None —</option>
            {['Aadhaar Card','PAN Card','Passport','Voter ID','Driving License','Employee ID','Other'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="ID #">
          <input value={form.id_proof_number} onChange={set('id_proof_number')} className={inp}
            placeholder="ID number" disabled={!form.id_proof_type} />
        </Field>
      </div>
      <Field label="Allergies / Medical Notes">
        <textarea value={form.allergies} onChange={set('allergies')} className={`${inp} resize-none`} rows={2}
          placeholder="e.g. Penicillin allergy, contrast dye sensitivity…" />
      </Field>
      {errors.submit && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errors.submit}</p>
      )}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 disabled:opacity-60 shadow-sm">
          {saving ? 'Registering…' : 'Register & Continue to Billing →'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200">
          Cancel
        </button>
      </div>
    </form>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Patients() {
  const isCorp = (() => { try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return !u.center_id && !u.centerId; } catch { return false; } })();
  const myCenter = (() => { try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return u.center_id || u.centerId || null; } catch { return null; } })();
  const { has } = getPermissions();

  const [mode, setMode]           = useState('idle'); // idle | register | billing
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [patient, setPatient]     = useState(null);
  const [studies, setStudies]         = useState([]);
  const [centerModalities, setCenterModalities] = useState([]);
  const [centers, setCenters]         = useState([]);
  const [billingCenterId, setBillingCenterId] = useState('');
  const [cart, setCart]           = useState([]);
  const [studyQ, setStudyQ]       = useState('');
  const [modality, setModality]   = useState('');
  const [discount, setDiscount]   = useState({ type: 'percent', value: '' });
  const [payMode, setPayMode]     = useState('CASH');
  const [payStatus, setPayStatus] = useState('PAID');
  const [gst, setGst]             = useState(false);
  const [notes, setNotes]         = useState('');
  const [payRef, setPayRef]       = useState('');
  const [creating, setCreating]   = useState(false);
  const [billResult, setBillResult] = useState(null);
  const [billError, setBillError]   = useState('');
  const [history, setHistory]       = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Add-ons
  const [contrastOptions, setContrastOptions]   = useState([]);
  const [contrastSelected, setContrastSelected] = useState(''); // id string in dropdown
  const [contrastLines, setContrastLines]       = useState([]); // added lines: [{ id, name, price, qty }]
  const [dicomItem, setDicomItem]               = useState(null);
  const [dicomChecked, setDicomChecked]         = useState(true);

  useEffect(() => {
    if (!isCorp) return;
    api('/api/centers').then(r => r.json()).then(d => setCenters(d.centers || d || [])).catch(() => {});
  }, [isCorp]);

  // Reload studies/modalities whenever the billing center changes
  useEffect(() => {
    if (!billingCenterId) { setStudies([]); setCenterModalities([]); return; }
    Promise.all([
      api(`/api/masters/study-definitions?active_only=true&center_id=${billingCenterId}`).then(r => r.json()),
      api(`/api/masters/center-modalities?center_id=${billingCenterId}`).then(r => r.json()),
    ]).then(([studyData, modData]) => {
      setStudies(studyData.studies || []);
      setCenterModalities(modData.modalities || []);
    }).catch(() => {});
  }, [billingCenterId]);

  // Debounced patient search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const centerParam = !isCorp && myCenter ? `&center_id=${encodeURIComponent(myCenter)}` : '';
        const r = await api(`/api/patients/quick-search?search_term=${encodeURIComponent(query)}${centerParam}`);
        const d = await r.json();
        setResults(d.patients || d || []);
      } catch { setResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const selectPatient = async p => {
    setQuery(''); setResults([]); setCart([]); setBillResult(null); setBillError('');
    const r = await api(`/api/patients/${p.id}`);
    const d = await r.json();
    const pat = d.patient || d;
    setPatient(pat);
    setBillingCenterId(String(pat.center_id || ''));
    setMode('billing');
    const hr = await api(`/api/patients/${p.id}/with-studies`);
    const hd = await hr.json();
    setHistory(hd.studies || hd.patient?.studies || []);
  };

  const handleRegistered = p => {
    setPatient(p);
    setBillingCenterId(String(p.center_id || ''));
    setMode('billing');
    setCart([]);
  };

  const toggleStudy = s => setCart(c =>
    c.find(x => x.study_code === s.study_code) ? c.filter(x => x.study_code !== s.study_code) : [...c, s]
  );

  // Fetch add-ons when cart changes
  useEffect(() => {
    // Get unique modalities of contrast studies in cart
    const contrastModalities = [...new Set(
      cart.filter(s => s.is_contrast_study).map(s => s.modality).filter(Boolean)
    )];

    Promise.all([
      // Fetch contrast services for each modality, then deduplicate by id
      ...contrastModalities.map(m =>
        api(`/api/service-management/services/addons/contrast?modality=${m}`).then(r => r.json()).catch(() => null)
      ),
      api('/api/service-management/services/addons').then(r => r.json()).catch(() => null),
    ]).then(results => {
      const allAddonRes = results[results.length - 1];
      const contrastResults = results.slice(0, contrastModalities.length);

      // Merge and deduplicate contrast options
      const seen = new Set();
      const merged = [];
      contrastResults.forEach(res => {
        (res?.data || []).forEach(item => {
          if (!seen.has(item.id)) { seen.add(item.id); merged.push(item); }
        });
      });
      setContrastOptions(merged);
      if (contrastModalities.length === 0) setContrastLines([]);

      const dicom = (allAddonRes?.data || []).find(s => s.item_type === 'DICOM_CD' && s.is_active);
      setDicomItem(dicom ? { id: dicom.id, name: dicom.name, price: dicom.price } : null);
    });
  }, [cart]);

  const updateContrastQty = (id, qty) => {
    if (qty < 1) { setContrastLines(l => l.filter(x => x.id !== id)); return; }
    setContrastLines(l => l.map(x => x.id === id ? { ...x, qty } : x));
  };

  // Bill maths — include add-ons
  const addonTotal = contrastLines.reduce((s, l) => s + Number(l.price) * l.qty, 0)
                   + (dicomChecked && dicomItem ? Number(dicomItem.price) : 0);
  const subtotal    = cart.reduce((s, x) => s + parseFloat(x.center_price || x.base_rate || 0), 0) + addonTotal;
  const discountAmt = discount.value
    ? discount.type === 'percent' ? (subtotal * parseFloat(discount.value)) / 100 : parseFloat(discount.value)
    : 0;
  const afterDis = Math.max(0, subtotal - discountAmt);
  const gstAmt   = gst ? afterDis * 0.18 : 0;
  const total    = afterDis + gstAmt;

  const handleBill = async () => {
    if (creating || !cart.length) { if (!cart.length) setBillError('Select at least one study.'); return; }
    setCreating(true); setBillError('');
    try {
      const body = {
        patient_id: patient.id,
        center_id: (!isCorp && myCenter) ? myCenter : (billingCenterId || patient.center_id || centers[0]?.id),
        study_codes: cart.map(s => s.study_code),
        addon_contrast_lines: contrastLines.length > 0 ? contrastLines.map(l => ({ id: l.id, name: l.name, price: Number(l.price), qty: l.qty })) : null,
        addon_dicom: dicomChecked && dicomItem ? { id: dicomItem.id, name: dicomItem.name, price: Number(dicomItem.price), qty: 1 } : null,
        payment_mode: payMode,
        payment_status: payStatus,
        gst_applicable: gst,
        gst_rate: gst ? 0.18 : 0,
        discount_amount: discountAmt,
        ...(discountAmt > 0 ? { discount_reason: `${discount.type === 'percent' ? discount.value + '%' : '₹' + discount.value} discount` } : {}),
        ...(payRef.trim() ? { payment_reference: payRef.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const r = await api('/api/billing/patient-bill', { method: 'POST', body: JSON.stringify(body) });
      const d = await r.json();
      if (r.ok && (d.bill || d.bill_number)) {
        const bill = d.bill || d;
        setBillResult({
          ...bill,
          study_details: [
            ...cart.map(s => ({ study_name: s.study_name, study_code: s.study_code, rate: s.center_price || s.base_rate, item_type: 'STUDY' })),
            ...contrastLines.map(l => ({ study_name: l.name, study_code: null, rate: Number(l.price) * l.qty, qty: l.qty, item_type: 'CONTRAST' })),
            ...(dicomChecked && dicomItem ? [{ study_name: dicomItem.name, study_code: null, rate: Number(dicomItem.price), qty: 1, item_type: 'DICOM_CD' }] : []),
          ],
          subtotal, discount_amount: discountAmt, gst_amount: gstAmt, total_amount: total,
          payment_mode: payMode, payment_status: payStatus,
          payment_reference: payRef.trim() || null,
        });
        setCart([]);  // clear cart so a re-press cannot create a duplicate
      } else {
        setBillError(d.errors?.[0]?.msg || d.error || 'Billing failed');
      }
    } catch { setBillError('Network error'); }
    finally { setCreating(false); }
  };

  // If center modalities loaded, restrict to those; otherwise show all from studies
  const modalities = centerModalities.length > 0
    ? centerModalities
    : [...new Set(studies.map(s => s.modality).filter(Boolean))].sort();

  const visibleStudies = studies.filter(s =>
    (centerModalities.length === 0 || centerModalities.includes(s.modality)) &&
    (!modality || s.modality === modality) &&
    (!studyQ   || s.study_name.toLowerCase().includes(studyQ.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Page Header */}
      <div className="px-6 pt-6 pb-0"
        style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f766e 60%,#0d9488 100%)' }}>
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Patient Registration &amp; Billing</h1>
              <p className="text-teal-200 text-sm mt-0.5">Register patients · Schedule studies · Create bills</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Top search bar ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={query} onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
              placeholder="Search patient by name, phone, or PID…" autoComplete="off" />
            {/* Dropdown */}
            {(results.length > 0 || (searching && query)) && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-2xl z-30 max-h-80 overflow-y-auto">
                {searching && <p className="text-xs text-slate-400 text-center py-3">Searching…</p>}
                {!searching && results.length === 0 && query.length > 1 && (
                  <p className="text-xs text-slate-400 text-center py-3">No patients found</p>
                )}
                {results.map(p => (
                  <button key={p.id} onClick={() => selectPatient(p)}
                    className="w-full text-left px-4 py-3 hover:bg-teal-50 border-b border-slate-100 last:border-0 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm flex-shrink-0">
                      {p.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {p.pid && <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded mr-2">{p.pid}</span>}
                        {p.phone}
                        {p.date_of_birth && <span className="ml-2 text-slate-400">· {calcAge(p.date_of_birth)}</span>}
                      </p>
                    </div>
                    <span className="text-xs text-teal-600 font-medium flex-shrink-0">Select →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {has('PATIENT_WRITE') && (
            <button onClick={() => { setMode('register'); setPatient(null); setCart([]); setBillResult(null); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 shadow-sm flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Patient
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-6 pb-0 overflow-hidden">

        {/* ── Idle ── */}
        {mode === 'idle' && (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-24 h-24 rounded-full bg-teal-50 flex items-center justify-center mb-5">
              <svg className="w-12 h-12 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-700">Patient & Billing</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-md">
              Search for an existing patient by name, phone or PID — or register a new patient to begin billing.
            </p>
            {has('PATIENT_WRITE') && (
              <button onClick={() => setMode('register')}
                className="mt-6 px-6 py-3 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 shadow-sm text-sm">
                + Register New Patient
              </button>
            )}
          </div>
        )}

        {/* ── Register ── */}
        {mode === 'register' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-5 bg-gradient-to-r from-teal-600 to-teal-700">
                <h2 className="text-white font-bold text-xl">New Patient Registration</h2>
                <p className="text-teal-200 text-xs mt-1">PID will be auto-generated · Only Name, Phone & Gender are mandatory</p>
              </div>
              <div className="px-6 py-6">
                <PatientForm centers={centers} onSave={handleRegistered} onCancel={() => setMode('idle')} />
              </div>
            </div>
          </div>
        )}

        {/* ── Billing ── */}
        {mode === 'billing' && patient && (
          <div className="space-y-4">

            {/* ── Patient banner ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-2" style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)' }}>
                <div className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {patient.name?.[0]?.toUpperCase()}
                </div>
                <span className="text-white font-bold text-sm">{patient.name}</span>
                {patient.pid && <span className="text-teal-200 text-xs font-mono">· {patient.pid}</span>}
                {patient.date_of_birth && <><span className="text-white/25">·</span><span className="text-teal-100 text-xs">{calcAge(patient.date_of_birth)}</span></>}
                <div className="flex-1" />
                <button onClick={() => setShowHistory(v => !v)}
                  className="px-2 py-0.5 bg-white/15 hover:bg-white/25 text-white text-xs font-medium rounded border border-white/20 transition-colors">
                  {showHistory ? 'Hide History' : 'History'}
                </button>
                <button onClick={() => { setMode('register'); setPatient(null); setCart([]); }}
                  className="px-2 py-0.5 bg-white text-teal-700 text-xs font-bold rounded hover:bg-teal-50 transition-colors">
                  + New
                </button>
              </div>
              {/* History drawer */}
              {showHistory && (
                <div className="border-t border-slate-100 px-5 py-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Previous Studies ({history.length})</p>
                  {history.length === 0
                    ? <p className="text-xs text-slate-400 py-2">No study history found</p>
                    : (
                      <div className="flex gap-2 flex-wrap">
                        {history.map((s, i) => (
                          <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                            {s.modality && <ModalityBadge m={s.modality} />}
                            <span className="text-xs font-medium text-slate-700">{s.study_name || s.requested_procedure || 'Study'}</span>
                            {s.appointment_date && <span className="text-xs text-slate-400">{new Date(s.appointment_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</span>}
                          </div>
                        ))}
                      </div>
                    )
                  }
                </div>
              )}
            </div>

            {/* ── Main billing area — both panels same fixed height, scroll internally ── */}
            <div className="grid grid-cols-2 gap-4" style={{ height: 'calc(100vh - 210px)' }}>

              {/* LEFT — Study catalog */}
              <div className="flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                {/* Header — matches right panel */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800">Studies & Services</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{visibleStudies.length} available · click to add</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCorp && (
                      <select
                        value={billingCenterId}
                        onChange={e => { setBillingCenterId(e.target.value); setCart([]); }}
                        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                        <option value="">— Select Center —</option>
                        {centers.filter(c => c.active !== false && c.corporate_entity_id != null).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                    {cart.length > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ background: '#0d9488' }}>
                        {cart.length} selected
                      </span>
                    )}
                  </div>
                </div>

                {/* Search */}
                <div className="px-4 py-3 border-b border-slate-100">
                  <input value={studyQ} onChange={e => setStudyQ(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
                    placeholder="Search by name or code…" />
                </div>

                {/* Modality filter tabs */}
                <div className="flex gap-1.5 px-4 py-2.5 border-b border-slate-100 overflow-x-auto">
                  {['', ...modalities].map(m => (
                    <button key={m || 'all'} onClick={() => setModality(m)}
                      className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all"
                      style={modality === m
                        ? { background: m ? (MODALITY_BG[m] || '#0d9488') : '#0d9488', color: '#fff' }
                        : { background: '#f1f5f9', color: '#64748b' }}>
                      {m || 'All'}
                    </button>
                  ))}
                </div>

                {/* Study rows — fills remaining panel height */}
                <div className="flex-1 overflow-y-auto">
                  {visibleStudies.length === 0
                    ? <p className="text-sm text-slate-400 text-center py-12">No studies found</p>
                    : visibleStudies.map(s => {
                        const sel = !!cart.find(x => x.study_code === s.study_code);
                        const mColor = MODALITY_BG[s.modality] || '#0d9488';
                        return (
                          <button key={s.study_code} onClick={() => toggleStudy(s)}
                            className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 transition-colors text-left group"
                            style={sel ? { background: '#f0fdfa' } : {}}>
                            <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: mColor, minHeight: '36px' }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{s.study_name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-bold px-1.5 py-0.5 rounded text-white" style={{ background: mColor, fontSize: '10px' }}>{s.modality}</span>
                                <span className="text-xs text-slate-400 font-mono">{s.study_code}</span>
                                {s.is_contrast_study && <span className="px-1.5 py-0.5 rounded text-white font-bold" style={{ background: '#d97706', fontSize: '9px' }}>Contrast</span>}
                              </div>
                            </div>
                            <span className="text-sm font-bold flex-shrink-0" style={{ color: sel ? '#0d9488' : '#334155' }}>{fmt(s.center_price || s.base_rate)}</span>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                              style={sel ? { background: '#0d9488' } : { background: '#f1f5f9' }}>
                              {sel
                                ? <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                                : <svg className="w-4 h-4 text-slate-400 group-hover:text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                              }
                            </div>
                          </button>
                        );
                      })
                  }
                </div>
              </div>

              {/* RIGHT — Bill panel */}
              <div className="flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                {/* Header — matches left panel */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800">Bill Summary</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{patient.name} · {patient.pid || 'No PID'}</p>
                  </div>
                  {cart.length > 0 && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ background: '#0d9488' }}>
                      {cart.length} items
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">

                  {/* Cart */}
                  {cart.length === 0
                    ? (
                      <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                        <p className="text-sm text-slate-400 font-medium">No studies added yet</p>
                        <p className="text-xs text-slate-300 mt-1">Select from the left panel</p>
                      </div>
                    )
                    : (
                      <div className="divide-y divide-slate-100">
                        {cart.map(s => (
                          <div key={s.study_code} className="flex items-center gap-3 py-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-700 leading-tight truncate">{s.study_name}</p>
                              <p className="text-xs text-slate-400 font-mono mt-0.5">{s.study_code}</p>
                            </div>
                            <span className="text-sm font-bold text-slate-800 flex-shrink-0">{fmt(s.center_price || s.base_rate)}</span>
                            <button onClick={() => toggleStudy(s)} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  }

                  {/* Add-ons — contrast dropdown + DICOM checkbox */}
                  {(contrastOptions.length > 0 || dicomItem) && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add-on Services</p>

                      {contrastOptions.length > 0 && (
                        <div className="bg-white rounded-lg px-3 py-2.5 border border-amber-100 space-y-2">
                          <p className="text-xs font-semibold text-amber-700">Contrast Services</p>
                          {/* Dropdown + Add */}
                          <div className="flex items-center gap-2">
                            <select
                              value={contrastSelected}
                              onChange={e => setContrastSelected(e.target.value)}
                              className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                            >
                              <option value="">— Select service —</option>
                              {contrastOptions.map(o => (
                                <option key={o.id} value={o.id}>{o.name} — ₹{Number(o.price).toFixed(2)}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                const opt = contrastOptions.find(o => o.id === parseInt(contrastSelected));
                                if (!opt) return;
                                setContrastLines(lines => {
                                  const ex = lines.find(l => l.id === opt.id);
                                  return ex ? lines.map(l => l.id === opt.id ? { ...l, qty: l.qty + 1 } : l)
                                            : [...lines, { id: opt.id, name: opt.name, price: opt.price, qty: 1 }];
                                });
                                setContrastSelected('');
                              }}
                              disabled={!contrastSelected}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                            >Add</button>
                          </div>
                          {/* Added lines */}
                          {contrastLines.length > 0 && (
                            <div className="space-y-1 border-t border-amber-100 pt-2">
                              {contrastLines.map(l => (
                                <div key={l.id} className="flex items-center gap-2 bg-amber-50 rounded px-2 py-1.5">
                                  <span className="text-xs text-slate-700 flex-1 truncate">{l.name}</span>
                                  <button onClick={() => updateContrastQty(l.id, l.qty - 1)} className="w-6 h-6 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 text-sm font-bold flex items-center justify-center flex-shrink-0">−</button>
                                  <span className="w-5 text-center text-xs font-semibold text-slate-700">{l.qty}</span>
                                  <button onClick={() => updateContrastQty(l.id, l.qty + 1)} className="w-6 h-6 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 text-sm font-bold flex items-center justify-center flex-shrink-0">+</button>
                                  <span className="text-xs font-bold text-amber-700 w-14 text-right flex-shrink-0">₹{(Number(l.price) * l.qty).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {dicomItem && (
                        <div className="bg-white rounded-lg px-3 py-2.5 border border-orange-100 space-y-1.5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={dicomChecked}
                              onChange={e => setDicomChecked(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span className="text-xs font-semibold text-orange-700">DICOM CD</span>
                            <span className="text-xs text-slate-500 flex-1">{dicomItem.name}</span>
                            <span className="text-xs font-bold text-slate-700">₹{Number(dicomItem.price).toFixed(2)}</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Divider */}
                  <div className="border-t border-slate-100" />

                  {/* Discount */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Discount</label>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                      <select value={discount.type} onChange={e => setDiscount(d => ({ ...d, type: e.target.value }))}
                        className="px-2 py-2 text-xs bg-slate-50 border-r border-slate-200 focus:outline-none font-semibold text-slate-600">
                        <option value="percent">%</option>
                        <option value="fixed">₹</option>
                      </select>
                      <input type="number" min="0" value={discount.value}
                        onChange={e => setDiscount(d => ({ ...d, value: e.target.value }))}
                        className="flex-1 px-2.5 py-2 text-sm focus:outline-none w-0 text-slate-800" placeholder="0" />
                    </div>
                  </div>

                  {/* Payment mode — compact 3-col grid */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Payment Mode</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[['CASH','💵','Cash'],['UPI','📱','UPI'],['CARD','💳','Card'],['BANK_TRANSFER','🏦','Bank'],['INSURANCE','🏥','Insurance'],['COMBINED','🔀','Split']].map(([m, icon, label]) => (
                        <button key={m} onClick={() => setPayMode(m)}
                          className="py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center justify-center gap-1"
                          style={payMode === m
                            ? { background: '#0d9488', color: '#fff', borderColor: '#0d9488' }
                            : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }}>
                          <span>{icon}</span>
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment Reference — shown for non-cash modes */}
                  {payMode !== 'CASH' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                        Payment Reference #
                      </label>
                      <input
                        value={payRef} onChange={e => setPayRef(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 placeholder-slate-300"
                        placeholder={payMode === 'UPI' ? 'UPI transaction ID…' : payMode === 'CARD' ? 'Card approval code…' : payMode === 'BANK_TRANSFER' ? 'Bank ref / UTR number…' : 'Reference number…'}
                      />
                    </div>
                  )}

                  {/* Paid / Pending */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Payment Status</label>
                    <div className="grid grid-cols-2 rounded-lg border border-slate-200 overflow-hidden">
                      {[['PAID','✓ Paid'],['BILLED','⏳ Pending']].map(([v, label]) => (
                        <button key={v} onClick={() => setPayStatus(v)}
                          className="py-2 text-xs font-bold transition-all"
                          style={payStatus === v
                            ? { background: v === 'PAID' ? '#0d9488' : '#f59e0b', color: '#fff' }
                            : { background: '#f8fafc', color: '#94a3b8' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* GST toggle */}
                  <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-xs font-semibold text-slate-700">GST (18%)</p>
                      <p className="text-xs text-slate-400">on taxable amount</p>
                    </div>
                    <div onClick={() => setGst(v => !v)}
                      className="relative cursor-pointer flex items-center flex-shrink-0"
                      style={{ background: gst ? '#0d9488' : '#cbd5e1', height: '24px', width: '44px', borderRadius: '12px', padding: '2px', transition: 'background 0.2s' }}>
                      <div className="bg-white rounded-full shadow transition-transform"
                        style={{ width: '20px', height: '20px', transform: gst ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.2s' }} />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none text-slate-600 placeholder-slate-300 bg-slate-50"
                      rows={2} placeholder="Clinical notes, referral info…" />
                  </div>

                  {/* Totals */}
                  <div className="rounded-xl border border-teal-100 overflow-hidden">
                    <div className="px-4 py-3 space-y-2" style={{ background: '#f0fdfa' }}>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Subtotal</span><span className="font-semibold">{fmt(subtotal)}</span>
                      </div>
                      {discountAmt > 0 && (
                        <div className="flex justify-between text-sm text-green-700">
                          <span>Discount {discount.type === 'percent' ? `(${discount.value}%)` : '(Fixed)'}</span>
                          <span className="font-semibold">− {fmt(discountAmt)}</span>
                        </div>
                      )}
                      {gstAmt > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>GST (18%)</span><span className="font-semibold">{fmt(gstAmt)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Payment</span><span className="font-semibold">{payMode}</span>
                      </div>
                      {payRef.trim() && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Ref #</span>
                          <span className="font-semibold font-mono text-teal-700">{payRef.trim()}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between items-center px-4 py-3 border-t border-teal-200" style={{ background: '#ccfbf1' }}>
                      <span className="font-bold text-teal-900">Total Amount</span>
                      <span className="font-extrabold text-teal-800 text-xl">{fmt(total)}</span>
                    </div>
                  </div>

                  {billError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{billError}</p>
                  )}

                  {/* Generate button */}
                  <button onClick={handleBill} disabled={creating || !cart.length}
                    className="w-full py-3 text-white font-bold rounded-xl text-sm shadow-sm transition-all"
                    style={{
                      background: creating || !cart.length ? '#94a3b8' : 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
                      cursor: creating || !cart.length ? 'not-allowed' : 'pointer',
                    }}>
                    {creating ? '⏳ Generating…' : cart.length ? `🧾 Generate Bill · ${fmt(total)}` : 'Select studies to continue'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Print modal ── */}
      {billResult && <PrintBill bill={billResult} patient={patient} onClose={() => setBillResult(null)} />}
    </div>
  );
}
