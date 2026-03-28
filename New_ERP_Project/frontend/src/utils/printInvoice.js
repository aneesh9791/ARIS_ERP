// ── Shared A5 invoice print utility ──────────────────────────────────────────
// Used by both Patients.jsx (billing) and PatientHistory.jsx (history).
// Caller must open the print window synchronously on user gesture (iOS Safari),
// then pass it as `printWin`.  Desktop fallback opens it here if not provided.
//
// data shape:
//   invoiceNumber, billDate, paymentStatus,
//   accessionNumber?,
//   patientName, pid, phone, gender, dateOfBirth, paymentMode,
//   referringPhysicianName?,
//   notes?,
//   items: [{ name, detail, amount }]   ← detail = modality or study code
//   itemDetailLabel?                     ← column header for detail (default 'Detail')
//   subtotal, discountAmount, gst, totalAmount

const token = () => localStorage.getItem('authToken') || '';

const fmtAmt = n =>
  `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const fmtDate = v => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const calcAge = dob => {
  if (!dob) return '—';
  const y = new Date().getFullYear() - new Date(dob).getFullYear();
  return `${y} yrs`;
};

const esc = s =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const printInvoice = async (data, printWin = null) => {
  const w = printWin || window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups for this site to print invoices.'); return; }

  w.document.write('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#64748b">Preparing invoice…</body></html>');
  w.document.close();

  // ── Fetch company settings ─────────────────────────────────────────────────
  let co = {};
  try {
    const r = await fetch('/api/settings/company', { headers: { Authorization: `Bearer ${token()}` } });
    co = (await r.json()).company || {};
  } catch { /* ignore */ }
  if (!co.company_name) {
    try { co = { ...co, ...JSON.parse(localStorage.getItem('companyInfo') || '{}') }; } catch { /* ignore */ }
  }

  const lgc = (() => { try { return JSON.parse(localStorage.getItem('logoConfig')) || {}; } catch { return {}; } })();
  const logoSrc    = lgc.customLogo || co.logo_path || null;
  const coName     = co.company_name || 'ARIS Healthcare';
  const coAddr     = [co.address_line1, co.address_line2].filter(Boolean).join(', ');
  const coCityLine = [co.city, co.state, co.pincode].filter(Boolean).join(', ');
  const coTaxLine  = co.gstin ? `GSTIN: ${co.gstin}` : '';
  const coContact  = [co.phone ? `Ph: ${co.phone}` : '', co.email || ''].filter(Boolean).join('  |  ');
  const billHeader = co.bill_header_text || '';
  const billFooter = co.bill_footer_text || 'Thank you for choosing our services. Wishing you good health!';
  const termsText  = co.terms_and_conditions || '';

  const AC             = '#0d9488';
  const detailLabel    = data.itemDetailLabel || 'Detail';
  const {
    invoiceNumber, billDate, paymentStatus, accessionNumber,
    patientName, pid, phone, gender, dateOfBirth, paymentMode,
    referringPhysicianName, notes,
    items = [],
    subtotal, discountAmount, gst, totalAmount,
  } = data;

  // Patient info fields — 2-column grid for readability at larger font
  const ptFields = [
    ['Patient',      patientName],
    ['PID',          pid || '—'],
    ['Phone',        phone || '—'],
    ['Gender',       gender || '—'],
    ['Age',          calcAge(dateOfBirth)],
    ['Payment',      paymentMode || '—'],
    ...(referringPhysicianName ? [['Ref. Physician', referringPhysicianName]] : []),
  ];

  const html = `<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <title>Invoice ${esc(invoiceNumber || '')}</title>
  <style>
    /* ── Reset ── */
    *{box-sizing:border-box;margin:0;padding:0}

    /* ── Page ── */
    @page{size:148mm 210mm;margin:0}
    html,body{width:148mm;margin:0;padding:0;background:#fff}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;font-size:11px;
         -webkit-print-color-adjust:exact;print-color-adjust:exact}
    @media print{#printBtn{display:none}html,body{width:148mm}}

    .page{width:148mm;min-height:210mm;display:flex;flex-direction:column}

    /* ── Header band ── */
    .hdr-band{background:linear-gradient(135deg,#0f766e 0%,#0d9488 60%,#14b8a6 100%);
      color:#fff;text-align:center;padding:4px 8mm;font-size:8.5px;font-weight:700;
      letter-spacing:.12em;text-transform:uppercase;border-bottom:2px solid #0f766e;flex-shrink:0}

    /* ── Company header ── */
    .hdr{display:flex;justify-content:space-between;align-items:center;
         padding:7px 8mm;border-bottom:2px solid ${AC};flex-shrink:0}
    .hdr-left{flex:1;min-width:0}
    .hdr-center{flex:0 0 auto;display:flex;justify-content:center;align-items:center;padding:0 8px}
    .co-info{display:flex;flex-direction:column;gap:1px}
    .co-name{font-size:13px;font-weight:800;color:#1e293b;line-height:1.2}
    .co-line{font-size:8.5px;color:#1e293b;line-height:1.5}
    .co-tax{font-size:8.5px;color:#1e293b;font-weight:700}
    .hdr-right{text-align:right;flex:1}
    .inv-title{font-size:18px;font-weight:900;color:${AC};letter-spacing:-1px;line-height:1}
    .inv-meta{margin-top:4px;font-size:8.5px;line-height:1.8;color:#1e293b}
    .inv-meta b{color:#1e293b}
    .badge{display:inline-block;padding:1px 6px;border-radius:20px;font-size:8px;font-weight:700}
    .badge-paid{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
    .badge-pending{background:#fef3c7;color:#92400e;border:1px solid #fde68a}

    /* ── Body ── */
    .body{flex:1;padding:6px 8mm}

    /* ── Patient box — 2 columns for better readability ── */
    .pt-box{background:#f0fdfa;border:1px solid #99f6e4;border-radius:5px;
            padding:7px 10px;margin-bottom:9px;
            display:grid;grid-template-columns:repeat(2,1fr);gap:5px 14px}
    .pt-label{font-size:7.5px;text-transform:uppercase;font-weight:700;
              color:#334155;letter-spacing:.05em}
    .pt-val{font-size:11px;font-weight:700;margin-top:1px;color:#0f172a}

    /* ── Items table ── */
    table{width:100%;border-collapse:collapse;margin-bottom:9px}
    thead tr{background:${AC}}
    th{padding:5px 7px;text-align:left;font-size:9px;font-weight:700;
       color:#fff;text-transform:uppercase;letter-spacing:.04em}
    th.r,td.r{text-align:right}
    tbody tr:nth-child(even){background:#f0fdfa}
    td{padding:5px 7px;border-bottom:1px solid #e2e8f0;font-size:10.5px;color:#0f172a;font-weight:500}

    /* ── Totals ── */
    .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:9px}
    .totals{width:185px;border:1px solid #e2e8f0;border-radius:5px;overflow:hidden}
    .tot-row{display:flex;justify-content:space-between;padding:4px 9px;
             font-size:10.5px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-weight:600}
    .tot-disc{color:#15803d}
    .grand{display:flex;justify-content:space-between;padding:6px 9px;
           background:${AC};color:#fff;font-size:12px;font-weight:800}

    /* ── Notes ── */
    .notes-box{background:#f0fdfa;border:1px solid #99f6e4;border-radius:4px;
               padding:5px 9px;margin-bottom:8px;font-size:9.5px;color:#0f172a}

    /* ── Terms ── */
    .terms-box{padding-top:7px;border-top:1px dashed #cbd5e1;margin-bottom:8px}
    .terms-hdr{font-size:8px;font-weight:700;color:#1e293b;
               text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}
    .t-line{display:flex;gap:4px;font-size:8px;color:#334155;line-height:1.5;padding:1px 0}
    .t-num{flex-shrink:0;color:#1e293b;font-weight:700;min-width:12px}

    /* ── Signature ── */
    .sig-row{display:flex;justify-content:flex-end;padding-top:10px;margin-top:auto}
    .sig-box{text-align:center;width:115px}
    .sig-line{border-top:1.5px solid #1e293b;padding-top:4px;font-size:8.5px;color:#1e293b;font-weight:600}

    /* ── Footer band ── */
    .ftr-band{flex-shrink:0;background:linear-gradient(135deg,#0f766e 0%,#0d9488 60%,#14b8a6 100%);
      border-top:2px solid #0f766e;padding:4px 8mm;display:flex;
      justify-content:space-between;align-items:center;
      font-size:8px;color:#fff;font-weight:600}
    .ftr-text{font-style:italic;color:rgba(255,255,255,0.95);flex:1;
              text-align:center;padding:0 8px;overflow:hidden;
              white-space:nowrap;text-overflow:ellipsis}

    /* ── Print button (screen only) ── */
    #printBtn{position:fixed;top:12px;right:12px;z-index:9999}
    #printBtn button{background:#0d9488;color:#fff;border:none;border-radius:8px;
      padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer;
      box-shadow:0 2px 8px rgba(0,0,0,0.25)}
  </style>
  </head><body>

  <div id="printBtn"><button onclick="window.print()">🖨️ Print / Save</button></div>

  <div class="page">

    ${billHeader ? `<div class="hdr-band">${esc(billHeader)}</div>` : ''}

    <div class="hdr">
      <div class="hdr-left">
        <div class="co-info">
          <div class="co-name">${esc(coName)}</div>
          ${coAddr     ? `<div class="co-line">${esc(coAddr)}</div>` : ''}
          ${coCityLine ? `<div class="co-line">${esc(coCityLine)}</div>` : ''}
          ${coTaxLine  ? `<div class="co-tax">${esc(coTaxLine)}</div>` : ''}
          ${coContact  ? `<div class="co-line">${esc(coContact)}</div>` : ''}
        </div>
      </div>
      <div class="hdr-center">
        ${logoSrc ? `<img src="${esc(logoSrc)}" style="max-height:46px;max-width:110px;object-fit:contain;" />` : ''}
      </div>
      <div class="hdr-right">
        <div class="inv-title">INVOICE</div>
        <div class="inv-meta">
          <b>Bill #:</b> ${esc(invoiceNumber || '—')}<br>
          <b>Date:</b> ${fmtDate(billDate)}<br>
          ${accessionNumber ? `<b>Accession:</b> ${esc(accessionNumber)}<br>` : ''}
          <b>Status:</b>&nbsp;<span class="badge ${paymentStatus === 'PAID' ? 'badge-paid' : 'badge-pending'}">${esc(paymentStatus)}</span>
        </div>
      </div>
    </div>

    <div class="body">

      <div class="pt-box">
        ${ptFields.map(([l, v]) => `
          <div>
            <div class="pt-label">${esc(l)}</div>
            <div class="pt-val">${esc(v || '—')}</div>
          </div>`).join('')}
      </div>

      <table>
        <thead><tr>
          <th style="width:24px">#</th>
          <th>Study / Service</th>
          <th>${esc(detailLabel)}</th>
          <th class="r">Amount</th>
        </tr></thead>
        <tbody>
          ${items.map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(s.name)}</td>
              <td>${esc(s.detail || '—')}</td>
              <td class="r">${fmtAmt(s.amount)}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <div class="totals-wrap">
        <div class="totals">
          <div class="tot-row"><span>Subtotal</span><span>${fmtAmt(subtotal)}</span></div>
          ${discountAmount > 0 ? `<div class="tot-row tot-disc"><span>Discount</span><span>− ${fmtAmt(discountAmount)}</span></div>` : ''}
          ${gst > 0 ? `<div class="tot-row"><span>GST</span><span>${fmtAmt(gst)}</span></div>` : ''}
          <div class="grand"><span>Total</span><span>${fmtAmt(totalAmount)}</span></div>
        </div>
      </div>

      ${notes ? `<div class="notes-box"><b>Clinical Notes:</b> ${esc(notes)}</div>` : ''}
      ${termsText ? `<div class="terms-box">
        <div class="terms-hdr">Terms &amp; Conditions</div>
        ${termsText.split(/\r?\n/).filter(l => l.trim()).map((l, i) =>
          `<div class="t-line"><span class="t-num">${i + 1}.</span><span>${esc(l.trim().replace(/^\d+[\.\)]\s*/, ''))}</span></div>`
        ).join('')}
      </div>` : ''}

      <div class="sig-row">
        <div class="sig-box">
          <div class="sig-line">Authorised Signatory</div>
        </div>
      </div>

    </div>

    <div class="ftr-band">
      <span style="white-space:nowrap;flex-shrink:0">${esc(coName)}</span>
      <span class="ftr-text">${esc(billFooter)}</span>
      <span style="white-space:nowrap;flex-shrink:0">Printed: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
    </div>

  </div>
  <script>
    function tryPrint(){ try{ window.print(); }catch(e){} }
    if(document.readyState==='complete'){ setTimeout(tryPrint,300); }
    else{ window.onload=function(){ setTimeout(tryPrint,300); }; setTimeout(tryPrint,1200); }
  </script>
  </body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
};
