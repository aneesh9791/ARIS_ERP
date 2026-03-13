import React, { useState, useEffect } from 'react';
import { 
  Edit, 
  Trash2, 
  X, 
  DollarSign, 
  Receipt, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  CreditCard, 
  Banknote, 
  FileText, 
  User, 
  Shield, 
  Eye, 
  Save, 
  XCircle,
  RefreshCw,
  History,
  Percent,
  Calculator
} from 'lucide-react';

// Role-based permissions
const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  BILLING_CLERK: 'BILLING_CLERK',
  RECEPTIONIST: 'RECEPTIONIST',
  VIEWER: 'VIEWER'
};

const PERMISSIONS = {
  EDIT_BILL: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.ACCOUNTANT, USER_ROLES.BILLING_CLERK],
  DELETE_BILL: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  CANCEL_BILL: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.ACCOUNTANT],
  APPLY_DISCOUNT: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.ACCOUNTANT],
  APPROVE_DISCOUNT: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  PROCESS_REFUND: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.ACCOUNTANT],
  APPROVE_REFUND: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  VIEW_BILL: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.ACCOUNTANT, USER_ROLES.BILLING_CLERK, USER_ROLES.RECEPTIONIST, USER_ROLES.VIEWER],
  VIEW_FINANCIALS: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.ACCOUNTANT]
};

// Interfaces
interface Bill {
  id: number;
  invoice_number: string;
  patient_id: number;
  patient_name: string;
  patient_pid: string;
  total_amount: string;
  amount_paid: string;
  balance_amount: string;
  billing_status: string;
  payment_status: string;
  payment_terms: string;
  discount_amount: string;
  discount_percentage: number;
  subtotal: string;
  taxable_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  created_at: string;
  updated_at: string;
}

interface UserPermissions {
  role: string;
  permissions: Record<string, boolean>;
}

interface AuditEntry {
  id: number;
  action: string;
  user_name: string;
  user_role: string;
  timestamp: string;
  old_values: any;
  new_values: any;
}

interface BillOperationsProps {
  bill: Bill;
  userRole: string;
  onBillUpdated?: (updatedBill: Bill) => void;
  onBillDeleted?: () => void;
}

const BillOperations: React.FC<BillOperationsProps> = ({ 
  bill, 
  userRole, 
  onBillUpdated, 
  onBillDeleted 
}) => {
  const [userPermissions, setUserPermissions] = useState<UserPermissions | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);

  // Form states
  const [editForm, setEditForm] = useState({
    payment_terms: bill.payment_terms,
    notes: ''
  });

  const [discountForm, setDiscountForm] = useState({
    discount_type: 'percentage' as 'percentage' | 'amount',
    discount_percentage: 0,
    discount_amount: 0,
    discount_reason: '',
    requires_approval: false
  });

  const [cancelForm, setCancelForm] = useState({
    cancellation_reason: '',
    refund_amount: 0,
    refund_method: 'CASH' as string,
    refund_reference: ''
  });

  const [refundForm, setRefundForm] = useState({
    refund_amount: 0,
    refund_reason: '',
    refund_method: 'CASH' as string,
    refund_reference: '',
    requires_approval: false
  });

  // Check if user has permission
  const hasPermission = (permission: string): boolean => {
    return userPermissions?.permissions[permission] || false;
  };

  // Check if bill can be edited
  const canEditBill = (): boolean => {
    const editableStatuses = ['DRAFT', 'PENDING', 'POSTED'];
    return hasPermission('EDIT_BILL') && editableStatuses.includes(bill.billing_status);
  };

  // Check if bill can be cancelled
  const canCancelBill = (): boolean => {
    const cancellableStatuses = ['DRAFT', 'PENDING', 'POSTED', 'PARTIALLY_PAID'];
    return hasPermission('CANCEL_BILL') && cancellableStatuses.includes(bill.billing_status);
  };

  // Check if bill can be refunded
  const canRefundBill = (): boolean => {
    const refundableStatuses = ['FULLY_PAID', 'OVERPAID', 'PARTIALLY_PAID'];
    return hasPermission('PROCESS_REFUND') && 
           refundableStatuses.includes(bill.billing_status) && 
           parseFloat(bill.amount_paid) > 0;
  };

  // Check if bill can be deleted
  const canDeleteBill = (): boolean => {
    const deletableStatuses = ['DRAFT', 'PENDING', 'POSTED'];
    return hasPermission('DELETE_BILL') && deletableStatuses.includes(bill.billing_status);
  };

  // Format currency
  const formatCurrency = (amount: string | number): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(num);
  };

  // Get user permissions
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const response = await fetch('/api/user/permissions');
        const data = await response.json();
        if (data.success) {
          setUserPermissions(data.data);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
      }
    };

    fetchPermissions();
  }, []);

  // Handle bill edit
  const handleEditBill = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/bills/${bill.id}/edit`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Bill updated successfully');
        setShowEditModal(false);
        if (onBillUpdated) {
          onBillUpdated(data.data);
        }
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to update bill');
    } finally {
      setLoading(false);
    }
  };

  // Handle discount application
  const handleApplyDiscount = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const discountData = {
        discount_percentage: discountForm.discount_type === 'percentage' ? discountForm.discount_percentage : 0,
        discount_amount: discountForm.discount_type === 'amount' ? discountForm.discount_amount : 0,
        discount_reason: discountForm.discount_reason,
        requires_approval: discountForm.requires_approval
      };

      const response = await fetch(`/api/bills/${bill.id}/discount`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(discountData),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message);
        setShowDiscountModal(false);
        if (onBillUpdated) {
          onBillUpdated(data.data);
        }
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to apply discount');
    } finally {
      setLoading(false);
    }
  };

  // Handle bill cancellation
  const handleCancelBill = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const cancelData = {
        cancellation_reason: cancelForm.cancellation_reason,
        refund_amount: cancelForm.refund_amount || undefined,
        refund_method: cancelForm.refund_method || undefined,
        refund_reference: cancelForm.refund_reference || undefined
      };

      const response = await fetch(`/api/bills/${bill.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cancelData),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Bill cancelled successfully');
        setShowCancelModal(false);
        if (onBillUpdated) {
          onBillUpdated(data.data.bill);
        }
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to cancel bill');
    } finally {
      setLoading(false);
    }
  };

  // Handle refund processing
  const handleProcessRefund = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const refundData = {
        refund_amount: refundForm.refund_amount,
        refund_reason: refundForm.refund_reason,
        refund_method: refundForm.refund_method,
        refund_reference: refundForm.refund_reference,
        requires_approval: refundForm.requires_approval
      };

      const response = await fetch(`/api/bills/${bill.id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(refundData),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message);
        setShowRefundModal(false);
        if (onBillUpdated) {
          onBillUpdated(data.data.bill);
        }
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to process refund');
    } finally {
      setLoading(false);
    }
  };

  // Handle bill deletion
  const handleDeleteBill = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/bills/${bill.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Bill deleted successfully');
        setShowDeleteModal(false);
        if (onBillDeleted) {
          onBillDeleted();
        }
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to delete bill');
    } finally {
      setLoading(false);
    }
  };

  // Fetch audit history
  const fetchAuditHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/bills/${bill.id}/history`);
      const data = await response.json();
      if (data.success) {
        setAuditHistory(data.data);
      }
    } catch (error) {
      console.error('Error fetching audit history:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate discount amounts
  const calculateDiscountAmount = (): number => {
    const subtotal = parseFloat(bill.subtotal);
    if (discountForm.discount_type === 'percentage') {
      return subtotal * (discountForm.discount_percentage / 100);
    }
    return discountForm.discount_amount;
  };

  const calculateNewTotal = (): number => {
    const subtotal = parseFloat(bill.subtotal);
    const discountAmount = calculateDiscountAmount();
    const discountedSubtotal = subtotal - discountAmount;
    const taxableAmount = parseFloat(bill.taxable_amount) - (discountAmount * (parseFloat(bill.taxable_amount) / subtotal));
    const gstAmount = taxableAmount * 0.18;
    return discountedSubtotal + gstAmount;
  };

  return (
    <div className="flex items-center space-x-2">
      {/* Edit Button */}
      {canEditBill() && (
        <button
          onClick={() => setShowEditModal(true)}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="Edit Bill"
        >
          <Edit className="w-4 h-4" />
        </button>
      )}

      {/* Discount Button */}
      {hasPermission('APPLY_DISCOUNT') && canEditBill() && (
        <button
          onClick={() => setShowDiscountModal(true)}
          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
          title="Apply Discount"
        >
          <Percent className="w-4 h-4" />
        </button>
      )}

      {/* Cancel Button */}
      {canCancelBill() && (
        <button
          onClick={() => setShowCancelModal(true)}
          className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
          title="Cancel Bill"
        >
          <XCircle className="w-4 h-4" />
        </button>
      )}

      {/* Refund Button */}
      {canRefundBill() && (
        <button
          onClick={() => setShowRefundModal(true)}
          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
          title="Process Refund"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      )}

      {/* Delete Button */}
      {canDeleteBill() && (
        <button
          onClick={() => setShowDeleteModal(true)}
          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete Bill"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      {/* History Button */}
      {hasPermission('VIEW_BILL') && (
        <button
          onClick={() => {
            setShowHistory(true);
            fetchAuditHistory();
          }}
          className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          title="View History"
        >
          <History className="w-4 h-4" />
        </button>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Edit Bill</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Terms
                </label>
                <select
                  value={editForm.payment_terms}
                  onChange={(e) => setEditForm({ ...editForm, payment_terms: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="IMMEDIATE">Immediate</option>
                  <option value="NET15">Net 15</option>
                  <option value="NET30">Net 30</option>
                  <option value="NET45">Net 45</option>
                  <option value="NET60">Net 60</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Add notes..."
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-600 text-sm">{success}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditBill}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Apply Discount</h3>
              <button
                onClick={() => setShowDiscountModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Type
                </label>
                <select
                  value={discountForm.discount_type}
                  onChange={(e) => setDiscountForm({ ...discountForm, discount_type: e.target.value as 'percentage' | 'amount' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="percentage">Percentage</option>
                  <option value="amount">Fixed Amount</option>
                </select>
              </div>

              {discountForm.discount_type === 'percentage' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Discount Percentage
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={discountForm.discount_percentage}
                    onChange={(e) => setDiscountForm({ ...discountForm, discount_percentage: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Discount Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountForm.discount_amount}
                    onChange={(e) => setDiscountForm({ ...discountForm, discount_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Reason
                </label>
                <textarea
                  value={discountForm.discount_reason}
                  onChange={(e) => setDiscountForm({ ...discountForm, discount_reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Reason for discount..."
                />
              </div>

              {hasPermission('APPROVE_DISCOUNT') && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="requires_approval"
                    checked={discountForm.requires_approval}
                    onChange={(e) => setDiscountForm({ ...discountForm, requires_approval: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="requires_approval" className="text-sm text-gray-700">
                    Requires managerial approval
                  </label>
                </div>
              )}

              {/* Discount Preview */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Discount Preview</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(bill.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span className="text-red-600">-{formatCurrency(calculateDiscountAmount())}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>New Total:</span>
                    <span>{formatCurrency(calculateNewTotal())}</span>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-600 text-sm">{success}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowDiscountModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyDiscount}
                disabled={loading || !discountForm.discount_reason}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                {loading ? 'Applying...' : 'Apply Discount'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Cancel Bill</h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cancellation Reason
                </label>
                <textarea
                  value={cancelForm.cancellation_reason}
                  onChange={(e) => setCancelForm({ ...cancelForm, cancellation_reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Reason for cancellation..."
                />
              </div>

              {parseFloat(bill.amount_paid) > 0 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Refund Amount (Optional)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={parseFloat(bill.amount_paid)}
                      step="0.01"
                      value={cancelForm.refund_amount}
                      onChange={(e) => setCancelForm({ ...cancelForm, refund_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>

                  {cancelForm.refund_amount > 0 && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Refund Method
                        </label>
                        <select
                          value={cancelForm.refund_method}
                          onChange={(e) => setCancelForm({ ...cancelForm, refund_method: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="CASH">Cash</option>
                          <option value="BANK_TRANSFER">Bank Transfer</option>
                          <option value="CHECK">Check</option>
                          <option value="CREDIT_CARD">Credit Card</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Reference Number (Optional)
                        </label>
                        <input
                          type="text"
                          value={cancelForm.refund_reference}
                          onChange={(e) => setCancelForm({ ...cancelForm, refund_reference: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Reference number..."
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-600 text-sm">{success}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCancelBill}
                disabled={loading || !cancelForm.cancellation_reason}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {loading ? 'Cancelling...' : 'Cancel Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Process Refund</h3>
              <button
                onClick={() => setShowRefundModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refund Amount
                </label>
                <input
                  type="number"
                  min="0.01"
                  max={parseFloat(bill.amount_paid)}
                  step="0.01"
                  value={refundForm.refund_amount}
                  onChange={(e) => setRefundForm({ ...refundForm, refund_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum refundable: {formatCurrency(bill.amount_paid)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refund Reason
                </label>
                <textarea
                  value={refundForm.refund_reason}
                  onChange={(e) => setRefundForm({ ...refundForm, refund_reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Reason for refund..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refund Method
                </label>
                <select
                  value={refundForm.refund_method}
                  onChange={(e) => setRefundForm({ ...refundForm, refund_method: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHECK">Check</option>
                  <option value="CREDIT_CARD">Credit Card</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number (Optional)
                </label>
                <input
                  type="text"
                  value={refundForm.refund_reference}
                  onChange={(e) => setRefundForm({ ...refundForm, refund_reference: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Reference number..."
                />
              </div>

              {hasPermission('APPROVE_REFUND') && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="refund_requires_approval"
                    checked={refundForm.requires_approval}
                    onChange={(e) => setRefundForm({ ...refundForm, requires_approval: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="refund_requires_approval" className="text-sm text-gray-700">
                    Requires managerial approval
                  </label>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-600 text-sm">{success}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowRefundModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessRefund}
                disabled={loading || !refundForm.refund_amount || !refundForm.refund_reason}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Process Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Delete Bill</h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
                <p className="text-red-600 text-sm">
                  This action cannot be undone. The bill will be permanently deleted.
                </p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Bill Details</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Invoice:</span>
                    <span>{bill.invoice_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Patient:</span>
                    <span>{bill.patient_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount:</span>
                    <span>{formatCurrency(bill.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span>{bill.billing_status}</span>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-600 text-sm">{success}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBill}
                disabled={loading}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Delete Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Bill History</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {auditHistory.length > 0 ? (
                auditHistory.map((entry) => (
                  <div key={entry.id} className="p-3 border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="font-medium text-sm">{entry.action}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-gray-600 mb-2">
                      <User className="w-3 h-3" />
                      <span>{entry.user_name} ({entry.user_role})</span>
                    </div>
                    {(entry.old_values && Object.keys(entry.old_values).length > 0) && (
                      <div className="text-xs text-gray-600">
                        <div className="font-medium mb-1">Changes:</div>
                        <div className="pl-2 space-y-1">
                          {Object.keys(entry.old_values).map(key => (
                            <div key={key}>
                              <span className="text-gray-500">{key}:</span>
                              <span className="line-through text-red-600 ml-1">
                                {JSON.stringify(entry.old_values[key])}
                              </span>
                              <span className="text-green-600 ml-1">
                                → {JSON.stringify(entry.new_values[key])}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No history available</p>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowHistory(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillOperations;
