import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Edit, 
  Trash2, 
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Wrench,
  Building
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveTable from '../Common/ResponsiveTable';
import ResponsiveForm from '../Common/ResponsiveForm';
import '../styles/theme.css';

const AssetManagement = () => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [screenSize, setScreenSize] = useState('desktop');
  const [viewMode, setViewMode] = useState('table');

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

  // Mock API call - replace with real API
  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockAssets = [
        {
          id: 1,
          assetCode: 'MRI-001',
          assetName: 'MRI Machine - Siemens Skyra',
          assetType: 'SCANNER',
          category: 'Medical Equipment',
          manufacturer: 'Siemens Healthineers',
          model: 'Skyra 3T',
          serialNumber: 'SN-MRI-001',
          purchaseDate: '2023-01-15',
          purchaseCost: 2500000,
          currentValue: 2000000,
          status: 'ACTIVE',
          location: 'Radiology Department',
          centerId: 1,
          centerName: 'Main Hospital',
          warrantyExpiry: '2025-01-15',
          lastMaintenanceDate: '2024-02-15',
          nextMaintenanceDate: '2024-05-15',
          condition: 'EXCELLENT',
          utilizationRate: 85,
          operatingHours: 8760,
          assignedTo: 'Dr. Smith',
          notes: 'Primary MRI machine for neurological imaging'
        },
        {
          id: 2,
          assetCode: 'CT-001',
          assetName: 'CT Scanner - GE Revolution',
          assetType: 'SCANNER',
          category: 'Medical Equipment',
          manufacturer: 'GE Healthcare',
          model: 'Revolution ACT',
          serialNumber: 'SN-CT-001',
          purchaseDate: '2023-03-20',
          purchaseCost: 1800000,
          currentValue: 1500000,
          status: 'ACTIVE',
          location: 'Radiology Department',
          centerId: 1,
          centerName: 'Main Hospital',
          warrantyExpiry: '2024-12-20',
          lastMaintenanceDate: '2024-01-20',
          nextMaintenanceDate: '2024-04-20',
          condition: 'GOOD',
          utilizationRate: 75,
          operatingHours: 6570,
          assignedTo: 'Dr. Johnson',
          notes: 'Multi-slice CT scanner for routine imaging'
        },
        {
          id: 3,
          assetCode: 'XRY-001',
          assetName: 'X-Ray Machine - Philips DigitalDiagnost',
          assetType: 'XRAY',
          category: 'Medical Equipment',
          manufacturer: 'Philips Healthcare',
          model: 'DigitalDiagnost C90',
          serialNumber: 'SN-XRY-001',
          purchaseDate: '2022-11-10',
          purchaseCost: 800000,
          currentValue: 600000,
          status: 'ACTIVE',
          location: 'Radiology Department',
          centerId: 1,
          centerName: 'Main Hospital',
          warrantyExpiry: '2024-11-10',
          lastMaintenanceDate: '2024-02-10',
          nextMaintenanceDate: '2024-05-10',
          condition: 'GOOD',
          utilizationRate: 90,
          operatingHours: 8760,
          assignedTo: 'Dr. Williams',
          notes: 'Digital X-ray system for general radiography'
        },
        {
          id: 4,
          assetCode: 'US-001',
          assetName: 'Ultrasound Machine - GE Voluson',
          assetType: 'ULTRASOUND',
          category: 'Medical Equipment',
          manufacturer: 'GE Healthcare',
          model: 'Voluson E10',
          serialNumber: 'SN-US-001',
          purchaseDate: '2023-06-15',
          purchaseCost: 600000,
          currentValue: 500000,
          status: 'ACTIVE',
          location: 'Obstetrics Department',
          centerId: 1,
          centerName: 'Main Hospital',
          warrantyExpiry: '2025-06-15',
          lastMaintenanceDate: '2024-01-15',
          nextMaintenanceDate: '2024-04-15',
          condition: 'EXCELLENT',
          utilizationRate: 80,
          operatingHours: 4380,
          assignedTo: 'Dr. Brown',
          notes: 'High-end ultrasound for obstetrics and gynecology'
        },
        {
          id: 5,
          assetCode: 'WS-001',
          assetName: 'Workstation - Dell OptiPlex',
          assetType: 'COMPUTER',
          category: 'IT Equipment',
          manufacturer: 'Dell Technologies',
          model: 'OptiPlex 7090',
          serialNumber: 'SN-WS-001',
          purchaseDate: '2023-02-01',
          purchaseCost: 80000,
          currentValue: 60000,
          status: 'ACTIVE',
          location: 'Front Office',
          centerId: 1,
          centerName: 'Main Hospital',
          warrantyExpiry: '2024-02-01',
          lastMaintenanceDate: '2024-01-01',
          nextMaintenanceDate: '2024-04-01',
          condition: 'GOOD',
          utilizationRate: 95,
          operatingHours: 8760,
          assignedTo: 'Reception Staff',
          notes: 'Front office workstation for patient registration'
        }
      ];
      
      setAssets(mockAssets);
    } catch (err) {
      setError('Failed to fetch assets');
      console.error('Error fetching assets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAsset = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newAsset = {
        id: assets.length + 1,
        ...formData,
        status: 'ACTIVE',
        currentValue: formData.purchaseCost,
        operatingHours: 0,
        utilizationRate: 0,
        condition: 'EXCELLENT'
      };
      
      setAssets([...assets, newAsset]);
      setShowAddModal(false);
      // Show success message
      alert('Asset added successfully!');
    } catch (err) {
      console.error('Error adding asset:', err);
      alert('Failed to add asset');
    }
  };

  const handleEditAsset = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setAssets(assets.map(asset => 
        asset.id === editingAsset.id 
          ? { ...asset, ...formData }
          : asset
      ));
      setShowEditModal(false);
      setEditingAsset(null);
      // Show success message
      alert('Asset updated successfully!');
    } catch (err) {
      console.error('Error updating asset:', err);
      alert('Failed to update asset');
    }
  };

  const handleDeleteAsset = async (assetId) => {
    if (!confirm('Are you sure you want to delete this asset?')) {
      return;
    }
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setAssets(assets.filter(asset => asset.id !== assetId));
      // Show success message
      alert('Asset deleted successfully!');
    } catch (err) {
      console.error('Error deleting asset:', err);
      alert('Failed to delete asset');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-600 bg-green-100';
      case 'INACTIVE': return 'text-gray-600 bg-gray-100';
      case 'MAINTENANCE': return 'text-yellow-600 bg-yellow-100';
      case 'RETIRED': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getConditionColor = (condition) => {
    switch (condition) {
      case 'EXCELLENT': return 'text-green-600 bg-green-100';
      case 'GOOD': return 'text-blue-600 bg-blue-100';
      case 'FAIR': return 'text-yellow-600 bg-yellow-100';
      case 'POOR': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Table columns
  const columns = [
    {
      key: 'assetCode',
      title: 'Asset Code',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'assetName',
      title: 'Asset Name',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'assetType',
      title: 'Type',
      sortable: true,
      render: (value) => (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
          {value}
        </span>
      )
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
      key: 'location',
      title: 'Location',
      sortable: true
    },
    {
      key: 'purchaseCost',
      title: 'Purchase Cost',
      sortable: true,
      render: (value) => formatCurrency(value)
    },
    {
      key: 'currentValue',
      title: 'Current Value',
      sortable: true,
      render: (value) => formatCurrency(value)
    },
    {
      key: 'utilizationRate',
      title: 'Utilization',
      sortable: true,
      render: (value) => (
        <div className="flex items-center">
          <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
            <div 
              className={`h-2 rounded-full ${
                value > 80 ? 'bg-green-500' : 
                value > 60 ? 'bg-yellow-500' : 
                'bg-red-500'
              }`}
              style={{ width: `${value}%` }}
            />
          </div>
          <span className="text-sm">{value}%</span>
        </div>
      )
    },
    {
      key: 'condition',
      title: 'Condition',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getConditionColor(value)}`}>
          {value}
        </span>
      )
    }
  ];

  // Form fields
  const formFields = [
    {
      name: 'assetCode',
      label: 'Asset Code',
      type: 'text',
      required: true,
      placeholder: 'Enter asset code'
    },
    {
      name: 'assetName',
      label: 'Asset Name',
      type: 'text',
      required: true,
      placeholder: 'Enter asset name'
    },
    {
      name: 'assetType',
      label: 'Asset Type',
      type: 'select',
      required: true,
      options: [
        { value: 'SCANNER', label: 'Scanner' },
        { value: 'XRAY', label: 'X-Ray' },
        { value: 'ULTRASOUND', label: 'Ultrasound' },
        { value: 'MRI', label: 'MRI' },
        { value: 'CT', label: 'CT' },
        { value: 'COMPUTER', label: 'Computer' },
        { value: 'PRINTER', label: 'Printer' },
        { value: 'OTHER', label: 'Other' }
      ]
    },
    {
      name: 'manufacturer',
      label: 'Manufacturer',
      type: 'text',
      required: true,
      placeholder: 'Enter manufacturer'
    },
    {
      name: 'model',
      label: 'Model',
      type: 'text',
      required: true,
      placeholder: 'Enter model'
    },
    {
      name: 'serialNumber',
      label: 'Serial Number',
      type: 'text',
      required: true,
      placeholder: 'Enter serial number'
    },
    {
      name: 'purchaseDate',
      label: 'Purchase Date',
      type: 'date',
      required: true
    },
    {
      name: 'purchaseCost',
      label: 'Purchase Cost',
      type: 'number',
      required: true,
      placeholder: 'Enter purchase cost'
    },
    {
      name: 'location',
      label: 'Location',
      type: 'text',
      required: true,
      placeholder: 'Enter location'
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
      name: 'assignedTo',
      label: 'Assigned To',
      type: 'text',
      placeholder: 'Enter assigned person'
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Asset Management</h1>
          <p className="text-gray-600 mt-1">Manage and track hospital assets</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Asset
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Assets</p>
              <p className="text-2xl font-bold text-gray-900">{assets.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Assets</p>
              <p className="text-2xl font-bold text-green-600">
                {assets.filter(a => a.status === 'ACTIVE').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Under Maintenance</p>
              <p className="text-2xl font-bold text-yellow-600">
                {assets.filter(a => a.status === 'MAINTENANCE').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center">
              <Wrench className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(assets.reduce((sum, asset) => sum + asset.currentValue, 0))}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
              <Building className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>
      </div>

      {/* Assets Table */}
      <ResponsiveCard>
        <ResponsiveTable
          data={assets}
          columns={columns}
          loading={loading}
          error={error}
          searchable={true}
          selectable={true}
          onSelectionChange={setSelectedAssets}
          viewMode={viewMode}
          showViewToggle={true}
          onRefresh={fetchAssets}
        />
      </ResponsiveCard>

      {/* Add Asset Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Add New Asset</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={formFields}
                onSubmit={handleAddAsset}
                onCancel={() => setShowAddModal(false)}
                submitText="Add Asset"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Asset Modal */}
      {showEditModal && editingAsset && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Edit Asset</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={formFields}
                initialValues={editingAsset}
                onSubmit={handleEditAsset}
                onCancel={() => {
                  setShowEditModal(false);
                  setEditingAsset(null);
                }}
                submitText="Update Asset"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetManagement;
