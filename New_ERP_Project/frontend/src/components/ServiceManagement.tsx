import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter, 
  Download, 
  Upload, 
  Copy, 
  Eye, 
  Save, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Info,
  Settings,
  Package,
  FileText,
  Calculator,
  Building,
  Tag,
  DollarSign,
  Percent,
  Database,
  BarChart3,
  PieChart,
  TrendingUp,
  Users,
  Layers,
  Grid3x3,
  List,
  RefreshCw
} from 'lucide-react';

// Interfaces
interface Service {
  id: number;
  study_code: string;
  study_name: string;
  study_type: string;
  base_rate: string;
  gst_rate: number;
  is_taxable: boolean;
  cess_rate: number;
  hsn_code: string;
  sac_code: string;
  category: string;
  department: string;
  description: string;
  gst_applicable: boolean;
  tax_category: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ServiceStatistics {
  total_services: number;
  taxable_services: number;
  exempt_services: number;
  zero_gst_services: number;
  gst_5_percent_services: number;
  gst_12_percent_services: number;
  gst_18_percent_services: number;
  gst_28_percent_services: number;
  avg_base_rate: number;
  max_base_rate: number;
  min_base_rate: number;
}

interface CategoryStats {
  category: string;
  service_count: number;
  taxable_count: number;
  exempt_count: number;
  avg_gst_rate: number;
  max_gst_rate: number;
  min_gst_rate: number;
  total_base_rate: number;
}

interface DepartmentStats {
  department: string;
  service_count: number;
  taxable_count: number;
  exempt_count: number;
  avg_gst_rate: number;
  total_base_rate: number;
}

const ServiceManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'services' | 'statistics' | 'categories'>('services');
  const [services, setServices] = useState<Service[]>([]);
  const [filteredServices, setFilteredServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Statistics
  const [statistics, setStatistics] = useState<ServiceStatistics | null>(null);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [departmentStats, setDepartmentStats] = useState<DepartmentStats[]>([]);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedGSTRate, setSelectedGSTRate] = useState('');
  const [selectedTaxable, setSelectedTaxable] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  // Form states
  const [newService, setNewService] = useState({
    study_code: '',
    study_name: '',
    study_type: 'SERVICE',
    base_rate: '',
    gst_rate: 0.18,
    is_taxable: true,
    cess_rate: 0,
    hsn_code: '',
    sac_code: '',
    category: 'GENERAL',
    department: 'GENERAL',
    description: '',
    gst_applicable: true,
    tax_category: 'STANDARD'
  });

  const [editingService, setEditingService] = useState<Service | null>(null);
  const [duplicateService, setDuplicateService] = useState({
    study_code: '',
    study_name: '',
    description: ''
  });

  // Dropdown options
  const [categories, setCategories] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [gstRates, setGstRates] = useState<any[]>([]);

  // Format currency
  const formatCurrency = (amount: string | number): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(num);
  };

  // Format percentage
  const formatPercentage = (rate: number): string => {
    return `${(rate * 100).toFixed(2)}%`;
  };

  // Fetch services
  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/service-management/services');
      const data = await response.json();
      
      if (data.success) {
        setServices(data.data);
        setFilteredServices(data.data);
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to fetch services');
    } finally {
      setLoading(false);
    }
  };

  // Fetch statistics
  const fetchStatistics = async () => {
    try {
      const response = await fetch('/api/service-management/services/statistics');
      const data = await response.json();
      
      if (data.success) {
        setStatistics(data.data.overview);
        setCategoryStats(data.data.by_category);
        setDepartmentStats(data.data.by_department);
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to fetch statistics');
    }
  };

  // Fetch dropdown options
  const fetchDropdownOptions = async () => {
    try {
      const [categoriesRes, departmentsRes, serviceTypesRes, gstRatesRes] = await Promise.all([
        fetch('/api/service-management/categories'),
        fetch('/api/service-management/departments'),
        fetch('/api/service-management/service-types'),
        fetch('/api/service-management/gst-rates')
      ]);

      const categoriesData = await categoriesRes.json();
      const departmentsData = await departmentsRes.json();
      const serviceTypesData = await serviceTypesRes.json();
      const gstRatesData = await gstRatesRes.json();

      if (categoriesData.success) setCategories(categoriesData.data);
      if (departmentsData.success) setDepartments(departmentsData.data);
      if (serviceTypesData.success) setServiceTypes(serviceTypesData.data);
      if (gstRatesData.success) setGstRates(gstRatesData.data);
    } catch (error) {
      console.error('Error fetching dropdown options:', error);
    }
  };

  // Create service
  const createService = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/service-management/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newService),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Service created successfully');
        setShowAddModal(false);
        setNewService({
          study_code: '',
          study_name: '',
          study_type: 'SERVICE',
          base_rate: '',
          gst_rate: 0.18,
          is_taxable: true,
          cess_rate: 0,
          hsn_code: '',
          sac_code: '',
          category: 'GENERAL',
          department: 'GENERAL',
          description: '',
          gst_applicable: true,
          tax_category: 'STANDARD'
        });
        fetchServices();
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to create service');
    } finally {
      setLoading(false);
    }
  };

  // Update service
  const updateService = async () => {
    if (!editingService) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/service-management/services/${editingService.study_code}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingService),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Service updated successfully');
        setShowEditModal(false);
        setEditingService(null);
        fetchServices();
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to update service');
    } finally {
      setLoading(false);
    }
  };

  // Delete service
  const deleteService = async (serviceCode: string) => {
    if (!confirm('Are you sure you want to delete this service?')) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/service-management/services/${serviceCode}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Service deleted successfully');
        fetchServices();
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to delete service');
    } finally {
      setLoading(false);
    }
  };

  // Duplicate service
  const duplicateService = async () => {
    if (!editingService) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/service-management/services/${editingService.study_code}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(duplicateService),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Service duplicated successfully');
        setShowDuplicateModal(false);
        setDuplicateService({
          study_code: '',
          study_name: '',
          description: ''
        });
        setEditingService(null);
        fetchServices();
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to duplicate service');
    } finally {
      setLoading(false);
    }
  };

  // Filter services
  useEffect(() => {
    let filtered = services;

    if (searchTerm) {
      filtered = filtered.filter(service =>
        service.study_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.study_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.department.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter(service => service.category === selectedCategory);
    }

    if (selectedDepartment) {
      filtered = filtered.filter(service => service.department === selectedDepartment);
    }

    if (selectedGSTRate) {
      filtered = filtered.filter(service => service.gst_rate === parseFloat(selectedGSTRate));
    }

    if (selectedTaxable) {
      filtered = filtered.filter(service => service.is_taxable === (selectedTaxable === 'true'));
    }

    setFilteredServices(filtered);
  }, [services, searchTerm, selectedCategory, selectedDepartment, selectedGSTRate, selectedTaxable]);

  // Effects
  useEffect(() => {
    if (activeTab === 'services') {
      fetchServices();
    } else if (activeTab === 'statistics') {
      fetchStatistics();
    }
  }, [activeTab]);

  useEffect(() => {
    fetchDropdownOptions();
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Service Management</h2>
        <p className="text-gray-600 mt-1">Comprehensive service master management with GST configuration</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('services')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'services'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Package className="w-4 h-4 inline mr-2" />
            Services
          </button>
          <button
            onClick={() => setActiveTab('statistics')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'statistics'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <BarChart3 className="w-4 h-4 inline mr-2" />
            Statistics
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'categories'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Grid3x3 className="w-4 h-4 inline mr-2" />
            Categories
          </button>
        </nav>
      </div>

      {/* Error/Success Messages */}
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

      {/* Services Tab */}
      {activeTab === 'services' && (
        <div>
          {/* Header with Actions */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search services..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-64"
                />
              </div>
              
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>

              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Departments</option>
                {departments.map(department => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>

              <select
                value={selectedGSTRate}
                onChange={(e) => setSelectedGSTRate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All GST Rates</option>
                {gstRates.map(rate => (
                  <option key={rate.rate} value={rate.rate}>{rate.label}</option>
                ))}
              </select>

              <select
                value={selectedTaxable}
                onChange={(e) => setSelectedTaxable(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Taxable Status</option>
                <option value="true">Taxable</option>
                <option value="false">Exempt</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Service
              </button>
              
              <button
                onClick={fetchServices}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Services Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Base Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    GST Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Taxable
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    HSN/SAC
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredServices.map((service) => (
                  <tr key={service.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{service.study_name}</div>
                        <div className="text-sm text-gray-500">{service.study_code}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {service.study_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        {service.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                        {service.department}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(service.base_rate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        service.is_taxable 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {service.is_taxable ? formatPercentage(service.gst_rate) : 'Exempt'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        service.is_taxable 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {service.is_taxable ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {service.hsn_code || service.sac_code || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setEditingService(service);
                          setShowEditModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingService(service);
                          setShowDuplicateModal(true);
                        }}
                        className="text-green-600 hover:text-green-900 mr-3"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteService(service.study_code)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === 'statistics' && statistics && (
        <div>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Total Services</span>
                <Package className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{statistics.total_services}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Taxable Services</span>
                <Calculator className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{statistics.taxable_services}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Exempt Services</span>
                <FileText className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{statistics.exempt_services}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Avg Base Rate</span>
                <DollarSign className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(statistics.avg_base_rate)}</div>
            </div>
          </div>

          {/* GST Rate Distribution */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">GST Rate Distribution</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-700">GST Exempt</div>
                <div className="text-xl font-bold text-gray-900">{statistics.zero_gst_services}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-green-700">5% GST</div>
                <div className="text-xl font-bold text-green-900">{statistics.gst_5_percent_services}</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-blue-700">12% GST</div>
                <div className="text-xl font-bold text-blue-900">{statistics.gst_12_percent_services}</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-purple-700">18% GST</div>
                <div className="text-xl font-bold text-purple-900">{statistics.gst_18_percent_services}</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-red-700">28% GST</div>
                <div className="text-xl font-bold text-red-900">{statistics.gst_28_percent_services}</div>
              </div>
            </div>
          </div>

          {/* Category Statistics */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Statistics</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Services</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Taxable</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Exempt</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg GST Rate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Base Rate</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {categoryStats.map((category) => (
                    <tr key={category.category}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{category.category}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{category.service_count}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{category.taxable_count}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{category.exempt_count}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{formatPercentage(category.avg_gst_rate)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{formatCurrency(category.total_base_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Department Statistics */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Department Statistics</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Services</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Taxable</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Exempt</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg GST Rate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Base Rate</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {departmentStats.map((department) => (
                    <tr key={department.department}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{department.department}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{department.service_count}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{department.taxable_count}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{department.exempt_count}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{formatPercentage(department.avg_gst_rate)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{formatCurrency(department.total_base_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Categories */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Categories</h3>
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <Tag className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="font-medium text-gray-900">{category}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {categoryStats.find(stat => stat.category === category)?.service_count || 0} services
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Departments */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Departments</h3>
              <div className="space-y-2">
                {departments.map((department) => (
                  <div key={department} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <Building className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="font-medium text-gray-900">{department}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {departmentStats.find(stat => stat.department === department)?.service_count || 0} services
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Service Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add New Service</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Code *
                </label>
                <input
                  type="text"
                  value={newService.study_code}
                  onChange={(e) => setNewService({ ...newService, study_code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., XRAY_CHEST"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Name *
                </label>
                <input
                  type="text"
                  value={newService.study_name}
                  onChange={(e) => setNewService({ ...newService, study_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Chest X-Ray"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Type
                </label>
                <select
                  value={newService.study_type}
                  onChange={(e) => setNewService({ ...newService, study_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {serviceTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base Rate
                </label>
                <input
                  type="number"
                  value={newService.base_rate}
                  onChange={(e) => setNewService({ ...newService, base_rate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={newService.category}
                  onChange={(e) => setNewService({ ...newService, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department
                </label>
                <select
                  value={newService.department}
                  onChange={(e) => setNewService({ ...newService, department: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {departments.map(department => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GST Rate
                </label>
                <select
                  value={newService.gst_rate}
                  onChange={(e) => setNewService({ ...newService, gst_rate: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {gstRates.map(rate => (
                    <option key={rate.rate} value={rate.rate}>{rate.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Is Taxable
                </label>
                <select
                  value={newService.is_taxable.toString()}
                  onChange={(e) => setNewService({ ...newService, is_taxable: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CESS Rate
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={newService.cess_rate}
                  onChange={(e) => setNewService({ ...newService, cess_rate: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.0000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  HSN Code
                </label>
                <input
                  type="text"
                  value={newService.hsn_code}
                  onChange={(e) => setNewService({ ...newService, hsn_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 8523"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SAC Code
                </label>
                <input
                  type="text"
                  value={newService.sac_code}
                  onChange={(e) => setNewService({ ...newService, sac_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 998313"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newService.description}
                  onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Service description..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createService}
                disabled={loading || !newService.study_code || !newService.study_name}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Service Modal */}
      {showEditModal && editingService && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Edit Service</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Code
                </label>
                <input
                  type="text"
                  value={editingService.study_code}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Name
                </label>
                <input
                  type="text"
                  value={editingService.study_name}
                  onChange={(e) => setEditingService({ ...editingService, study_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Type
                </label>
                <select
                  value={editingService.study_type}
                  onChange={(e) => setEditingService({ ...editingService, study_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {serviceTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base Rate
                </label>
                <input
                  type="number"
                  value={editingService.base_rate}
                  onChange={(e) => setEditingService({ ...editingService, base_rate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={editingService.category}
                  onChange={(e) => setEditingService({ ...editingService, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department
                </label>
                <select
                  value={editingService.department}
                  onChange={(e) => setEditingService({ ...editingService, department: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {departments.map(department => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GST Rate
                </label>
                <select
                  value={editingService.gst_rate}
                  onChange={(e) => setEditingService({ ...editingService, gst_rate: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {gstRates.map(rate => (
                    <option key={rate.rate} value={rate.rate}>{rate.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Is Taxable
                </label>
                <select
                  value={editingService.is_taxable.toString()}
                  onChange={(e) => setEditingService({ ...editingService, is_taxable: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CESS Rate
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={editingService.cess_rate}
                  onChange={(e) => setEditingService({ ...editingService, cess_rate: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  HSN Code
                </label>
                <input
                  type="text"
                  value={editingService.hsn_code}
                  onChange={(e) => setEditingService({ ...editingService, hsn_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SAC Code
                </label>
                <input
                  type="text"
                  value={editingService.sac_code}
                  onChange={(e) => setEditingService({ ...editingService, sac_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editingService.description}
                  onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={updateService}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Service Modal */}
      {showDuplicateModal && editingService && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Duplicate Service</h3>
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Service Code *
                </label>
                <input
                  type="text"
                  value={duplicateService.study_code}
                  onChange={(e) => setDuplicateService({ ...duplicateService, study_code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., XRAY_CHEST_COPY"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Service Name
                </label>
                <input
                  type="text"
                  value={duplicateService.study_name}
                  onChange={(e) => setDuplicateService({ ...duplicateService, study_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Chest X-Ray (Copy)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={duplicateService.description}
                  onChange={(e) => setDuplicateService({ ...duplicateService, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Description for duplicated service..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={duplicateService}
                disabled={loading || !duplicateService.study_code}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                {loading ? 'Duplicating...' : 'Duplicate Service'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceManagement;
