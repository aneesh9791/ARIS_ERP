import React, { useState, useEffect } from 'react';
import { 
  Filter, 
  Search, 
  Calendar, 
  Building, 
  Users, 
  DollarSign, 
  FileText, 
  ChevronDown, 
  ChevronUp,
  X,
  Check,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Download,
  RefreshCw,
  Settings
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveForm from '../Common/ResponsiveForm';
import '../styles/theme.css';

const DashboardFilters = ({ onFiltersChange, userRole = 'ADMIN', userCenter = 'ALL' }) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showDateRangeModal, setShowDateRangeModal] = useState(false);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [screenSize, setScreenSize] = useState('desktop');
  const [activeFilters, setActiveFilters] = useState({
    dateRange: 'month',
    center: userCenter,
    department: 'ALL',
    category: 'ALL',
    revenueType: 'ALL',
    comparison: 'previous',
    viewMode: 'overview',
    metric: 'revenue'
  });

  // Detect screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
      } else if (width < 1024) {
        setScreenSize('tablet');
      } else {
        setScreenSize('desktop');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Notify parent of filter changes
  useEffect(() => {
    onFiltersChange?.(activeFilters);
  }, [activeFilters, onFiltersChange]);

  const handleFilterChange = (key, value) => {
    setActiveFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFilters = () => {
    setActiveFilters({
      dateRange: 'month',
      center: userCenter,
      department: 'ALL',
      category: 'ALL',
      revenueType: 'ALL',
      comparison: 'previous',
      viewMode: 'overview',
      metric: 'revenue'
    });
  };

  const applyQuickFilter = (filterType) => {
    switch (filterType) {
      case 'today':
        handleFilterChange('dateRange', 'today');
        break;
      case 'thisWeek':
        handleFilterChange('dateRange', 'week');
        break;
      case 'thisMonth':
        handleFilterChange('dateRange', 'month');
        break;
      case 'thisQuarter':
        handleFilterChange('dateRange', 'quarter');
        break;
      case 'thisYear':
        handleFilterChange('dateRange', 'year');
        break;
      case 'revenue':
        handleFilterChange('metric', 'revenue');
        break;
      case 'profit':
        handleFilterChange('metric', 'profit');
        break;
      case 'cashflow':
        handleFilterChange('metric', 'cashflow');
        break;
      default:
        break;
    }
  };

  const getRoleBasedOptions = () => {
    const options = {
      centers: [
        { value: 'ALL', label: 'All Centers' },
        { value: '1', label: 'Main Hospital' },
        { value: '2', label: 'Diagnostic Center' },
        { value: '3', label: 'Clinic Branch' },
        { value: '4', label: 'Specialty Center' }
      ],
      departments: [
        { value: 'ALL', label: 'All Departments' },
        { value: '1', label: 'General Medicine' },
        { value: '2', label: 'Radiology' },
        { value: '3', label: 'Cardiology' },
        { value: '4', label: 'Laboratory' },
        { value: '5', label: 'Pharmacy' },
        { value: '6', label: 'Emergency' }
      ],
      categories: [
        { value: 'ALL', label: 'All Categories' },
        { value: 'consultations', label: 'Consultations' },
        { value: 'diagnostics', label: 'Diagnostics' },
        { value: 'pharmacy', label: 'Pharmacy' },
        { value: 'lab', label: 'Lab Tests' },
        { value: 'imaging', label: 'Imaging' },
        { value: 'other', label: 'Other Services' }
      ],
      revenueTypes: [
        { value: 'ALL', label: 'All Types' },
        { value: 'cash', label: 'Cash' },
        { value: 'insurance', label: 'Insurance' },
        { value: 'corporate', label: 'Corporate' },
        { value: 'government', label: 'Government' },
        { value: 'self', label: 'Self Pay' }
      ],
      comparisons: [
        { value: 'previous', label: 'Previous Period' },
        { value: 'budget', label: 'Budget' },
        { value: 'target', label: 'Target' },
        { value: 'forecast', label: 'Forecast' },
        { value: 'lastYear', label: 'Last Year' }
      ],
      viewModes: [
        { value: 'overview', label: 'Overview' },
        { value: 'detailed', label: 'Detailed' },
        { value: 'trend', label: 'Trend Analysis' },
        { value: 'comparison', label: 'Comparison' },
        { value: 'forecast', label: 'Forecasting' }
      ],
      metrics: [
        { value: 'revenue', label: 'Revenue' },
        { value: 'profit', label: 'Profit' },
        { value: 'cashflow', label: 'Cash Flow' },
        { value: 'expenses', label: 'Expenses' },
        { value: 'payables', label: 'Payables' },
        { value: 'receivables', label: 'Receivables' }
      ]
    };

    // Filter options based on user role
    if (userRole === 'CENTER_MANAGER') {
      options.centers = options.centers.filter(c => c.value === userCenter || c.value === 'ALL');
    }

    if (userRole === 'DOCTOR') {
      options.departments = options.departments.filter(d => d.value === '1' || d.value === 'ALL');
    }

    if (userRole === 'STAFF') {
      options.categories = options.categories.slice(0, 3); // Limited options for staff
      options.viewModes = options.viewModes.slice(0, 2); // Limited view modes
    }

    return options;
  };

  const options = getRoleBasedOptions();

  const getFilterCount = () => {
    let count = 0;
    if (activeFilters.center !== userCenter) count++;
    if (activeFilters.department !== 'ALL') count++;
    if (activeFilters.category !== 'ALL') count++;
    if (activeFilters.revenueType !== 'ALL') count++;
    if (activeFilters.comparison !== 'previous') count++;
    if (activeFilters.viewMode !== 'overview') count++;
    if (activeFilters.metric !== 'revenue') count++;
    return count;
  };

  const renderQuickFilters = () => {
    const quickFilters = [
      { id: 'today', label: 'Today', icon: Calendar, color: 'blue' },
      { id: 'thisWeek', label: 'This Week', icon: Clock, color: 'green' },
      { id: 'thisMonth', label: 'This Month', icon: Calendar, color: 'purple' },
      { id: 'thisQuarter', label: 'This Quarter', icon: BarChart3, color: 'orange' },
      { id: 'thisYear', label: 'This Year', icon: TrendingUp, color: 'red' }
    ];

    return (
      <div className="flex flex-wrap gap-2">
        {quickFilters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => applyQuickFilter(filter.id)}
            className={`flex items-center px-3 py-2 rounded-lg border transition-colors ${
              activeFilters.dateRange === filter.id ||
              (filter.id === 'thisMonth' && activeFilters.dateRange === 'month')
                ? `border-${filter.color}-500 bg-${filter.color}-50 text-${filter.color}-700`
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <filter.icon className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">{filter.label}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderAdvancedFilters = () => {
    const formFields = [
      {
        name: 'dateRange',
        label: 'Date Range',
        type: 'select',
        options: [
          { value: 'today', label: 'Today' },
          { value: 'yesterday', label: 'Yesterday' },
          { value: 'thisWeek', label: 'This Week' },
          { value: 'lastWeek', label: 'Last Week' },
          { value: 'thisMonth', label: 'This Month' },
          { value: 'lastMonth', label: 'Last Month' },
          { value: 'thisQuarter', label: 'This Quarter' },
          { value: 'lastQuarter', label: 'Last Quarter' },
          { value: 'thisYear', label: 'This Year' },
          { value: 'lastYear', label: 'Last Year' },
          { value: 'custom', label: 'Custom Range' }
        ]
      },
      {
        name: 'center',
        label: 'Center',
        type: 'select',
        options: options.centers
      },
      {
        name: 'department',
        label: 'Department',
        type: 'select',
        options: options.departments
      },
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        options: options.categories
      },
      {
        name: 'revenueType',
        label: 'Revenue Type',
        type: 'select',
        options: options.revenueTypes
      },
      {
        name: 'comparison',
        label: 'Comparison',
        type: 'select',
        options: options.comparisons
      },
      {
        name: 'viewMode',
        label: 'View Mode',
        type: 'select',
        options: options.viewModes
      },
      {
        name: 'metric',
        label: 'Primary Metric',
        type: 'select',
        options: options.metrics
      }
    ];

    return (
      <ResponsiveCard>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Advanced Filters</h3>
          
          <ResponsiveForm
            fields={formFields}
            initialValues={activeFilters}
            onSubmit={(values) => {
              setActiveFilters(values);
              setShowAdvancedFilters(false);
            }}
            onCancel={() => setShowAdvancedFilters(false)}
            submitText="Apply Filters"
            layout="responsive"
          />
          
          <div className="flex justify-between mt-6">
            <button
              onClick={clearFilters}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Clear All
            </button>
            <button
              onClick={() => setShowAdvancedFilters(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </ResponsiveCard>
    );
  };

  const renderActiveFilters = () => {
    const activeFilterList = [];

    if (activeFilters.center !== userCenter) {
      const center = options.centers.find(c => c.value === activeFilters.center);
      activeFilterList.push({ type: 'Center', value: center?.label || activeFilters.center });
    }

    if (activeFilters.department !== 'ALL') {
      const dept = options.departments.find(d => d.value === activeFilters.department);
      activeFilterList.push({ type: 'Department', value: dept?.label || activeFilters.department });
    }

    if (activeFilters.category !== 'ALL') {
      const cat = options.categories.find(c => c.value === activeFilters.category);
      activeFilterList.push({ type: 'Category', value: cat?.label || activeFilters.category });
    }

    if (activeFilters.revenueType !== 'ALL') {
      const rev = options.revenueTypes.find(r => r.value === activeFilters.revenueType);
      activeFilterList.push({ type: 'Revenue Type', value: rev?.label || activeFilters.revenueType });
    }

    if (activeFilters.comparison !== 'previous') {
      const comp = options.comparisons.find(c => c.value === activeFilters.comparison);
      activeFilterList.push({ type: 'Comparison', value: comp?.label || activeFilters.comparison });
    }

    if (activeFilters.viewMode !== 'overview') {
      const mode = options.viewModes.find(v => v.value === activeFilters.viewMode);
      activeFilterList.push({ type: 'View Mode', value: mode?.label || activeFilters.viewMode });
    }

    if (activeFilters.metric !== 'revenue') {
      const metric = options.metrics.find(m => m.value === activeFilters.metric);
      activeFilterList.push({ type: 'Metric', value: metric?.label || activeFilters.metric });
    }

    return (
      <div className="flex flex-wrap gap-2">
        {activeFilterList.map((filter, index) => (
          <div
            key={index}
            className="flex items-center px-3 py-1 bg-blue-50 border border-blue-200 rounded-full"
          >
            <span className="text-xs font-medium text-blue-700">{filter.type}:</span>
            <span className="text-xs text-blue-600 ml-1">{filter.value}</span>
            <button
              onClick={() => {
                if (filter.type === 'Center') handleFilterChange('center', userCenter);
                if (filter.type === 'Department') handleFilterChange('department', 'ALL');
                if (filter.type === 'Category') handleFilterChange('category', 'ALL');
                if (filter.type === 'Revenue Type') handleFilterChange('revenueType', 'ALL');
                if (filter.type === 'Comparison') handleFilterChange('comparison', 'previous');
                if (filter.type === 'View Mode') handleFilterChange('viewMode', 'overview');
                if (filter.type === 'Metric') handleFilterChange('metric', 'revenue');
              }}
              className="ml-2 text-blue-500 hover:text-blue-700"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Main Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        {/* Search Bar */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search dashboard..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {renderQuickFilters()}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center px-3 py-2 rounded-lg border transition-colors ${
              getFilterCount() > 0
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">Filters</span>
            {getFilterCount() > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                {getFilterCount()}
              </span>
            )}
          </button>

          {/* Export Button */}
          <button className="flex items-center px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">Export</span>
          </button>

          {/* Refresh Button */}
          <button className="flex items-center px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">Refresh</span>
          </button>

          {/* Settings */}
          <button className="flex items-center px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            <Settings className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>
      </div>

      {/* Active Filters Display */}
      {getFilterCount() > 0 && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-700">Active Filters</h4>
            <button
              onClick={clearFilters}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear All
            </button>
          </div>
          {renderActiveFilters()}
        </div>
      )}

      {/* Advanced Filters Modal */}
      {showAdvancedFilters && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Advanced Filters</h2>
                <button
                  onClick={() => setShowAdvancedFilters(false)}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4">
              {renderAdvancedFilters()}
            </div>
          </div>
        </div>
      )}

      {/* Filter Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Date Range</p>
              <p className="text-lg font-semibold text-gray-900 capitalize">
                {activeFilters.dateRange === 'today' ? 'Today' :
                 activeFilters.dateRange === 'week' ? 'This Week' :
                 activeFilters.dateRange === 'month' ? 'This Month' :
                 activeFilters.dateRange === 'quarter' ? 'This Quarter' :
                 activeFilters.dateRange === 'year' ? 'This Year' :
                 activeFilters.dateRange}
              </p>
            </div>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Center</p>
              <p className="text-lg font-semibold text-gray-900">
                {options.centers.find(c => c.value === activeFilters.center)?.label || 'All Centers'}
              </p>
            </div>
            <Building className="w-5 h-5 text-gray-400" />
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">View Mode</p>
              <p className="text-lg font-semibold text-gray-900 capitalize">
                {options.viewModes.find(v => v.value === activeFilters.viewMode)?.label || 'Overview'}
              </p>
            </div>
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Primary Metric</p>
              <p className="text-lg font-semibold text-gray-900 capitalize">
                {options.metrics.find(m => m.value === activeFilters.metric)?.label || 'Revenue'}
              </p>
            </div>
            <DollarSign className="w-5 h-5 text-gray-400" />
          </div>
        </ResponsiveCard>
      </div>
    </div>
  );
};

export default DashboardFilters;
