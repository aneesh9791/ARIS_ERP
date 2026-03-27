import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Edit, 
  Trash2, 
  Eye,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  Calendar,
  Building,
  User,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveTable from '../Common/ResponsiveTable';
import ResponsiveForm from '../Common/ResponsiveForm';
import '../styles/theme.css';

const FinancialManagement = () => {
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [trialBalance, setTrialBalance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [screenSize, setScreenSize] = useState('desktop');
  const [viewMode, setViewMode] = useState('table');
  const [activeTab, setActiveTab] = useState('accounts');

  // Detect screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
        setViewMode('cards');
      } else if (width < 1024) {
        setScreenSize('tablet');
        setViewMode('table');
      } else {
        setScreenSize('desktop');
        setViewMode('table');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const authFetch = (url, opts = {}) => fetch(url, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
    ...opts,
  });

  useEffect(() => {
    fetchChartOfAccounts();
    fetchJournalEntries();
  }, []);

  const fetchChartOfAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/chart-of-accounts?include_balances=true&limit=500');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch');
      const accounts = (data.data || data.accounts || data || []).map(a => ({
        id: a.id,
        accountCode: a.account_code,
        accountName: a.account_name,
        accountType: a.account_type,
        accountCategory: a.account_category,
        parentAccountId: a.parent_account_id,
        description: a.description,
        openingBalance: parseFloat(a.opening_balance) || 0,
        currentBalance: parseFloat(a.current_balance) || 0,
        debit: parseFloat(a.debit_balance) || 0,
        credit: parseFloat(a.credit_balance) || 0,
        totalDebits: parseFloat(a.total_debits) || 0,
        totalCredits: parseFloat(a.total_credits) || 0,
        status: a.is_active ? 'ACTIVE' : 'INACTIVE',
        centerName: a.center_name || '',
        createdBy: a.created_by_name || '',
        createdDate: a.created_at ? a.created_at.split('T')[0] : '',
        lastModified: a.updated_at ? a.updated_at.split('T')[0] : '',
        transactionCount: parseInt(a.transaction_count) || 0,
        lastTransactionDate: a.last_transaction_date,
      }));
      setChartOfAccounts(accounts);
      // Build trial balance from COA data
      const tb = accounts
        .filter(a => a.transactionCount > 0 || a.openingBalance !== 0)
        .map(a => {
          const net = parseFloat(a.openingBalance) + parseFloat(a.totalDebits) - parseFloat(a.totalCredits);
          return {
            id: a.id,
            accountCode: a.accountCode,
            accountName: a.accountName,
            accountType: a.accountType,
            openingBalance: a.openingBalance,
            totalDebit: a.totalDebits,
            totalCredit: a.totalCredits,
            closingBalance: Math.abs(net),
            balanceType: net >= 0 ? 'DEBIT' : 'CREDIT',
          };
        });
      setTrialBalance(tb);
    } catch (err) {
      setError('Failed to fetch chart of accounts: ' + err.message);
      console.error('Error fetching chart of accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchJournalEntries = async () => {
    try {
      const res = await authFetch('/api/finance/journals?limit=100');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch');
      const entries = (data.journals || data.data || data || []).map(e => ({
        id: e.id,
        entryNumber: e.entry_number,
        entryDate: e.entry_date ? e.entry_date.split('T')[0] : '',
        description: e.description,
        referenceNumber: e.source_ref || '',
        referenceType: e.source_module || '',
        totalDebit: parseFloat(e.total_debit) || 0,
        totalCredit: parseFloat(e.total_credit) || 0,
        status: e.status,
        createdBy: e.created_by_name || '',
        createdDate: e.created_at ? e.created_at.split('T')[0] : '',
        centerName: e.center_name || '',
      }));
      setJournalEntries(entries);
    } catch (err) {
      console.error('Error fetching journal entries:', err);
    }
  };

  const fetchTrialBalance = fetchChartOfAccounts;

  const handleAddAccount = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newAccount = {
        id: chartOfAccounts.length + 1,
        accountCode: formData.accountCode,
        ...formData,
        openingBalance: 0,
        currentBalance: 0,
        debit: 0,
        credit: 0,
        status: 'ACTIVE',
        createdBy: 'Admin',
        createdDate: new Date().toISOString().split('T')[0],
        lastModified: new Date().toISOString().split('T')[0]
      };
      
      setChartOfAccounts([...chartOfAccounts, newAccount]);
      setShowAddModal(false);
      alert('Account added successfully!');
    } catch (err) {
      console.error('Error adding account:', err);
      alert('Failed to add account');
    }
  };

  const handleEditAccount = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setChartOfAccounts(chartOfAccounts.map(account => 
        account.id === editingItem.id 
          ? { ...account, ...formData, lastModified: new Date().toISOString().split('T')[0] }
          : account
      ));
      setShowEditModal(false);
      setEditingItem(null);
      alert('Account updated successfully!');
    } catch (err) {
      console.error('Error updating account:', err);
      alert('Failed to update account');
    }
  };

  const handleDeleteAccount = async (accountId) => {
    if (!confirm('Are you sure you want to delete this account?')) {
      return;
    }
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setChartOfAccounts(chartOfAccounts.filter(account => account.id !== accountId));
      alert('Account deleted successfully!');
    } catch (err) {
      console.error('Error deleting account:', err);
      alert('Failed to delete account');
    }
  };

  const getAccountTypeColor = (type) => {
    switch (type) {
      case 'ASSET': return 'text-blue-600 bg-blue-100';
      case 'LIABILITY': return 'text-purple-600 bg-purple-100';
      case 'EQUITY': return 'text-green-600 bg-green-100';
      case 'REVENUE': return 'text-emerald-600 bg-emerald-100';
      case 'EXPENSE': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-600 bg-green-100';
      case 'INACTIVE': return 'text-gray-600 bg-gray-100';
      case 'SUSPENDED': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Chart of Accounts table columns
  const accountColumns = [
    {
      key: 'accountCode',
      title: 'Account Code',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'accountName',
      title: 'Account Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-sm text-gray-500">{row.accountCategory}</div>
        </div>
      )
    },
    {
      key: 'accountType',
      title: 'Type',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getAccountTypeColor(value)}`}>
          {value}
        </span>
      )
    },
    {
      key: 'currentBalance',
      title: 'Current Balance',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{formatCurrency(value)}</div>
          <div className="text-sm text-gray-500">
            {row.debit > 0 ? `Dr: ${formatCurrency(row.debit)}` : `Cr: ${formatCurrency(row.credit)}`}
          </div>
        </div>
      )
    },
    {
      key: 'centerName',
      title: 'Center',
      sortable: true
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(value)}`}>
          {value}
        </span>
      )
    },
    {
      key: 'createdDate',
      title: 'Created',
      sortable: true
    }
  ];

  // Journal Entries table columns
  const journalColumns = [
    {
      key: 'entryNumber',
      title: 'Entry Number',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'entryDate',
      title: 'Date',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-1" />
            {value}
          </div>
          <div className="text-sm text-gray-500">{row.referenceNumber}</div>
        </div>
      )
    },
    {
      key: 'description',
      title: 'Description',
      sortable: true
    },
    {
      key: 'totalDebit',
      title: 'Amount',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{formatCurrency(value)}</div>
          <div className="text-sm text-gray-500">Dr: {formatCurrency(value)} / Cr: {formatCurrency(row.totalCredit)}</div>
        </div>
      )
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
          value === 'POSTED' ? 'text-green-600 bg-green-100' :
          value === 'PENDING' ? 'text-yellow-600 bg-yellow-100' :
          'text-red-600 bg-red-100'
        }`}>
          {value}
        </span>
      )
    },
    {
      key: 'createdBy',
      title: 'Created By',
      sortable: true
    }
  ];

  // Trial Balance table columns
  const trialBalanceColumns = [
    {
      key: 'accountCode',
      title: 'Account Code',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'accountName',
      title: 'Account Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-sm text-gray-500">{row.accountType}</div>
        </div>
      )
    },
    {
      key: 'openingBalance',
      title: 'Opening Balance',
      sortable: true,
      render: (value) => formatCurrency(value)
    },
    {
      key: 'totalDebit',
      title: 'Total Debit',
      sortable: true,
      render: (value) => formatCurrency(value)
    },
    {
      key: 'totalCredit',
      title: 'Total Credit',
      sortable: true,
      render: (value) => formatCurrency(value)
    },
    {
      key: 'closingBalance',
      title: 'Closing Balance',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className={`font-medium ${
            row.balanceType === 'DEBIT' ? 'text-blue-600' : 'text-red-600'
          }`}>
            {formatCurrency(value)}
          </div>
          <div className="text-sm text-gray-500">{row.balanceType}</div>
        </div>
      )
    }
  ];

  // Form fields for chart of accounts
  const accountFormFields = [
    {
      name: 'accountCode',
      label: 'Account Code',
      type: 'text',
      required: true,
      placeholder: 'Enter account code'
    },
    {
      name: 'accountName',
      label: 'Account Name',
      type: 'text',
      required: true,
      placeholder: 'Enter account name'
    },
    {
      name: 'accountType',
      label: 'Account Type',
      type: 'select',
      required: true,
      options: [
        { value: 'ASSET', label: 'Asset' },
        { value: 'LIABILITY', label: 'Liability' },
        { value: 'EQUITY', label: 'Equity' },
        { value: 'REVENUE', label: 'Revenue' },
        { value: 'EXPENSE', label: 'Expense' }
      ]
    },
    {
      name: 'accountCategory',
      label: 'Account Category',
      type: 'text',
      required: true,
      placeholder: 'Enter account category'
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      placeholder: 'Enter description'
    },
    {
      name: 'openingBalance',
      label: 'Opening Balance',
      type: 'number',
      required: true,
      placeholder: 'Enter opening balance'
    },
    {
      name: 'centerId',
      label: 'Center',
      type: 'select',
      required: true,
      options: [
        { value: 1, label: 'Main Hospital' },
        { value: 2, label: 'Diagnostic Center' },
        { value: 3, label: 'Clinic Branch' }
      ]
    },
    {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      placeholder: 'Enter notes'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Financial Management</h1>
          <p className="text-gray-600 mt-1">Manage chart of accounts, journal entries, and financial reports</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Account
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'accounts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Chart of Accounts
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'journal'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Journal Entries
          </button>
          <button
            onClick={() => setActiveTab('trial')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'trial'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Trial Balance
          </button>
        </nav>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Accounts</p>
              <p className="text-2xl font-bold text-gray-900">{chartOfAccounts.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Assets</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(
                  chartOfAccounts
                    .filter(a => a.accountType === 'ASSET')
                    .reduce((sum, a) => sum + a.currentBalance, 0)
                )}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Liabilities</p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(
                  chartOfAccounts
                    .filter(a => a.accountType === 'LIABILITY')
                    .reduce((sum, a) => sum + a.currentBalance, 0)
                )}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Net Income</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(
                  chartOfAccounts
                    .filter(a => a.accountType === 'REVENUE')
                    .reduce((sum, a) => sum + a.currentBalance, 0) -
                  chartOfAccounts
                    .filter(a => a.accountType === 'EXPENSE')
                    .reduce((sum, a) => sum + a.currentBalance, 0)
                )}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>
      </div>

      {/* Tab Content */}
      {activeTab === 'accounts' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={chartOfAccounts}
            columns={accountColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={true}
            onSelectionChange={setSelectedItems}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchChartOfAccounts}
          />
        </ResponsiveCard>
      )}

      {activeTab === 'journal' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={journalEntries}
            columns={journalColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={false}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchJournalEntries}
          />
        </ResponsiveCard>
      )}

      {activeTab === 'trial' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={trialBalance}
            columns={trialBalanceColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={false}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchTrialBalance}
          />
        </ResponsiveCard>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Add New Account</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={accountFormFields}
                onSubmit={handleAddAccount}
                onCancel={() => setShowAddModal(false)}
                submitText="Add Account"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Edit Account</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={accountFormFields}
                initialValues={editingItem}
                onSubmit={handleEditAccount}
                onCancel={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
                submitText="Update Account"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialManagement;
