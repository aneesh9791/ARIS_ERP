import { useState, useEffect, useCallback } from 'react';
import VendorModal from '../components/VendorModal';
import { getPermissions } from '../utils/permissions';
import { today as serverToday } from '../utils/serverDate';

const token = () => localStorage.getItem('token');
const hdrs = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

const fmtINR = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);

const BILL_STATUS_BADGE = {
  PENDING:   'bg-amber-100 text-amber-700',
  PARTIAL:   'bg-blue-100 text-blue-700',
  PAID:      'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const VENDOR_TYPES = ['SUPPLIER', 'SERVICE', 'CONTRACTOR', 'UTILITY', 'OTHER'];
const PAY_MODES    = ['CASH', 'CHEQUE', 'NEFT', 'RTGS', 'UPI'];


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

// ── Vendor Form Modal ─────────────────────────────────────────────────────────

// ── Bill Form Modal ───────────────────────────────────────────────────────────
const BillModal = ({ vendors, glAccounts, onClose, onSaved }) => {
  const today = serverToday();
  const [form, setForm] = useState({
    vendor_code: '', bill_number: '', bill_date: today, due_date: '',
    notes: '', itc_claimable: false,
  });
  const [items, setItems] = useState([
    { item_name: '', description: '', quantity: '1', rate: '', gst_rate: '18',
      cgst_amount: '0', sgst_amount: '0', igst_amount: '0', hsn_code: '', gl_account_id: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setItem = (idx, k, v) => {
    setItems(prev => {
      const next = prev.map((it, i) => i === idx ? { ...it, [k]: v } : it);
      if (['quantity', 'rate', 'gst_rate'].includes(k)) {
        const it = next[idx];
        const amt = parseFloat(it.quantity || 0) * parseFloat(it.rate || 0);
        const gstRate = parseFloat(it.gst_rate || 0);
        const half = (amt * gstRate / 100 / 2).toFixed(2);
        next[idx] = { ...next[idx], cgst_amount: half, sgst_amount: half, igst_amount: '0' };
      }
      return next;
    });
  };

  const addItem = () => setItems(prev => [...prev, {
    item_name: '', description: '', quantity: '1', rate: '', gst_rate: '18',
    cgst_amount: '0', sgst_amount: '0', igst_amount: '0', hsn_code: '', gl_account_id: '',
  }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + parseFloat(i.quantity || 0) * parseFloat(i.rate || 0), 0);
  const totalGST = items.reduce((s, i) =>
    s + parseFloat(i.cgst_amount || 0) + parseFloat(i.sgst_amount || 0) + parseFloat(i.igst_amount || 0), 0);
  const total = subtotal + totalGST;

  const allGlAccounts = [
    ...glAccounts.expenseAccounts.map(a => ({ ...a, group: 'Expense' })),
    ...glAccounts.assetAccounts.map(a => ({ ...a, group: 'Asset / Stock' })),
  ];

  const submit = async () => {
    setErr('');
    if (!form.vendor_code || !form.bill_number || !form.bill_date || !form.due_date) {
      setErr('Vendor, Bill No, Bill Date and Due Date are required'); return;
    }
    if (items.some(i => !i.item_name || !i.rate)) { setErr('All items need name and rate'); return; }
    if (items.some(i => !i.gl_account_id)) { setErr('Select a GL account for each line item'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/vendors/bills', {
        method: 'POST',
        headers: hdrs(),
        body: JSON.stringify({ ...form, items }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
    } catch { setErr('Network error'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-800">New Vendor Bill</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{err}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Vendor *</label>
              <select value={form.vendor_code} onChange={e => setF('vendor_code', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">Select vendor…</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.vendor_code}>
                    {v.vendor_code} — {v.vendor_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bill Number *</label>
              <input type="text" value={form.bill_number} onChange={e => setF('bill_number', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <input type="text" value={form.notes} onChange={e => setF('notes', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bill Date *</label>
              <input type="date" value={form.bill_date} onChange={e => setF('bill_date', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Due Date *</label>
              <input type="date" value={form.due_date} onChange={e => setF('due_date', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>

          {/* ITC Toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.itc_claimable}
              onChange={e => setF('itc_claimable', e.target.checked)}
              className="w-4 h-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500" />
            <span className="text-sm font-medium text-slate-700">GST Input Tax Credit (ITC) claimable</span>
            <span className="text-xs text-slate-400">— When checked, GST is posted to ITC (1134) instead of expensed</span>
          </label>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">Line Items</h3>
              <button onClick={addItem}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium border border-teal-300 rounded px-2 py-1">
                + Add Item
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-2 text-left font-semibold">Item Name</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{minWidth:'180px'}}>GL Account *</th>
                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold">Rate</th>
                    <th className="px-3 py-2 text-right font-semibold">GST%</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    <th className="px-3 py-2 text-left font-semibold">HSN</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const amt = parseFloat(it.quantity || 0) * parseFloat(it.rate || 0);
                    const gst = parseFloat(it.cgst_amount || 0) + parseFloat(it.sgst_amount || 0);
                    return (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <input type="text" value={it.item_name}
                            onChange={e => setItem(idx, 'item_name', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                            placeholder="Item name" />
                        </td>
                        <td className="px-3 py-2" style={{minWidth:'180px'}}>
                          <select value={it.gl_account_id || ''}
                            onChange={e => setItem(idx, 'gl_account_id', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500">
                            <option value="">Select GL…</option>
                            <optgroup label="── Expense Accounts ──">
                              {glAccounts.expenseAccounts.map(a => (
                                <option key={a.id} value={a.id}>{a.account_code} {a.account_name}</option>
                              ))}
                            </optgroup>
                            <optgroup label="── Asset / Stock Accounts ──">
                              {glAccounts.assetAccounts.map(a => (
                                <option key={a.id} value={a.id}>{a.account_code} {a.account_name}</option>
                              ))}
                            </optgroup>
                          </select>
                        </td>
                        <td className="px-3 py-2 w-16">
                          <input type="number" min="0.01" step="0.01" value={it.quantity}
                            onChange={e => setItem(idx, 'quantity', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-teal-500" />
                        </td>
                        <td className="px-3 py-2 w-24">
                          <input type="number" min="0" step="0.01" value={it.rate}
                            onChange={e => setItem(idx, 'rate', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                            placeholder="0.00" />
                        </td>
                        <td className="px-3 py-2 w-16">
                          <select value={it.gst_rate}
                            onChange={e => setItem(idx, 'gst_rate', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500">
                            {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700 w-24">
                          <div>{fmtINR(amt)}</div>
                          <div className="text-slate-400">+{fmtINR(gst)}</div>
                        </td>
                        <td className="px-3 py-2 w-20">
                          <input type="text" value={it.hsn_code}
                            onChange={e => setItem(idx, 'hsn_code', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                            placeholder="HSN" />
                        </td>
                        <td className="px-2 py-2">
                          {items.length > 1 && (
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* JE Preview */}
            <div className="mt-3 flex items-start justify-between">
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500 flex-1 mr-4">
                <span className="font-medium text-slate-600">JE Preview: </span>
                DR Expense/Asset GL(s) {fmtINR(subtotal)}
                {form.itc_claimable && totalGST > 0 && <> + DR ITC {fmtINR(totalGST)}</>}
                {!form.itc_claimable && totalGST > 0 && <> (incl. GST)</>}
                {' '}= CR AP {fmtINR(total)}
              </div>
              <div className="space-y-1 text-right text-sm">
                <div className="text-slate-500">Subtotal: <span className="font-medium text-slate-700">{fmtINR(subtotal)}</span></div>
                <div className="text-slate-500">GST: <span className="font-medium text-slate-700">{fmtINR(totalGST)}</span></div>
                <div className="text-base font-bold text-slate-800">Total: {fmtINR(total)}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-200 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
            {saving ? 'Saving…' : 'Create Bill & Post JE'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Payment Modal ─────────────────────────────────────────────────────────────
const PaymentModal = ({ bill, glAccounts, onClose, onSaved }) => {
  const amountDue = parseFloat(bill.total_amount) - parseFloat(bill.amount_paid || 0);
  const today = serverToday();
  const [form, setForm] = useState({
    payment_mode: 'NEFT', amount_paid: amountDue.toFixed(2),
    payment_date: today, transaction_reference: '', notes: '',
    bank_account_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-set bank account when payment mode changes
  const handleModeChange = (mode) => {
    set('payment_mode', mode);
    if (mode === 'CASH') {
      const cashAcc = glAccounts.cashAccounts.find(a => a.account_code === '1111');
      if (cashAcc) set('bank_account_id', String(cashAcc.id));
    } else {
      const bankAcc = glAccounts.cashAccounts.find(a => a.account_code === '1112');
      if (bankAcc) set('bank_account_id', String(bankAcc.id));
    }
  };

  // Set default bank account on mount
  useEffect(() => {
    if (glAccounts.cashAccounts.length > 0 && !form.bank_account_id) {
      const bankAcc = glAccounts.cashAccounts.find(a => a.account_code === '1112');
      if (bankAcc) setForm(f => ({ ...f, bank_account_id: String(bankAcc.id) }));
    }
  }, [glAccounts.cashAccounts]);

  const submit = async () => {
    setErr('');
    if (!form.amount_paid || parseFloat(form.amount_paid) <= 0) { setErr('Amount must be > 0'); return; }
    if (!form.bank_account_id) { setErr('Select a bank/cash account'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/vendors/bills/${bill.id}/pay`, {
        method: 'POST', headers: hdrs(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
    } catch { setErr('Network error'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Record Payment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{err}</p>}
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Bill No</span><span className="font-medium">{bill.bill_number}</span>
            </div>
            <div className="flex justify-between text-slate-600 mt-1">
              <span>Bill Total</span><span className="font-medium">{fmtINR(bill.total_amount)}</span>
            </div>
            <div className="flex justify-between text-slate-600 mt-1">
              <span>Already Paid</span><span className="font-medium">{fmtINR(bill.amount_paid)}</span>
            </div>
            <div className="flex justify-between font-semibold text-slate-800 mt-1 pt-1 border-t border-slate-200">
              <span>Balance Due</span><span>{fmtINR(amountDue)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Payment Mode *</label>
            <select value={form.payment_mode} onChange={e => handleModeChange(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {PAY_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Pay From Account *</label>
            <select value={form.bank_account_id || ''} onChange={e => set('bank_account_id', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">Select account…</option>
              {glAccounts.cashAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">JE: DR AP account → CR this account</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Amount *</label>
              <input type="number" min="0.01" step="0.01" value={form.amount_paid}
                onChange={e => set('amount_paid', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Payment Date *</label>
              <input type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Transaction Reference</label>
            <input type="text" value={form.transaction_reference} onChange={e => set('transaction_reference', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="UTR / Cheque no." />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
            {saving ? 'Saving…' : 'Record Payment & Post JE'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const Vendors = () => {
  const { has } = getPermissions();
  const [activeTab, setActiveTab] = useState('vendors');

  // Vendors
  const [vendors, setVendors] = useState([]);
  const [vLoading, setVLoading] = useState(true);
  const [vendorModal, setVendorModal] = useState(null);

  // Bills
  const [bills, setBills] = useState([]);
  const [bLoading, setBLoading] = useState(false);
  const [billStatusFilter, setBillStatusFilter] = useState('');
  const [billVendorFilter, setBillVendorFilter] = useState('');
  const [billModal, setBillModal] = useState(false);
  const [payModal, setPayModal] = useState(null);

  // GL accounts for AP/expense/cash dropdowns
  const [glAccounts, setGlAccounts] = useState({
    apAccounts: [], expenseAccounts: [], assetAccounts: [], cashAccounts: [],
  });

  const loadVendors = useCallback(async () => {
    setVLoading(true);
    try {
      const r = await fetch('/api/vendors', { headers: hdrs() });
      const d = await r.json();
      if (d.success) setVendors(d.vendors || []);
    } finally { setVLoading(false); }
  }, []);

  const loadBills = useCallback(async () => {
    setBLoading(true);
    const params = new URLSearchParams();
    if (billStatusFilter) params.set('payment_status', billStatusFilter);
    if (billVendorFilter) params.set('vendor_code', billVendorFilter);
    try {
      const r = await fetch(`/api/vendors/bills?${params}`, { headers: hdrs() });
      const d = await r.json();
      if (d.success) setBills(d.bills || []);
    } finally { setBLoading(false); }
  }, [billStatusFilter, billVendorFilter]);

  const loadGlAccounts = useCallback(async () => {
    try {
      const r = await fetch('/api/vendors/ap-accounts', { headers: hdrs() });
      const d = await r.json();
      if (d.success) setGlAccounts(d);
    } catch { /* silent */ }
  }, []);

  const deactivateVendor = async (id) => {
    if (!window.confirm('Deactivate this vendor?')) return;
    await fetch(`/api/vendors/${id}`, { method: 'DELETE', headers: hdrs() });
    loadVendors();
  };

  useEffect(() => { loadVendors(); loadGlAccounts(); }, [loadVendors, loadGlAccounts]);
  useEffect(() => { if (activeTab === 'bills') loadBills(); }, [activeTab, loadBills]);

  const totalBills       = bills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
  const totalPaid        = bills.reduce((s, b) => s + parseFloat(b.amount_paid || 0), 0);
  const totalOutstanding = totalBills - totalPaid;

  const TABS = [
    { id: 'vendors', label: 'Vendor Master' },
    { id: 'bills',   label: 'Bills & Payments' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Vendors & Accounts Payable</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage vendors, bills, and payments — all with real GL journal entries</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-200">
          <nav className="flex px-4 -mb-px gap-6">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.id
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Vendor Master Tab */}
        {activeTab === 'vendors' && (
          <div>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <span className="text-xs text-slate-400">{vendors.length} vendors</span>
              {has('VENDOR_WRITE') && (
              <button onClick={() => setVendorModal('new')}
                className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Vendor
              </button>
              )}
            </div>
            {vLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
            ) : vendors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <p className="text-sm">No vendors found. Add your first vendor.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Code</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Phone</th>
                      <th className="px-4 py-3 text-left">GST Number</th>
                      <th className="px-4 py-3 text-left">City / State</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map(v => (
                      <tr key={v.id} className="hover:bg-teal-50 border-b border-slate-100 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{v.vendor_code}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{v.vendor_name}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {v.vendor_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{v.phone || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                          {v.gst_number
                            ? v.gst_number
                            : v.is_taxpayer
                              ? <span className="text-slate-400">—</span>
                              : <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-sans font-medium">Non-Taxpayer</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-slate-600">{v.city}, {v.state}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {has('VENDOR_WRITE') && (
                            <>
                            <button onClick={() => setVendorModal(v)}
                              className="text-xs font-medium text-teal-600 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50">
                              Edit
                            </button>
                            <button onClick={() => deactivateVendor(v.id)}
                              className="text-xs font-medium text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
                              Deactivate
                            </button>
                            </>
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
        )}

        {/* Bills Tab */}
        {activeTab === 'bills' && (
          <div>
            <div className="grid grid-cols-3 gap-4 p-4 border-b border-slate-100">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-slate-800">{fmtINR(totalBills)}</p>
                <p className="text-xs text-slate-500">Total Billed</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-emerald-700">{fmtINR(totalPaid)}</p>
                <p className="text-xs text-slate-500">Total Paid</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-amber-700">{fmtINR(totalOutstanding)}</p>
                <p className="text-xs text-slate-500">Outstanding</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
              <select value={billVendorFilter} onChange={e => setBillVendorFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">All Vendors</option>
                {vendors.map(v => <option key={v.id} value={v.vendor_code}>{v.vendor_code} — {v.vendor_name}</option>)}
              </select>
              <select value={billStatusFilter} onChange={e => setBillStatusFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="PARTIAL">Partial</option>
                <option value="PAID">Paid</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <button onClick={() => loadBills()}
                className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                Search
              </button>
              {has('VENDOR_WRITE') && (
              <button onClick={() => setBillModal(true)}
                className="ml-auto bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Bill
              </button>
              )}
            </div>

            {bLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
            ) : bills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <p className="text-sm">No bills found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Bill No</th>
                      <th className="px-4 py-3 text-left">Vendor</th>
                      <th className="px-4 py-3 text-left">Bill Date</th>
                      <th className="px-4 py-3 text-left">Due Date</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                      <th className="px-4 py-3 text-center">ITC</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map(b => {
                      const balance = parseFloat(b.total_amount) - parseFloat(b.amount_paid || 0);
                      const overdue = b.payment_status !== 'PAID' && new Date(b.due_date) < new Date();
                      return (
                        <tr key={b.id} className={`border-b border-slate-100 transition-colors ${overdue ? 'hover:bg-red-50' : 'hover:bg-teal-50'}`}>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.bill_number}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{b.vendor_name}</div>
                            <div className="text-xs text-slate-400">{b.vendor_code}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {new Date(b.bill_date).toLocaleDateString('en-GB')}
                          </td>
                          <td className={`px-4 py-3 ${overdue ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
                            {new Date(b.due_date).toLocaleDateString('en-GB')}
                            {overdue && <span className="ml-1 text-xs">⚠ Overdue</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtINR(b.total_amount)}</td>
                          <td className="px-4 py-3 text-right text-emerald-700">{fmtINR(b.amount_paid)}</td>
                          <td className="px-4 py-3 text-right text-amber-700 font-medium">{fmtINR(balance)}</td>
                          <td className="px-4 py-3 text-center">
                            {b.itc_claimable
                              ? <span className="text-xs text-teal-600 font-medium">Yes</span>
                              : <span className="text-xs text-slate-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BILL_STATUS_BADGE[b.payment_status] || 'bg-slate-100 text-slate-600'}`}>
                              {b.payment_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {has('VENDOR_WRITE') && ['PENDING', 'PARTIAL'].includes(b.payment_status) && (
                              <button onClick={() => setPayModal(b)}
                                className="text-xs font-medium text-teal-600 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50">
                                Pay
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {vendorModal && (
        <VendorModal
          vendor={vendorModal === 'new' ? null : vendorModal}
          onClose={() => setVendorModal(null)}
          onSaved={() => { setVendorModal(null); loadVendors(); }}
        />
      )}
      {billModal && (
        <BillModal
          vendors={vendors}
          glAccounts={glAccounts}
          onClose={() => setBillModal(false)}
          onSaved={() => { setBillModal(false); loadBills(); }}
        />
      )}
      {payModal && (
        <PaymentModal
          bill={payModal}
          glAccounts={glAccounts}
          onClose={() => setPayModal(null)}
          onSaved={() => { setPayModal(null); loadBills(); }}
        />
      )}
    </div>
  );
};

export default Vendors;
