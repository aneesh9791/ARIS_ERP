import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  FileText, 
  TrendingUp, 
  DollarSign, 
  Receipt, 
  Settings, 
  Download, 
  Calendar, 
  Filter, 
  Eye, 
  Edit, 
  Save, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Info,
  BarChart3,
  PieChart,
  CreditCard,
  Users,
  Building,
  Shield,
  Database,
  FileSpreadsheet,
  Printer
} from 'lucide-react';

// Interfaces
interface ServiceGSTConfig {
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
  gst_applicable: boolean;
  tax_category: string;
}

interface GSTReport {
  summary: {
    total_bills: number;
    total_subtotal: string;
    total_taxable_amount: string;
    total_cgst: string;
    total_sgst: string;
    total_igst: string;
    total_cess: string;
    total_amount: string;
    total_paid: string;
    total_balance: string;
    patient_paid_amount: string;
    aris_paid_amount: string;
    insurance_paid_amount: string;
    corporate_paid_amount: string;
  };
  details: any[];
}

interface GSTServiceSummary {
  item_code: string;
  item_name: string;
  gst_rate: number;
  is_taxable: boolean;
  bill_count: number;
  total_quantity: number;
  total_revenue: string;
  total_taxable_amount: string;
  total_cgst: string;
  total_sgst: string;
  total_igst: string;
  total_cess: string;
  total_amount_with_gst: string;
}

interface GSTPaymentSummary {
  payment_method: string;
  transaction_count: number;
  total_amount: string;
  patient_amount: string;
  aris_amount: string;
  insurance_amount: string;
  corporate_amount: string;
  avg_transaction_amount: string;
  max_transaction_amount: string;
  min_transaction_amount: string;
}

const GSTManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'services' | 'reports' | 'configuration'>('services');
  const [services, setServices] = useState<ServiceGSTConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Report states
  const [reportType, setReportType] = useState<'all' | 'paid' | 'aris_paid'>('all');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [gstReport, setGSTReport] = useState<GSTReport | null>(null);
  const [serviceSummary, setServiceSummary] = useState<GSTServiceSummary[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<GSTPaymentSummary[]>([]);

  // Edit states
  const [editingService, setEditingService] = useState<ServiceGSTConfig | null>(null);
  const [showAddService, setShowAddService] = useState(false);

  // New service form
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
    gst_applicable: true,
    tax_category: 'STANDARD'
  });

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
      const response = await fetch('/api/gst-management/services/gst-config');
      const data = await response.json();
      
      if (data.success) {
        setServices(data.data);
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to fetch services');
    } finally {
      setLoading(false);
    }
  };

  // Generate GST report
  const generateGSTReport = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/gst-management/reports/gst?start_date=${startDate}&end_date=${endDate}&report_type=${reportType}`);
      const data = await response.json();
      
      if (data.success) {
        setGSTReport(data.data);
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to generate GST report');
    } finally {
      setLoading(false);
    }
  };

  // Generate service summary
  const generateServiceSummary = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/gst-management/reports/gst/by-service?start_date=${startDate}&end_date=${endDate}&report_type=${reportType}`);
      const data = await response.json();
      
      if (data.success) {
        setServiceSummary(data.data);
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to generate service summary');
    } finally {
      setLoading(false);
    }
  };

  // Generate payment summary
  const generatePaymentSummary = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/gst-management/reports/gst/by-payment?start_date=${startDate}&end_date=${endDate}&report_type=${reportType}`);
      const data = await response.json();
      
      if (data.success) {
        setPaymentSummary(data.data);
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to generate payment summary');
    } finally {
      setLoading(false);
    }
  };

  // Update service GST configuration
  const updateServiceGST = async (serviceCode: string, gstConfig: Partial<ServiceGSTConfig>) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/gst-management/services/${serviceCode}/gst-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gstConfig),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('GST configuration updated successfully');
        setEditingService(null);
        fetchServices();
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to update GST configuration');
    } finally {
      setLoading(false);
    }
  };

  // Add CD printing service
  const addCDPrintingService = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/gst-management/services/cd-printing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newService),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('CD printing service added successfully');
        setShowAddService(false);
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
          gst_applicable: true,
          tax_category: 'STANDARD'
        });
        fetchServices();
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to add CD printing service');
    } finally {
      setLoading(false);
    }
  };

  // Generate GSTR-1 report
  const generateGSTR1 = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/gst-management/reports/gstr1?start_date=${startDate}&end_date=${endDate}`);
      const data = await response.json();
      
      if (data.success) {
        // Download CSV
        const csv = convertToCSV(data.data);
        downloadCSV(csv, `GSTR1_${startDate}_${endDate}.csv`);
        setSuccess('GSTR-1 report generated and downloaded');
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to generate GSTR-1 report');
    } finally {
      setLoading(false);
    }
  };

  // Generate GSTR-3B report
  const generateGSTR3B = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/gst-management/reports/gstr3b?start_date=${startDate}&end_date=${endDate}`);
      const data = await response.json();
      
      if (data.success) {
        // Download CSV
        const csv = convertToCSV([data.data]);
        downloadCSV(csv, `GSTR3B_${startDate}_${endDate}.csv`);
        setSuccess('GSTR-3B report generated and downloaded');
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to generate GSTR-3B report');
    } finally {
      setLoading(false);
    }
  };

  // Convert JSON to CSV
  const convertToCSV = (data: any[]): string => {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header];
        return typeof value === 'string' ? `"${value}"` : value;
      }).join(',');
    });
    
    return [csvHeaders, ...csvRows].join('\n');
  };

  // Download CSV
  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Effects
  useEffect(() => {
    if (activeTab === 'services') {
      fetchServices();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'reports' && startDate && endDate) {
      generateGSTReport();
      generateServiceSummary();
      generatePaymentSummary();
    }
  }, [activeTab, startDate, endDate, reportType]);

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">GST Management</h2>
        <p className="text-gray-600 mt-1">Comprehensive GST configuration and reporting system</p>
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
            <Settings className="w-4 h-4 inline mr-2" />
            Services
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
          <button
            onClick={() => setActiveTab('configuration')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'configuration'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Calculator className="w-4 h-4 inline mr-2" />
            Configuration
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
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Service GST Configuration</h3>
            <button
              onClick={() => setShowAddService(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Service
            </button>
          </div>

          {/* Services List */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
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
                {services.map((service) => (
                  <tr key={service.study_code}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{service.study_name}</div>
                        <div className="text-sm text-gray-500">{service.study_code}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {service.category}
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
                        onClick={() => setEditingService(service)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="text-gray-600 hover:text-gray-900">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div>
          {/* Report Filters */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Report Type
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Bills</option>
                  <option value="paid">Paid Bills</option>
                  <option value="aris_paid">ARIS Paid</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    generateGSTReport();
                    generateServiceSummary();
                    generatePaymentSummary();
                  }}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Generate Report
                </button>
              </div>
            </div>
          </div>

          {/* GST Summary Cards */}
          {gstReport && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-500">Total Bills</span>
                  <FileText className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{gstReport.summary.total_bills}</div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-500">Total Revenue</span>
                  <DollarSign className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(gstReport.summary.total_amount)}</div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-500">Total GST</span>
                  <Calculator className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(
                    parseFloat(gstReport.summary.total_cgst) + 
                    parseFloat(gstReport.summary.total_sgst) + 
                    parseFloat(gstReport.summary.total_igst) + 
                    parseFloat(gstReport.summary.total_cess)
                  )}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-500">ARIS Paid</span>
                  <Building className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(gstReport.summary.aris_paid_amount)}</div>
              </div>
            </div>
          )}

          {/* Payment Source Breakdown */}
          {gstReport && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Payment Source Breakdown</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-700">Patient Paid</span>
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-xl font-bold text-blue-900">{formatCurrency(gstReport.summary.patient_paid_amount)}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-green-700">ARIS Paid</span>
                    <Building className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-xl font-bold text-green-900">{formatCurrency(gstReport.summary.aris_paid_amount)}</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-700">Insurance Paid</span>
                    <Shield className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="text-xl font-bold text-purple-900">{formatCurrency(gstReport.summary.insurance_paid_amount)}</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-orange-700">Corporate Paid</span>
                    <Building className="w-4 h-4 text-orange-500" />
                  </div>
                  <div className="text-xl font-bold text-orange-900">{formatCurrency(gstReport.summary.corporate_paid_amount)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Service Summary */}
          {serviceSummary.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Service-wise GST Summary</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GST Rate</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bills</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GST Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {serviceSummary.slice(0, 10).map((service) => (
                      <tr key={service.item_code}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{service.item_name}</div>
                            <div className="text-sm text-gray-500">{service.item_code}</div>
                          </div>
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {service.bill_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(service.total_revenue)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(
                            parseFloat(service.total_cgst) + 
                            parseFloat(service.total_sgst) + 
                            parseFloat(service.total_igst) + 
                            parseFloat(service.total_cess)
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatCurrency(service.total_amount_with_gst)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payment Method Summary */}
          {paymentSummary.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Payment Method Summary</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {paymentSummary.map((payment) => (
                  <div key={payment.payment_method} className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-500">{payment.payment_method}</span>
                      <CreditCard className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="text-xl font-bold text-gray-900 mb-2">{formatCurrency(payment.total_amount)}</div>
                    <div className="text-sm text-gray-500">
                      {payment.transaction_count} transactions
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GST Report Downloads */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={generateGSTR1}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              GSTR-1
            </button>
            <button
              onClick={generateGSTR3B}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              GSTR-3B
            </button>
          </div>
        </div>
      )}

      {/* Configuration Tab */}
      {activeTab === 'configuration' && (
        <div>
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">GST Configuration Overview</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-3">Service Categories</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Radiology Services</span>
                    <span className="text-sm text-gray-500">18% GST</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Pathology Services</span>
                    <span className="text-sm text-gray-500">18% GST</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Consultation Services</span>
                    <span className="text-sm text-gray-500">18% GST</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">CD Printing</span>
                    <span className="text-sm text-gray-500">18% GST</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Document Scanning</span>
                    <span className="text-sm text-gray-500">GST Exempt</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-md font-medium text-gray-700 mb-3">GST Settings</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Default GST Rate</span>
                    <span className="text-sm text-gray-500">18%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">CESS Rate</span>
                    <span className="text-sm text-gray-500">0%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Reverse Charge</span>
                    <span className="text-sm text-gray-500">Not Applicable</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">GST Type</span>
                    <span className="text-sm text-gray-500">Services</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Place of Supply</span>
                    <span className="text-sm text-gray-500">Karnataka</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Service Modal */}
      {editingService && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Edit GST Configuration</h3>
              <button
                onClick={() => setEditingService(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Name
                </label>
                <input
                  type="text"
                  value={editingService.study_name}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
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
                  Base Rate
                </label>
                <input
                  type="number"
                  value={editingService.base_rate}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GST Rate
                </label>
                <select
                  value={editingService.gst_rate}
                  onChange={(e) => setEditingService({
                    ...editingService,
                    gst_rate: parseFloat(e.target.value)
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>Exempt</option>
                  <option value={0.05}>5%</option>
                  <option value={0.12}>12%</option>
                  <option value={0.18}>18%</option>
                  <option value={0.28}>28%</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Is Taxable
                </label>
                <select
                  value={editingService.is_taxable.toString()}
                  onChange={(e) => setEditingService({
                    ...editingService,
                    is_taxable: e.target.value === 'true'
                  })}
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
                  onChange={(e) => setEditingService({
                    ...editingService,
                    cess_rate: parseFloat(e.target.value)
                  })}
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
                  onChange={(e) => setEditingService({
                    ...editingService,
                    hsn_code: e.target.value
                  })}
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
                  onChange={(e) => setEditingService({
                    ...editingService,
                    sac_code: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingService(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => updateServiceGST(editingService.study_code, editingService)}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Service Modal */}
      {showAddService && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add New Service</h3>
              <button
                onClick={() => setShowAddService(false)}
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
                  value={newService.study_code}
                  onChange={(e) => setNewService({
                    ...newService,
                    study_code: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., CD_PRINT"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Name
                </label>
                <input
                  type="text"
                  value={newService.study_name}
                  onChange={(e) => setNewService({
                    ...newService,
                    study_name: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., CD Printing"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base Rate
                </label>
                <input
                  type="number"
                  value={newService.base_rate}
                  onChange={(e) => setNewService({
                    ...newService,
                    base_rate: e.target.value
                  })}
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
                  onChange={(e) => setNewService({
                    ...newService,
                    category: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="GENERAL">General</option>
                  <option value="RADIOLOGY">Radiology</option>
                  <option value="PATHOLOGY">Pathology</option>
                  <option value="CONSULTATION">Consultation</option>
                  <option value="MEDIA">Media</option>
                  <option value="DOCUMENT">Document</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GST Rate
                </label>
                <select
                  value={newService.gst_rate}
                  onChange={(e) => setNewService({
                    ...newService,
                    gst_rate: parseFloat(e.target.value)
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>Exempt</option>
                  <option value={0.05}>5%</option>
                  <option value={0.12}>12%</option>
                  <option value={0.18}>18%</option>
                  <option value={0.28}>28%</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Is Taxable
                </label>
                <select
                  value={newService.is_taxable.toString()}
                  onChange={(e) => setNewService({
                    ...newService,
                    is_taxable: e.target.value === 'true'
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddService(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addCDPrintingService}
                disabled={loading || !newService.study_code || !newService.study_name}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Service'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GSTManagement;
