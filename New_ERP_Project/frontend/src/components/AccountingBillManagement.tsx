import React, { useState, useEffect } from 'react';
import { Search, User, FileText, Calendar, Clock, CheckCircle, AlertCircle, Send, ExternalLink, Copy, Download, Check, X, RefreshCw, AlertTriangle, TrendingUp, CreditCard, Receipt, DollarSign, Shield, Eye, Edit, Trash2, Printer, Mail } from 'lucide-react';

// Industry Standard Status Definitions
const BILLING_STATUSES = {
  DRAFT: { label: 'Draft', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: FileText },
  PENDING: { label: 'Pending', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: Clock },
  POSTED: { label: 'Posted', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: CheckCircle },
  PARTIALLY_PAID: { label: 'Partially Paid', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: TrendingUp },
  FULLY_PAID: { label: 'Fully Paid', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle },
  OVERPAID: { label: 'Overpaid', color: 'text-purple-600 bg-purple-50 border-purple-200', icon: AlertTriangle },
  VOIDED: { label: 'Voided', color: 'text-red-600 bg-red-50 border-red-200', icon: X },
  WRITTEN_OFF: { label: 'Written Off', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: Trash2 },
  DISPUTED: { label: 'Disputed', color: 'text-red-600 bg-red-50 border-red-200', icon: AlertCircle },
  SENT_TO_COLLECTION: { label: 'Sent to Collection', color: 'text-red-800 bg-red-50 border-red-200', icon: AlertTriangle }
};

const PAYMENT_STATUSES = {
  PENDING: { label: 'Pending', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: Clock },
  PROCESSING: { label: 'Processing', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: RefreshCw },
  COMPLETED: { label: 'Completed', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle },
  FAILED: { label: 'Failed', color: 'text-red-600 bg-red-50 border-red-200', icon: X },
  CANCELLED: { label: 'Cancelled', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: X },
  REFUNDED: { label: 'Refunded', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: AlertTriangle },
  PARTIALLY_REFUNDED: { label: 'Partially Refunded', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: AlertTriangle },
  CHARGEBACK: { label: 'Chargeback', color: 'text-red-600 bg-red-50 border-red-200', icon: AlertTriangle },
  REVERSED: { label: 'Reversed', color: 'text-red-600 bg-red-50 border-red-200', icon: RefreshCw },
  HELD: { label: 'Held', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: AlertCircle }
};

const PAYMENT_METHODS = {
  CASH: { label: 'Cash', icon: DollarSign },
  CHECK: { label: 'Check', icon: FileText },
  WIRE_TRANSFER: { label: 'Wire Transfer', icon: Send },
  ACH_TRANSFER: { label: 'ACH Transfer', icon: Send },
  CREDIT_CARD: { label: 'Credit Card', icon: CreditCard },
  DEBIT_CARD: { label: 'Debit Card', icon: CreditCard },
  BANK_TRANSFER: { label: 'Bank Transfer', icon: Send },
  UPI: { label: 'UPI', icon: Send },
  NET_BANKING: { label: 'Net Banking', icon: Send },
  MOBILE_WALLET: { label: 'Mobile Wallet', icon: Send },
  CRYPTOCURRENCY: { label: 'Cryptocurrency', icon: TrendingUp },
  INSURANCE: { label: 'Insurance', icon: Shield },
  CORPORATE: { label: 'Corporate', icon: FileText },
  GOVERNMENT: { label: 'Government', icon: FileText },
  COMBINED: { label: 'Combined', icon: Receipt }
};

// Interface Definitions
interface AccountingBill {
  id: number;
  invoice_number: string;
  invoice_type: string;
  bill_date: string;
  due_date: string;
  patient_id: number;
  patient_pid: string;
  patient_name: string;
  customer_type: string;
  center_id: number;
  subtotal: string;
  discount_amount: string;
  discount_percentage: number;
  taxable_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  cess_amount: string;
  total_amount: string;
  amount_paid: string;
  balance_amount: string;
  billing_status: keyof typeof BILLING_STATUSES;
  payment_status: keyof typeof PAYMENT_STATUSES;
  payment_terms: string;
  due_days: number;
  overdue_days: number;
  accession_number?: string;
  accession_generated: boolean;
  posted_date?: string;
  posted_by?: number;
  approved_date?: string;
  approved_by?: number;
  api_sent: boolean;
  api_success: boolean;
  api_response_code?: number;
  api_error_message?: string;
  api_retry_count: number;
  api_sent_at?: string;
  created_at: string;
  updated_at: string;
}

interface BillItem {
  id: number;
  item_code: string;
  item_name: string;
  item_type: string;
  hsn_code?: string;
  sac_code?: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  discount_percentage: number;
  discount_amount: string;
  taxable_amount: string;
  gst_rate: number;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  cess_amount: string;
  total_amount: string;
}

interface Payment {
  id: number;
  receipt_number: string;
  payment_date: string;
  payment_method: keyof typeof PAYMENT_METHODS;
  payment_type: string;
  amount: string;
  bank_name?: string;
  transaction_id?: string;
  reference_number?: string;
  check_number?: string;
  card_last_four?: string;
  authorization_code?: string;
  payment_status: keyof typeof PAYMENT_STATUSES;
  payment_gateway?: string;
  processing_fee?: string;
  settlement_amount: string;
  settlement_date?: string;
  currency: string;
  exchange_rate: number;
  foreign_amount?: string;
}

interface AgingBucket {
  current: AccountingBill[];
  '0-30': AccountingBill[];
  '31-60': AccountingBill[];
  '61-90': AccountingBill[];
  '91-120': AccountingBill[];
  '120+': AccountingBill[];
}

const AccountingBillManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'bills' | 'aging' | 'reports'>('bills');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<AccountingBill[]>([]);
  const [selectedBill, setSelectedBill] = useState<AccountingBill | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [billPayments, setBillPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [agingData, setAgingData] = useState<AgingBucket | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBillDetails, setShowBillDetails] = useState(false);

  // Helper functions
  const formatCurrency = (amount: string | number): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(num);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getBillingStatusIndicator = (status: keyof typeof BILLING_STATUSES) => {
    const statusConfig = BILLING_STATUSES[status];
    const Icon = statusConfig.icon;
    
    return (
      <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${statusConfig.color}`}>
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{statusConfig.label}</span>
      </div>
    );
  };

  const getPaymentStatusIndicator = (status: keyof typeof PAYMENT_STATUSES) => {
    const statusConfig = PAYMENT_STATUSES[status];
    const Icon = statusConfig.icon;
    
    return (
      <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${statusConfig.color}`}>
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{statusConfig.label}</span>
      </div>
    );
  };

  const getPaymentMethodIcon = (method: keyof typeof PAYMENT_METHODS) => {
    const methodConfig = PAYMENT_METHODS[method];
    const Icon = methodConfig.icon;
    return <Icon className="w-4 h-4" />;
  };

  const calculateDaysOverdue = (dueDate: string): number => {
    const today = new Date();
    const due = new Date(dueDate);
    return Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
  };

  const getOverdueColor = (days: number): string => {
    if (days === 0) return 'text-green-600';
    if (days <= 30) return 'text-yellow-600';
    if (days <= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  // Search bills
  const searchBills = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/accounting-bills/search?q=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();
      
      if (data.success) {
        setSearchResults(data.data);
      } else {
        console.error('Search failed:', data.message);
      }
    } catch (error) {
      console.error('Error searching bills:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get bill details
  const getBillDetails = async (billId: number) => {
    setLoading(true);
    try {
      const [billResponse, itemsResponse, paymentsResponse] = await Promise.all([
        fetch(`/api/accounting-bill/${billId}`),
        fetch(`/api/accounting-bill/${billId}/items`),
        fetch(`/api/accounting-bill/${billId}/payments`)
      ]);

      const billData = await billResponse.json();
      const itemsData = await itemsResponse.json();
      const paymentsData = await paymentsResponse.json();

      if (billData.success) {
        setSelectedBill(billData.data.bill);
        setBillItems(itemsData.data || []);
        setBillPayments(paymentsData.data || []);
        setShowBillDetails(true);
      }
    } catch (error) {
      console.error('Error fetching bill details:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get aging report
  const getAgingReport = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/accounting-bills/reports/aging');
      const data = await response.json();
      
      if (data.success) {
        setAgingData(data.data.buckets);
      }
    } catch (error) {
      console.error('Error fetching aging report:', error);
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Effects
  useEffect(() => {
    if (activeTab === 'aging' && !agingData) {
      getAgingReport();
    }
  }, [activeTab]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm.trim()) {
        searchBills();
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Accounting & Billing Management</h2>
        <p className="text-gray-600 mt-1">Industry-standard accounting system with comprehensive billing and payment tracking</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('bills')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'bills'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Receipt className="w-4 h-4 inline mr-2" />
            Bills & Invoices
          </button>
          <button
            onClick={() => setActiveTab('aging')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'aging'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" />
            Aging Report
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'reports'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Reports
          </button>
        </nav>
      </div>

      {/* Bills Tab */}
      {activeTab === 'bills' && (
        <div>
          {/* Search Section */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by invoice number, patient name, PID, or accession number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Search Results</h3>
              {searchResults.map((bill) => (
                <div key={bill.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="font-semibold text-gray-900">{bill.invoice_number}</div>
                        <div className="text-sm text-gray-500">{bill.patient_name} ({bill.patient_pid})</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">{formatCurrency(bill.total_amount)}</div>
                      <div className="text-sm text-gray-500">Balance: {formatCurrency(bill.balance_amount)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      {getBillingStatusIndicator(bill.billing_status)}
                      {getPaymentStatusIndicator(bill.payment_status)}
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      <span>Due: {formatDate(bill.due_date)}</span>
                      {bill.overdue_days > 0 && (
                        <span className={`font-medium ${getOverdueColor(bill.overdue_days)}`}>
                          ({bill.overdue_days} days overdue)
                        </span>
                      )}
                    </div>
                  </div>

                  {bill.accession_number && (
                    <div className="flex items-center space-x-2 mb-3">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-gray-600">Accession: {bill.accession_number}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <span>Customer: {bill.customer_type}</span>
                      <span>•</span>
                      <span>Terms: {bill.payment_terms}</span>
                      <span>•</span>
                      <span>Created: {formatDate(bill.created_at)}</span>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => getBillDetails(bill.id)}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </button>
                      <button
                        onClick={() => copyToClipboard(bill.invoice_number)}
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center"
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {searchResults.length === 0 && searchTerm.trim() && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No bills found</h3>
              <p className="text-gray-500">Try adjusting your search terms</p>
            </div>
          )}
        </div>
      )}

      {/* Aging Tab */}
      {activeTab === 'aging' && agingData && (
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Accounts Receivable Aging Report</h3>
            <button
              onClick={getAgingReport}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(agingData).map(([bucket, bills]) => (
              <div key={bucket} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900">
                    {bucket === 'current' ? 'Current' : bucket === '0-30' ? '0-30 Days' : `${bucket} Days`}
                  </h4>
                  <span className="text-sm text-gray-500">{bills.length} bills</span>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-2">
                  {formatCurrency(bills.reduce((sum, bill) => sum + parseFloat(bill.balance_amount), 0))}
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {bills.slice(0, 5).map((bill) => (
                    <div key={bill.id} className="flex justify-between items-center text-sm">
                      <div>
                        <div className="font-medium">{bill.invoice_number}</div>
                        <div className="text-gray-500">{bill.patient_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(bill.balance_amount)}</div>
                        <div className="text-gray-500">{formatDate(bill.due_date)}</div>
                      </div>
                    </div>
                  ))}
                  {bills.length > 5 && (
                    <div className="text-center text-sm text-gray-500 pt-2">
                      +{bills.length - 5} more bills
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Financial Reports</h3>
          <p className="text-gray-500 mb-6">Comprehensive financial reporting coming soon</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <button className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50">
              <TrendingUp className="w-6 h-6 text-blue-500 mx-auto mb-2" />
              <div className="font-medium">Revenue Report</div>
            </button>
            <button className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50">
              <DollarSign className="w-6 h-6 text-green-500 mx-auto mb-2" />
              <div className="font-medium">Tax Summary</div>
            </button>
            <button className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50">
              <Receipt className="w-6 h-6 text-purple-500 mx-auto mb-2" />
              <div className="font-medium">Payment Analysis</div>
            </button>
          </div>
        </div>
      )}

      {/* Bill Details Modal */}
      {showBillDetails && selectedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Invoice Details</h3>
                  <p className="text-gray-500">{selectedBill.invoice_number}</p>
                </div>
                <button
                  onClick={() => setShowBillDetails(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Bill Header */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Patient Information</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-gray-500">Name:</span> {selectedBill.patient_name}</div>
                    <div><span className="text-gray-500">PID:</span> {selectedBill.patient_pid}</div>
                    <div><span className="text-gray-500">Customer Type:</span> {selectedBill.customer_type}</div>
                    <div><span className="text-gray-500">Payment Terms:</span> {selectedBill.payment_terms}</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Invoice Information</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-gray-500">Invoice Date:</span> {formatDate(selectedBill.bill_date)}</div>
                    <div><span className="text-gray-500">Due Date:</span> {formatDate(selectedBill.due_date)}</div>
                    <div><span className="text-gray-500">Amount:</span> {formatCurrency(selectedBill.total_amount)}</div>
                    <div><span className="text-gray-500">Balance:</span> {formatCurrency(selectedBill.balance_amount)}</div>
                  </div>
                </div>
              </div>

              {/* Status Indicators */}
              <div className="flex items-center space-x-4 mb-6">
                {getBillingStatusIndicator(selectedBill.billing_status)}
                {getPaymentStatusIndicator(selectedBill.payment_status)}
                {selectedBill.overdue_days > 0 && (
                  <div className={`px-3 py-1 rounded-full border ${getOverdueColor(selectedBill.overdue_days)} border-current bg-current bg-opacity-10`}>
                    <span className="text-sm font-medium">{selectedBill.overdue_days} days overdue</span>
                  </div>
                )}
              </div>

              {/* Bill Items */}
              <div className="mb-6">
                <h4 className="font-semibold text-gray-900 mb-3">Bill Items</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Tax</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {billItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2 text-sm">
                            <div className="font-medium">{item.item_name}</div>
                            {item.hsn_code && <div className="text-gray-500">HSN: {item.hsn_code}</div>}
                          </td>
                          <td className="px-4 py-2 text-sm text-right">{item.quantity}</td>
                          <td className="px-4 py-2 text-sm text-right">{formatCurrency(item.unit_price)}</td>
                          <td className="px-4 py-2 text-sm text-right">{formatCurrency(item.cgst_amount)}</td>
                          <td className="px-4 py-2 text-sm text-right font-medium">{formatCurrency(item.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tax Summary */}
              <div className="mb-6">
                <h4 className="font-semibold text-gray-900 mb-3">Tax Summary</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Subtotal:</span>
                      <span>{formatCurrency(selectedBill.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Discount:</span>
                      <span>-{formatCurrency(selectedBill.discount_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Taxable Amount:</span>
                      <span>{formatCurrency(selectedBill.taxable_amount)}</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">CGST:</span>
                      <span>{formatCurrency(selectedBill.cgst_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">SGST:</span>
                      <span>{formatCurrency(selectedBill.sgst_amount)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Total:</span>
                      <span>{formatCurrency(selectedBill.total_amount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payments */}
              {billPayments.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-3">Payment History</h4>
                  <div className="space-y-2">
                    {billPayments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center space-x-3">
                          {getPaymentMethodIcon(payment.payment_method)}
                          <div>
                            <div className="font-medium">{payment.receipt_number}</div>
                            <div className="text-sm text-gray-500">{payment.payment_method} • {formatDate(payment.payment_date)}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatCurrency(payment.amount)}</div>
                          {getPaymentStatusIndicator(payment.payment_status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center"
                  disabled={selectedBill.balance_amount === '0'}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Record Payment
                </button>
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center">
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </button>
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center">
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountingBillManagement;
