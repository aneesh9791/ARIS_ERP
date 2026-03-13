import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  CreditCard, 
  FileText, 
  Calendar,
  Filter,
  Download,
  RefreshCw,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  Users,
  Package,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Building,
  Briefcase,
  Calculator,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  ChevronDown,
  Search
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveTable from '../Common/ResponsiveTable';
import {
  LineChart as RechartsLineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar
} from 'recharts';
import '../styles/theme.css';

const AdvancedDashboard = () => {
  const [userRole, setUserRole] = useState('ADMIN');
  const [userCenter, setUserCenter] = useState('ALL');
  const [dateRange, setDateRange] = useState('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [screenSize, setScreenSize] = useState('desktop');
  const [expandedCards, setExpandedCards] = useState({});
  const [viewMode, setViewMode] = useState('overview');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Mock user data - in real app, this would come from auth context
  useEffect(() => {
    // Simulate user role detection
    const mockUser = {
      role: 'ADMIN', // ADMIN, CENTER_MANAGER, ACCOUNTANT, CORPORATE, DOCTOR, STAFF
      centerId: 1,
      centerName: 'Main Hospital',
      permissions: ['ALL']
    };
    setUserRole(mockUser.role);
    setUserCenter(mockUser.centerId);
  }, []);

  // Mock API data - in real app, this would come from backend
  const [dashboardData, setDashboardData] = useState({
    revenue: {
      total: 2456789,
      current: 2456789,
      previous: 2234567,
      growth: 10.0,
      monthly: [
        { month: 'Jan', revenue: 1800000, target: 2000000 },
        { month: 'Feb', revenue: 2100000, target: 2200000 },
        { month: 'Mar', revenue: 2456789, target: 2500000 },
        { month: 'Apr', revenue: 2300000, target: 2400000 },
        { month: 'May', revenue: 2600000, target: 2700000 },
        { month: 'Jun', revenue: 2800000, target: 3000000 }
      ],
      byCategory: [
        { name: 'Consultations', value: 856789, color: '#3b82f6' },
        { name: 'Diagnostics', value: 654321, color: '#10b981' },
        { name: 'Pharmacy', value: 432654, color: '#f59e0b' },
        { name: 'Lab Tests', value: 345678, color: '#ef4444' },
        { name: 'Other', value: 167847, color: '#8b5cf6' }
      ],
      byCenter: [
        { name: 'Main Hospital', revenue: 1456789, percentage: 59.3 },
        { name: 'Diagnostic Center', revenue: 654321, percentage: 26.6 },
        { name: 'Clinic Branch', revenue: 234567, percentage: 9.6 },
        { name: 'Specialty Center', revenue: 111112, percentage: 4.5 }
      ]
    },
    payables: {
      total: 1234567,
      current: 1234567,
      previous: 1345678,
      growth: -8.3,
      aging: [
        { period: '0-30 days', amount: 456789, percentage: 37.0 },
        { period: '31-60 days', amount: 345678, percentage: 28.0 },
        { period: '61-90 days', amount: 234567, percentage: 19.0 },
        { period: '90+ days', amount: 197533, percentage: 16.0 }
      ],
      byVendor: [
        { name: 'Medical Supplies Co.', amount: 345678, dueDate: '2024-03-20' },
        { name: 'Pharma Corp', amount: 234567, dueDate: '2024-03-25' },
        { name: 'Equipment Ltd', amount: 198765, dueDate: '2024-04-01' },
        { name: 'Lab Supplies', amount: 156789, dueDate: '2024-03-18' },
        { name: 'Others', amount: 298768, dueDate: 'Various' }
      ]
    },
    receivables: {
      total: 2345678,
      current: 2345678,
      previous: 2123456,
      growth: 10.5,
      aging: [
        { period: '0-30 days', amount: 1456789, percentage: 62.1 },
        { period: '31-60 days', amount: 567890, percentage: 24.2 },
        { period: '61-90 days', amount: 234567, percentage: 10.0 },
        { period: '90+ days', amount: 86432, percentage: 3.7 }
      ],
      byPayer: [
        { name: 'Insurance Companies', amount: 1456789, percentage: 62.1 },
        { name: 'Corporate Clients', amount: 567890, percentage: 24.2 },
        { name: 'Individual Patients', amount: 234567, percentage: 10.0 },
        { name: 'Government Schemes', amount: 86432, percentage: 3.7 }
      ]
    },
    expenses: {
      total: 1876543,
      current: 1876543,
      previous: 1765432,
      growth: 6.3,
      categories: [
        { name: 'Salaries', amount: 876543, percentage: 46.7 },
        { name: 'Medical Supplies', amount: 456789, percentage: 24.3 },
        { name: 'Equipment', amount: 234567, percentage: 12.5 },
        { name: 'Utilities', amount: 123456, percentage: 6.6 },
        { name: 'Other', amount: 185688, percentage: 9.9 }
      ]
    },
    profit: {
      gross: 580246,
      net: 345678,
      margin: 14.1,
      trend: 'up'
    },
    cashFlow: {
      inflow: 3456789,
      outflow: 2876543,
      net: 580246,
      trend: 'up'
    },
    kpis: {
      patientCount: 5234,
      avgRevenuePerPatient: 469.5,
      bedOccupancy: 78.5,
      staffProductivity: 85.2,
      collectionRate: 94.3,
      operatingMargin: 14.1
    }
  });

  // Fetch dashboard data based on filters
  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In real app, this would be an API call with filters
      console.log('Fetching dashboard data with filters:', {
        userRole,
        userCenter,
        dateRange,
        selectedDate,
        selectedMonth,
        selectedYear
      });
      
    } catch (err) {
      setError('Failed to fetch dashboard data');
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [userRole, userCenter, dateRange, selectedMonth, selectedYear]);

  const toggleCardExpansion = (cardId) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(1)}%`;
  };

  const getRoleBasedView = () => {
    switch (userRole) {
      case 'CORPORATE':
        return {
          showAllCenters: true,
          showDetailedFinancials: true,
          showProfitMetrics: true,
          showCashFlow: true,
          showKPIs: true
        };
      case 'ACCOUNTANT':
        return {
          showAllCenters: true,
          showDetailedFinancials: true,
          showProfitMetrics: true,
          showCashFlow: true,
          showKPIs: false
        };
      case 'CENTER_MANAGER':
        return {
          showAllCenters: false,
          showDetailedFinancials: true,
          showProfitMetrics: true,
          showCashFlow: false,
          showKPIs: true
        };
      case 'DOCTOR':
        return {
          showAllCenters: false,
          showDetailedFinancials: false,
          showProfitMetrics: false,
          showCashFlow: false,
          showKPIs: true
        };
      case 'STAFF':
        return {
          showAllCenters: false,
          showDetailedFinancials: false,
          showProfitMetrics: false,
          showCashFlow: false,
          showKPIs: false
        };
      default:
        return {
          showAllCenters: true,
          showDetailedFinancials: true,
          showProfitMetrics: true,
          showCashFlow: true,
          showKPIs: true
        };
    }
  };

  const roleView = getRoleBasedView();

  // Custom colors for charts
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  // Generate date options
  const getDateOptions = () => {
    const options = [];
    const currentYear = new Date().getFullYear();
    
    for (let year = currentYear - 2; year <= currentYear + 1; year++) {
      for (let month = 0; month < 12; month++) {
        options.push({
          value: `${year}-${month}`,
          label: `${new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
        });
      }
    }
    return options;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Financial Dashboard</h1>
          <p className="text-gray-600 mt-1">
            {userRole === 'CORPORATE' && 'Corporate Overview - All Centers'}
            {userRole === 'ACCOUNTANT' && 'Financial Overview - All Centers'}
            {userRole === 'CENTER_MANAGER' && `Center Overview - ${userCenter === 1 ? 'Main Hospital' : 'Your Center'}`}
            {userRole === 'DOCTOR' && 'Department Overview'}
            {userRole === 'STAFF' && 'Basic Overview'}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 space-y-2 sm:space-y-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-64"
            />
          </div>
          
          {/* Date Range Filter */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
          
          {/* Month/Year Selector */}
          {dateRange === 'month' && (
            <div className="flex items-center space-x-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {new Date(2024, i).toLocaleDateString('en-US', { month: 'long' })}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <option key={i} value={2022 + i}>
                    {2022 + i}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </button>
          
          {/* Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchDashboardData}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <ResponsiveCard>
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Advanced Filters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Center</label>
                <select
                  value={userCenter}
                  onChange={(e) => setUserCenter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="ALL">All Centers</option>
                  <option value="1">Main Hospital</option>
                  <option value="2">Diagnostic Center</option>
                  <option value="3">Clinic Branch</option>
                  <option value="4">Specialty Center</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="ALL">All Departments</option>
                  <option value="1">General Medicine</option>
                  <option value="2">Radiology</option>
                  <option value="3">Cardiology</option>
                  <option value="4">Laboratory</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Revenue Type</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="ALL">All Types</option>
                  <option value="consultation">Consultations</option>
                  <option value="diagnostics">Diagnostics</option>
                  <option value="pharmacy">Pharmacy</option>
                  <option value="lab">Lab Tests</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comparison</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="previous">Previous Period</option>
                  <option value="budget">Budget</option>
                  <option value="target">Target</option>
                  <option value="forecast">Forecast</option>
                </select>
              </div>
            </div>
          </div>
        </ResponsiveCard>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading dashboard data...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <p className="text-red-600 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Main Dashboard Content */}
      {!loading && !error && (
        <div className="space-y-6">
          {/* Key Financial Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Revenue Card */}
            <ResponsiveCard>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(dashboardData.revenue.total)}
                  </p>
                  <div className="flex items-center mt-2">
                    {dashboardData.revenue.growth > 0 ? (
                      <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-red-500 mr-1" />
                    )}
                    <span className={`text-sm ${dashboardData.revenue.growth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercentage(dashboardData.revenue.growth)}
                    </span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </ResponsiveCard>

            {/* Payables Card */}
            <ResponsiveCard>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Total Payables</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(dashboardData.payables.total)}
                  </p>
                  <div className="flex items-center mt-2">
                    {dashboardData.payables.growth > 0 ? (
                      <ArrowUpRight className="w-4 h-4 text-red-500 mr-1" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-green-500 mr-1" />
                    )}
                    <span className={`text-sm ${dashboardData.payables.growth > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatPercentage(Math.abs(dashboardData.payables.growth))}
                    </span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </ResponsiveCard>

            {/* Receivables Card */}
            <ResponsiveCard>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Total Receivables</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(dashboardData.receivables.total)}
                  </p>
                  <div className="flex items-center mt-2">
                    {dashboardData.receivables.growth > 0 ? (
                      <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-red-500 mr-1" />
                    )}
                    <span className={`text-sm ${dashboardData.receivables.growth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercentage(dashboardData.receivables.growth)}
                    </span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </ResponsiveCard>

            {/* Net Profit Card */}
            <ResponsiveCard>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Net Profit</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(dashboardData.profit.net)}
                  </p>
                  <div className="flex items-center mt-2">
                    <span className="text-sm text-gray-600">
                      Margin: {formatPercentage(dashboardData.profit.margin)}
                    </span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Calculator className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </ResponsiveCard>
          </div>

          {/* Revenue Trend Chart */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Revenue Trend</h3>
              <div className="flex items-center space-x-2">
                <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dashboardData.revenue.monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                  name="Revenue"
                />
                <Area
                  type="monotone"
                  dataKey="target"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.3}
                  name="Target"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Financial Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue by Category */}
            <ResponsiveCard>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Revenue by Category</h3>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dashboardData.revenue.byCategory}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {dashboardData.revenue.byCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </ResponsiveCard>

            {/* Payables Aging */}
            <ResponsiveCard>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Payables Aging</h3>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dashboardData.payables.aging}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="amount" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </ResponsiveCard>
          </div>

          {/* Receivables Aging */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Receivables Aging</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {dashboardData.receivables.aging.map((item, index) => (
                <div key={index} className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(item.amount)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">{item.period}</div>
                  <div className="text-sm font-medium text-blue-600 mt-1">
                    {formatPercentage(item.percentage)}
                  </div>
                </div>
              ))}
            </div>
          </ResponsiveCard>

          {/* Top Vendors */}
          {(roleView.showDetailedFinancials || userRole === 'ACCOUNTANT') && (
            <ResponsiveCard>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Top Payables</h3>
              </div>
              <div className="space-y-3">
                {dashboardData.payables.byVendor.map((vendor, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">{vendor.name}</div>
                      <div className="text-sm text-gray-500">Due: {vendor.dueDate}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">{formatCurrency(vendor.amount)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ResponsiveCard>
          )}

          {/* Key Performance Indicators */}
          {roleView.showKPIs && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ResponsiveCard>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {dashboardData.kpis.patientCount.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Total Patients</div>
                </div>
              </ResponsiveCard>
              
              <ResponsiveCard>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(dashboardData.kpis.avgRevenuePerPatient)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Avg Revenue/Patient</div>
                </div>
              </ResponsiveCard>
              
              <ResponsiveCard>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {formatPercentage(dashboardData.kpis.bedOccupancy)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Bed Occupancy</div>
                </div>
              </ResponsiveCard>
              
              <ResponsiveCard>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {formatPercentage(dashboardData.kpis.collectionRate)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Collection Rate</div>
                </div>
              </ResponsiveCard>
              
              <ResponsiveCard>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {formatPercentage(dashboardData.kpis.staffProductivity)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Staff Productivity</div>
                </div>
              </ResponsiveCard>
              
              <ResponsiveCard>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {formatPercentage(dashboardData.kpis.operatingMargin)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Operating Margin</div>
                </div>
              </ResponsiveCard>
            </div>
          )}

          {/* Cash Flow Summary */}
          {(roleView.showCashFlow || userRole === 'ACCOUNTANT') && (
            <ResponsiveCard>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Cash Flow Summary</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <ArrowDownRight className="w-5 h-5 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Inflow</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(dashboardData.cashFlow.inflow)}
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <ArrowUpRight className="w-5 h-5 text-red-500 mr-2" />
                    <span className="text-sm text-gray-600">Outflow</span>
                  </div>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(dashboardData.cashFlow.outflow)}
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Activity className="w-5 h-5 text-blue-500 mr-2" />
                    <span className="text-sm text-gray-600">Net Flow</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    {formatCurrency(dashboardData.cashFlow.net)}
                  </div>
                </div>
              </div>
            </ResponsiveCard>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvancedDashboard;
