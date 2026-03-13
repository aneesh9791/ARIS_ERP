import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Monitor, 
  Server, 
  Smartphone, 
  Database, 
  Shield, 
  FileText, 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Calendar, 
  Upload, 
  Download, 
  Edit, 
  Trash2, 
  Plus, 
  Search, 
  Filter, 
  RefreshCw, 
  BarChart3,
  PieChart,
  Activity,
  Users,
  Building,
  Wrench,
  FileSignature,
  CreditCard,
  Target,
  Award,
  Settings,
  Eye,
  Calculator,
  AlertTriangle,
  Info,
  X,
  Save,
  ChevronDown,
  ChevronUp,
  Zap,
  Cpu,
  HardDrive,
  Cloud,
  Key,
  Certificate,
  Receipt
} from 'lucide-react';

interface Asset {
  id: number;
  asset_code: string;
  asset_name: string;
  asset_category: 'TANGIBLE' | 'INTANGIBLE';
  asset_type: string;
  asset_subtype: string;
  description: string;
  center_id: number;
  center_name: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  purchase_date: string;
  purchase_cost: number;
  current_value: number;
  total_expenses: number;
  depreciation_rate: number;
  warranty_expiry: string;
  location: string;
  assigned_to: string;
  status: string;
  license_key: string;
  license_expiry: string;
  vendor_id: number;
  vendor_name: string;
  contract_start_date: string;
  contract_end_date: string;
  lifecycle_status: string;
  performance_rating: number;
  utilization_rate: number;
  active_contracts: number;
  expense_count: number;
  lifecycle_events: number;
  performance_records: number;
  alert_status: string;
}

interface AssetExpense {
  id: number;
  asset_id: number;
  expense_type: string;
  expense_category: 'CAPEX' | 'OPEX';
  amount: number;
  expense_date: string;
  description: string;
  vendor_id: number;
  invoice_number: string;
  payment_status: string;
}

interface AssetContract {
  id: number;
  contract_type: 'SLA' | 'AMC' | 'CMS' | 'WARRANTY' | 'LICENSE';
  contract_number: string;
  vendor_name: string;
  contract_start_date: string;
  contract_end_date: string;
  contract_value: number;
  billing_cycle: string;
  service_level: string;
  response_time: string;
  availability_guarantee: string;
  status: string;
  days_to_expiry: number;
}

interface AssetVendor {
  id: number;
  vendor_code: string;
  vendor_name: string;
  contact_person: string;
  email: string;
  phone: string;
  vendor_type: string;
  payment_terms: string;
  rating: number;
  assets_count: number;
  contracts_count: number;
  total_contract_value: number;
}

interface AssetType {
  id: number;
  type_code: string;
  name: string;
  description: string;
  depreciation_method: string;
  useful_life_years: number;
  assets_count: number;
}

const AssetManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'assets' | 'expenses' | 'contracts' | 'vendors' | 'analytics'>('assets');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data states
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [assetExpenses, setAssetExpenses] = useState<AssetExpense[]>([]);
  const [assetContracts, setAssetContracts] = useState<AssetContract[]>([]);
  const [vendors, setVendors] = useState<AssetVendor[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [expiringContracts, setExpiringContracts] = useState<AssetContract[]>([]);

  // Modal states
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showAssetDetailsModal, setShowAssetDetailsModal] = useState(false);

  // Filter states
  const [filters, setFilters] = useState({
    center_id: '',
    asset_category: '',
    asset_type: '',
    lifecycle_status: '',
    vendor_id: ''
  });

  // Form states
  const [assetForm, setAssetForm] = useState({
    asset_code: '',
    asset_name: '',
    asset_category: 'TANGIBLE' as 'TANGIBLE' | 'INTANGIBLE',
    asset_type: '',
    asset_subtype: '',
    description: '',
    center_id: '',
    manufacturer: '',
    model: '',
    serial_number: '',
    purchase_date: '',
    purchase_cost: '',
    depreciation_rate: '',
    warranty_expiry: '',
    location: '',
    assigned_to: '',
    status: 'ACTIVE',
    license_key: '',
    license_expiry: '',
    vendor_id: '',
    contract_start_date: '',
    contract_end_date: ''
  });

  const [expenseForm, setExpenseForm] = useState({
    expense_type: 'MAINTENANCE',
    expense_category: 'OPEX' as 'CAPEX' | 'OPEX',
    amount: '',
    expense_date: '',
    description: '',
    vendor_id: '',
    invoice_number: ''
  });

  const [contractForm, setContractForm] = useState({
    contract_type: 'SLA' as 'SLA' | 'AMC' | 'CMS' | 'WARRANTY' | 'LICENSE',
    contract_number: '',
    vendor_id: '',
    contract_start_date: '',
    contract_end_date: '',
    billing_cycle: 'ANNUAL',
    contract_value: '',
    service_level: '',
    response_time: '',
    availability_guarantee: '',
    coverage_details: '',
    exclusions: ''
  });

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // Fetch assets
  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ...filters,
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      });
      
      const response = await fetch(`/api/asset-management/assets?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setAssets(data.data.assets);
        setPagination(data.data.pagination);
      } else {
        setError('Failed to fetch assets');
      }
    } catch (error) {
      setError('Error fetching assets');
    } finally {
      setLoading(false);
    }
  };

  // Fetch vendors
  const fetchVendors = async () => {
    try {
      const response = await fetch('/api/asset-management/vendors');
      const data = await response.json();
      
      if (data.success) {
        setVendors(data.data);
      }
    } catch (error) {
      setError('Error fetching vendors');
    }
  };

  // Fetch asset types
  const fetchAssetTypes = async () => {
    try {
      const response = await fetch('/api/asset-management/asset-types');
      const data = await response.json();
      
      if (data.success) {
        setAssetTypes(data.data);
      }
    } catch (error) {
      setError('Error fetching asset types');
    }
  };

  // Fetch expiring contracts
  const fetchExpiringContracts = async () => {
    try {
      const response = await fetch('/api/asset-management/contracts/expiring?days=30');
      const data = await response.json();
      
      if (data.success) {
        setExpiringContracts(data.data);
      }
    } catch (error) {
      setError('Error fetching expiring contracts');
    }
  };

  // Create asset
  const createAsset = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/asset-management/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assetForm)
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess('Asset created successfully');
        setShowAssetModal(false);
        resetAssetForm();
        fetchAssets();
      } else {
        setError('Failed to create asset');
      }
    } catch (error) {
      setError('Error creating asset');
    } finally {
      setLoading(false);
    }
  };

  // Add expense
  const addExpense = async () => {
    if (!selectedAsset) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/asset-management/assets/${selectedAsset.id}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expenseForm)
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess('Expense added successfully');
        setShowExpenseModal(false);
        resetExpenseForm();
        fetchAssetExpenses(selectedAsset.id);
      } else {
        setError('Failed to add expense');
      }
    } catch (error) {
      setError('Error adding expense');
    } finally {
      setLoading(false);
    }
  };

  // Create contract
  const createContract = async () => {
    if (!selectedAsset) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/asset-management/assets/${selectedAsset.id}/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contractForm)
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess('Contract created successfully');
        setShowContractModal(false);
        resetContractForm();
        fetchAssetContracts(selectedAsset.id);
      } else {
        setError('Failed to create contract');
      }
    } catch (error) {
      setError('Error creating contract');
    } finally {
      setLoading(false);
    }
  };

  // Fetch asset expenses
  const fetchAssetExpenses = async (assetId: number) => {
    try {
      const response = await fetch(`/api/asset-management/assets/${assetId}/financial`);
      const data = await response.json();
      
      if (data.success) {
        // This would need a separate endpoint for expenses
        // For now, we'll use the financial summary
        console.log('Asset financial summary:', data.data);
      }
    } catch (error) {
      setError('Error fetching asset expenses');
    }
  };

  // Fetch asset contracts
  const fetchAssetContracts = async (assetId: number) => {
    try {
      const response = await fetch(`/api/asset-management/assets/${assetId}/contracts`);
      const data = await response.json();
      
      if (data.success) {
        setAssetContracts(data.data);
      }
    } catch (error) {
      setError('Error fetching asset contracts');
    }
  };

  // Reset forms
  const resetAssetForm = () => {
    setAssetForm({
      asset_code: '',
      asset_name: '',
      asset_category: 'TANGIBLE',
      asset_type: '',
      asset_subtype: '',
      description: '',
      center_id: '',
      manufacturer: '',
      model: '',
      serial_number: '',
      purchase_date: '',
      purchase_cost: '',
      depreciation_rate: '',
      warranty_expiry: '',
      location: '',
      assigned_to: '',
      status: 'ACTIVE',
      license_key: '',
      license_expiry: '',
      vendor_id: '',
      contract_start_date: '',
      contract_end_date: ''
    });
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      expense_type: 'MAINTENANCE',
      expense_category: 'OPEX',
      amount: '',
      expense_date: '',
      description: '',
      vendor_id: '',
      invoice_number: ''
    });
  };

  const resetContractForm = () => {
    setContractForm({
      contract_type: 'SLA',
      contract_number: '',
      vendor_id: '',
      contract_start_date: '',
      contract_end_date: '',
      billing_cycle: 'ANNUAL',
      contract_value: '',
      service_level: '',
      response_time: '',
      availability_guarantee: '',
      coverage_details: '',
      exclusions: ''
    });
  };

  // Get asset icon based on type
  const getAssetIcon = (assetType: string, assetCategory: string) => {
    if (assetCategory === 'INTANGIBLE') {
      switch (assetType) {
        case 'SOFTWARE': return <Monitor className="w-5 h-5" />;
        case 'CLOUD_SERVICE': return <Cloud className="w-5 h-5" />;
        case 'DATABASE': return <Database className="w-5 h-5" />;
        case 'SSL_CERT': return <Shield className="w-5 h-5" />;
        default: return <FileText className="w-5 h-5" />;
      }
    } else {
      switch (assetType) {
        case 'SCANNER': return <Activity className="w-5 h-5" />;
        case 'COMPUTER': return <Monitor className="w-5 h-5" />;
        case 'WORKSTATION': return <Cpu className="w-5 h-5" />;
        case 'PRINTER': return <FileText className="w-5 h-5" />;
        case 'NETWORK': return <Server className="w-5 h-5" />;
        default: return <Package className="w-5 h-5" />;
      }
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  // Effects
  useEffect(() => {
    fetchAssets();
    fetchVendors();
    fetchAssetTypes();
    fetchExpiringContracts();
  }, [filters, pagination.page]);

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Asset Management</h2>
        <p className="text-gray-600 mt-1">Manage tangible and intangible assets with complete lifecycle tracking</p>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-600">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
            <span className="text-green-600">{success}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('assets')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'assets'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Package className="w-4 h-4 inline mr-2" />
            Assets
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'expenses'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CreditCard className="w-4 h-4 inline mr-2" />
            Expenses
          </button>
          <button
            onClick={() => setActiveTab('contracts')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'contracts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileSignature className="w-4 h-4 inline mr-2" />
            Contracts
          </button>
          <button
            onClick={() => setActiveTab('vendors')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'vendors'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Building className="w-4 h-4 inline mr-2" />
            Vendors
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'analytics'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <BarChart3 className="w-4 h-4 inline mr-2" />
            Analytics
          </button>
        </nav>
      </div>

      {/* Assets Tab */}
      {activeTab === 'assets' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <select
              value={filters.asset_category}
              onChange={(e) => setFilters({ ...filters, asset_category: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              <option value="TANGIBLE">Tangible</option>
              <option value="INTANGIBLE">Intangible</option>
            </select>

            <select
              value={filters.asset_type}
              onChange={(e) => setFilters({ ...filters, asset_type: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              {assetTypes.map(type => (
                <option key={type.type_code} value={type.type_code}>{type.name}</option>
              ))}
            </select>

            <select
              value={filters.lifecycle_status}
              onChange={(e) => setFilters({ ...filters, lifecycle_status: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="MAINTENANCE">Under Maintenance</option>
              <option value="RETIRED">Retired</option>
              <option value="DISPOSED">Disposed</option>
            </select>

            <button
              onClick={() => setShowAssetModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Asset
            </button>

            <button
              onClick={fetchAssets}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Assets Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Center</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contracts</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alerts</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {assets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-gray-100 rounded-lg">
                          {getAssetIcon(asset.asset_type, asset.asset_category)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{asset.asset_name}</div>
                          <div className="text-sm text-gray-500">{asset.asset_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        asset.asset_category === 'TANGIBLE' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {asset.asset_category}
                      </span>
                      <div className="text-sm text-gray-500 mt-1">{asset.asset_type}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {asset.center_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatCurrency(asset.current_value)}</div>
                      <div className="text-sm text-gray-500">Total: {formatCurrency(asset.total_expenses + asset.current_value)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        asset.status === 'ACTIVE' 
                          ? 'bg-green-100 text-green-800'
                          : asset.status === 'MAINTENANCE'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {asset.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {asset.active_contracts} active
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {asset.alert_status !== 'NORMAL' && (
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          asset.alert_status === 'EXPIRING_SOON' || asset.alert_status === 'CONTRACT_EXPIRING'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {asset.alert_status.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedAsset(asset);
                          setShowAssetDetailsModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="text-green-600 hover:text-green-900 mr-3">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="text-red-600 hover:text-red-900">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <div className="text-sm text-gray-700">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} results
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                disabled={pagination.page === 1}
                className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                disabled={pagination.page === pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contracts Tab */}
      {activeTab === 'contracts' && (
        <div>
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Contract Management</h3>
            
            {/* Expiring Contracts Alert */}
            {expiringContracts.length > 0 && (
              <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center mb-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600 mr-2" />
                  <span className="font-medium text-orange-800">
                    {expiringContracts.length} contracts expiring in the next 30 days
                  </span>
                </div>
                <div className="space-y-2">
                  {expiringContracts.slice(0, 3).map((contract) => (
                    <div key={contract.id} className="text-sm text-orange-700">
                      {contract.asset_name} - {contract.contract_type} expires in {contract.days_to_expiry} days
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Contracts List */}
          <div className="space-y-4">
            {selectedAsset && assetContracts.map((contract) => (
              <div key={contract.id} className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-gray-900">{contract.contract_number}</h4>
                    <div className="mt-1 space-y-1">
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Type:</span> {contract.contract_type}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Vendor:</span> {contract.vendor_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Value:</span> {formatCurrency(contract.contract_value)}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Service Level:</span> {contract.service_level}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      contract.status === 'ACTIVE' 
                        ? 'bg-green-100 text-green-800'
                        : contract.status === 'EXPIRING_SOON'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {contract.status}
                    </span>
                    <div className="text-sm text-gray-500 mt-1">
                      {contract.days_to_expiry} days to expiry
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vendors Tab */}
      {activeTab === 'vendors' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Vendor Management</h3>
            <button
              onClick={() => setShowVendorModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Vendor
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vendors.map((vendor) => (
              <div key={vendor.id} className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-gray-900">{vendor.vendor_name}</h4>
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${
                          i < vendor.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <div><span className="font-medium">Type:</span> {vendor.vendor_type}</div>
                  <div><span className="font-medium">Contact:</span> {vendor.contact_person}</div>
                  <div><span className="font-medium">Email:</span> {vendor.email}</div>
                  <div><span className="font-medium">Assets:</span> {vendor.assets_count}</div>
                  <div><span className="font-medium">Contracts:</span> {vendor.contracts_count}</div>
                  <div><span className="font-medium">Total Value:</span> {formatCurrency(vendor.total_contract_value)}</div>
                </div>
                <div className="flex justify-end space-x-2 mt-4">
                  <button className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-red-600 hover:bg-red-50 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Asset Analytics</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Total Assets</span>
                <Package className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{assets.length}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Total Value</span>
                <DollarSign className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(assets.reduce((sum, asset) => sum + asset.current_value, 0))}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Active Contracts</span>
                <FileSignature className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {assets.reduce((sum, asset) => sum + asset.active_contracts, 0)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Expiring Soon</span>
                <AlertTriangle className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-orange-600">{expiringContracts.length}</div>
            </div>
          </div>

          {/* Asset Category Distribution */}
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h4 className="font-medium text-gray-900 mb-4">Asset Category Distribution</h4>
            <div className="space-y-3">
              {['TANGIBLE', 'INTANGIBLE'].map((category) => {
                const categoryAssets = assets.filter(asset => asset.asset_category === category);
                const percentage = assets.length > 0 ? (categoryAssets.length / assets.length * 100).toFixed(1) : 0;
                
                return (
                  <div key={category} className="flex items-center">
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{category}</span>
                        <span className="text-sm text-gray-500">{categoryAssets.length} ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Asset Creation Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add New Asset</h3>
              <button
                onClick={() => setShowAssetModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset Code</label>
                  <input
                    type="text"
                    value={assetForm.asset_code}
                    onChange={(e) => setAssetForm({ ...assetForm, asset_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter asset code"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name</label>
                  <input
                    type="text"
                    value={assetForm.asset_name}
                    onChange={(e) => setAssetForm({ ...assetForm, asset_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter asset name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={assetForm.asset_category}
                    onChange={(e) => setAssetForm({ ...assetForm, asset_category: e.target.value as 'TANGIBLE' | 'INTANGIBLE' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="TANGIBLE">Tangible</option>
                    <option value="INTANGIBLE">Intangible</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset Type</label>
                  <select
                    value={assetForm.asset_type}
                    onChange={(e) => setAssetForm({ ...assetForm, asset_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select type</option>
                    {assetTypes.map(type => (
                      <option key={type.type_code} value={type.type_code}>{type.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={assetForm.description}
                  onChange={(e) => setAssetForm({ ...assetForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter asset description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                  <input
                    type="date"
                    value={assetForm.purchase_date}
                    onChange={(e) => setAssetForm({ ...assetForm, purchase_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Cost</label>
                  <input
                    type="number"
                    value={assetForm.purchase_cost}
                    onChange={(e) => setAssetForm({ ...assetForm, purchase_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter purchase cost"
                  />
                </div>
              </div>

              {assetForm.asset_category === 'INTANGIBLE' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">License Key</label>
                    <input
                      type="text"
                      value={assetForm.license_key}
                      onChange={(e) => setAssetForm({ ...assetForm, license_key: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter license key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">License Expiry</label>
                    <input
                      type="date"
                      value={assetForm.license_expiry}
                      onChange={(e) => setAssetForm({ ...assetForm, license_expiry: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAssetModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={createAsset}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Asset'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Asset Details Modal */}
      {showAssetDetailsModal && selectedAsset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Asset Details</h3>
              <button
                onClick={() => setShowAssetDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Asset Information */}
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Basic Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Asset Code:</span>
                      <span className="font-medium">{selectedAsset.asset_code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Asset Name:</span>
                      <span className="font-medium">{selectedAsset.asset_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Category:</span>
                      <span className="font-medium">{selectedAsset.asset_category}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type:</span>
                      <span className="font-medium">{selectedAsset.asset_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status:</span>
                      <span className="font-medium">{selectedAsset.status}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Financial Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Purchase Cost:</span>
                      <span className="font-medium">{formatCurrency(selectedAsset.purchase_cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Current Value:</span>
                      <span className="font-medium">{formatCurrency(selectedAsset.current_value)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Expenses:</span>
                      <span className="font-medium">{formatCurrency(selectedAsset.total_expenses)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Cost of Ownership:</span>
                      <span className="font-medium">
                        {formatCurrency(selectedAsset.purchase_cost + selectedAsset.total_expenses)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Actions</h4>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setShowExpenseModal(true);
                        setShowAssetDetailsModal(false);
                      }}
                      className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Add Expense
                    </button>
                    <button
                      onClick={() => {
                        setShowContractModal(true);
                        setShowAssetDetailsModal(false);
                      }}
                      className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center"
                    >
                      <FileSignature className="w-4 h-4 mr-2" />
                      Add Contract
                    </button>
                    <button className="w-full px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center justify-center">
                      <Calculator className="w-4 h-4 mr-2" />
                      Calculate ROI
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Contracts</h4>
                  <div className="space-y-2">
                    {assetContracts.map((contract) => (
                      <div key={contract.id} className="p-2 bg-gray-50 rounded text-sm">
                        <div className="font-medium">{contract.contract_number}</div>
                        <div className="text-gray-500">{contract.contract_type} - {contract.vendor_name}</div>
                        <div className="text-gray-500">Expires: {contract.days_to_expiry} days</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && selectedAsset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add Expense</h3>
              <button
                onClick={() => setShowExpenseModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expense Type</label>
                <select
                  value={expenseForm.expense_type}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="UPGRADE">Upgrade</option>
                  <option value="LICENSE">License</option>
                  <option value="REPAIR">Repair</option>
                  <option value="DISPOSAL">Disposal</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={expenseForm.expense_category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_category: e.target.value as 'CAPEX' | 'OPEX' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="CAPEX">Capital Expense</option>
                  <option value="OPEX">Operating Expense</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter amount"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter description"
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={addExpense}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Add Expense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contract Modal */}
      {showContractModal && selectedAsset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add Contract</h3>
              <button
                onClick={() => setShowContractModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contract Type</label>
                <select
                  value={contractForm.contract_type}
                  onChange={(e) => setContractForm({ ...contractForm, contract_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="SLA">Service Level Agreement</option>
                  <option value="AMC">Annual Maintenance Contract</option>
                  <option value="CMS">Comprehensive Maintenance</option>
                  <option value="WARRANTY">Warranty</option>
                  <option value="LICENSE">License</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contract Number</label>
                <input
                  type="text"
                  value={contractForm.contract_number}
                  onChange={(e) => setContractForm({ ...contractForm, contract_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter contract number"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={contractForm.contract_start_date}
                    onChange={(e) => setContractForm({ ...contractForm, contract_start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={contractForm.contract_end_date}
                    onChange={(e) => setContractForm({ ...contractForm, contract_end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contract Value</label>
                <input
                  type="number"
                  value={contractForm.contract_value}
                  onChange={(e) => setContractForm({ ...contractForm, contract_value: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter contract value"
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowContractModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={createContract}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Contract'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetManagement;
