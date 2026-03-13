import React, { useState, useEffect } from 'react';
import {
  LineChart,
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
  RadialBar,
  ComposedChart,
  ScatterChart,
  Scatter
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Activity, BarChart3, PieChart, Calendar } from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import '../styles/theme.css';

const FinancialCharts = ({ data = {}, dateRange = 'month', userRole = 'ADMIN' }) => {
  const [chartType, setChartType] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [screenSize, setScreenSize] = useState('desktop');

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

  // Enhanced mock data for financial charts
  const [financialData, setFinancialData] = useState({
    revenue: {
      monthly: [
        { month: 'Jan', revenue: 1800000, target: 2000000, forecast: 1900000, actual: 1850000 },
        { month: 'Feb', revenue: 2100000, target: 2200000, forecast: 2150000, actual: 2080000 },
        { month: 'Mar', revenue: 2456789, target: 2500000, forecast: 2480000, actual: 2456789 },
        { month: 'Apr', revenue: 2300000, target: 2400000, forecast: 2350000, actual: 2280000 },
        { month: 'May', revenue: 2600000, target: 2700000, forecast: 2650000, actual: 2620000 },
        { month: 'Jun', revenue: 2800000, target: 3000000, forecast: 2900000, actual: 2750000 }
      ],
      daily: [
        { date: '2024-03-01', revenue: 85000, patients: 45 },
        { date: '2024-03-02', revenue: 92000, patients: 48 },
        { date: '2024-03-03', revenue: 78000, patients: 42 },
        { date: '2024-03-04', revenue: 95000, patients: 51 },
        { date: '2024-03-05', revenue: 88000, patients: 46 },
        { date: '2024-03-06', revenue: 102000, patients: 55 },
        { date: '2024-03-07', revenue: 76000, patients: 40 }
      ],
      hourly: [
        { hour: '8AM', revenue: 15000, patients: 8 },
        { hour: '9AM', revenue: 35000, patients: 18 },
        { hour: '10AM', revenue: 45000, patients: 24 },
        { hour: '11AM', revenue: 38000, patients: 20 },
        { hour: '12PM', revenue: 22000, patients: 12 },
        { hour: '1PM', revenue: 18000, patients: 10 },
        { hour: '2PM', revenue: 32000, patients: 17 },
        { hour: '3PM', revenue: 28000, patients: 15 },
        { hour: '4PM', revenue: 25000, patients: 13 },
        { hour: '5PM', revenue: 20000, patients: 11 }
      ],
      byCategory: [
        { name: 'Consultations', value: 856789, percentage: 34.8, growth: 12.5 },
        { name: 'Diagnostics', value: 654321, percentage: 26.6, growth: 8.3 },
        { name: 'Pharmacy', value: 432654, percentage: 17.6, growth: 15.2 },
        { name: 'Lab Tests', value: 345678, percentage: 14.1, growth: 6.7 },
        { name: 'Imaging', value: 234567, percentage: 9.5, growth: 18.9 },
        { name: 'Other Services', value: 342780, percentage: 13.9, growth: 5.4 }
      ],
      byCenter: [
        { name: 'Main Hospital', revenue: 1456789, percentage: 59.3, patients: 7234 },
        { name: 'Diagnostic Center', revenue: 654321, percentage: 26.6, patients: 3456 },
        { name: 'Clinic Branch', revenue: 234567, percentage: 9.6, patients: 1234 },
        { name: 'Specialty Center', revenue: 111112, percentage: 4.5, patients: 890 }
      ]
    },
    expenses: {
      monthly: [
        { month: 'Jan', expenses: 1200000, budget: 1300000, variance: -100000 },
        { month: 'Feb', expenses: 1350000, budget: 1400000, variance: -50000 },
        { month: 'Mar', expenses: 1450000, budget: 1500000, variance: -50000 },
        { month: 'Apr', expenses: 1380000, budget: 1450000, variance: -70000 },
        { month: 'May', expenses: 1520000, budget: 1600000, variance: -80000 },
        { month: 'Jun', expenses: 1650000, budget: 1700000, variance: -50000 }
      ],
      categories: [
        { name: 'Salaries & Wages', amount: 876543, percentage: 46.7, budget: 900000 },
        { name: 'Medical Supplies', amount: 456789, percentage: 24.3, budget: 500000 },
        { name: 'Equipment & Maintenance', amount: 234567, percentage: 12.5, budget: 250000 },
        { name: 'Utilities & Rent', amount: 123456, percentage: 6.6, budget: 150000 },
        { name: 'Marketing & Admin', amount: 98765, percentage: 5.3, budget: 100000 },
        { name: 'Insurance & Legal', amount: 76543, percentage: 4.1, budget: 80000 },
        { name: 'Other Expenses', amount: 87880, percentage: 4.7, budget: 100000 }
      ],
      trends: [
        { month: 'Jan', salaries: 700000, supplies: 300000, equipment: 150000, utilities: 50000 },
        { month: 'Feb', salaries: 720000, supplies: 320000, equipment: 180000, utilities: 55000 },
        { month: 'Mar', salaries: 750000, supplies: 340000, equipment: 200000, utilities: 60000 },
        { month: 'Apr', salaries: 730000, supplies: 330000, equipment: 190000, utilities: 58000 },
        { month: 'May', salaries: 780000, supplies: 360000, equipment: 220000, utilities: 62000 },
        { month: 'Jun', salaries: 820000, supplies: 380000, equipment: 250000, utilities: 65000 }
      ]
    },
    profitability: {
      monthly: [
        { month: 'Jan', revenue: 1800000, expenses: 1200000, profit: 600000, margin: 33.3 },
        { month: 'Feb', revenue: 2100000, expenses: 1350000, profit: 750000, margin: 35.7 },
        { month: 'Mar', revenue: 2456789, expenses: 1450000, profit: 1006789, margin: 41.0 },
        { month: 'Apr', revenue: 2300000, expenses: 1380000, profit: 920000, margin: 40.0 },
        { month: 'May', revenue: 2600000, expenses: 1520000, profit: 1080000, margin: 41.5 },
        { month: 'Jun', revenue: 2800000, expenses: 1650000, profit: 1150000, margin: 41.1 }
      ],
      byService: [
        { service: 'Consultations', revenue: 856789, cost: 342716, profit: 514073, margin: 60.0 },
        { service: 'Diagnostics', revenue: 654321, cost: 392593, profit: 261728, margin: 40.0 },
        { service: 'Pharmacy', revenue: 432654, cost: 349124, profit: 83530, margin: 19.3 },
        { service: 'Lab Tests', revenue: 345678, cost: 207407, profit: 138271, margin: 40.0 },
        { service: 'Imaging', revenue: 234567, cost: 164397, profit: 70170, margin: 29.9 }
      ],
      kpis: {
        grossMargin: 41.2,
        netMargin: 27.8,
        operatingMargin: 35.5,
        returnOnAssets: 18.7,
        returnOnEquity: 22.3,
        earningsPerShare: 12.5,
        priceToEarnings: 15.2,
        debtToEquity: 0.45
      }
    },
    cashFlow: {
      monthly: [
        { month: 'Jan', inflow: 2200000, outflow: 1800000, net: 400000 },
        { month: 'Feb', inflow: 2450000, outflow: 1950000, net: 500000 },
        { month: 'Mar', inflow: 2800000, outflow: 2100000, net: 700000 },
        { month: 'Apr', inflow: 2650000, outflow: 2000000, net: 650000 },
        { month: 'May', inflow: 2900000, outflow: 2200000, net: 700000 },
        { month: 'Jun', inflow: 3100000, outflow: 2350000, net: 750000 }
      ],
      sources: [
        { source: 'Patient Collections', amount: 1800000, percentage: 65.5 },
        { source: 'Insurance Payments', amount: 650000, percentage: 23.7 },
        { source: 'Corporate Clients', amount: 200000, percentage: 7.3 },
        { source: 'Government Schemes', amount: 80000, percentage: 2.9 },
        { source: 'Other Income', amount: 20000, percentage: 0.6 }
      ],
      uses: [
        { use: 'Salaries', amount: 1200000, percentage: 43.5 },
        { use: 'Supplier Payments', amount: 800000, percentage: 29.1 },
        { use: 'Operating Expenses', amount: 400000, percentage: 14.5 },
        { use: 'Capital Expenditure', amount: 200000, percentage: 7.3 },
        { use: 'Loan Repayments', amount: 100000, percentage: 3.6 },
        { use: 'Other Payments', amount: 50000, percentage: 1.8 }
      ]
    }
  });

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

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

  // Custom tooltip for financial charts
  const FinancialTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.name.includes('Revenue') || entry.name.includes('Profit') || entry.name.includes('Inflow') ? 
                formatCurrency(entry.value) : 
                entry.name.includes('Margin') || entry.name.includes('Percentage') ? 
                formatPercentage(entry.value) : 
                entry.value
              }
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Revenue Overview Chart
  const RevenueOverviewChart = () => (
    <ResponsiveCard>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Revenue Overview</h3>
        <div className="flex items-center space-x-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={screenSize === 'mobile' ? 250 : 350}>
        <ComposedChart data={financialData.revenue.monthly}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
          <Tooltip content={<FinancialTooltip />} />
          <Legend />
          <Bar dataKey="target" fill="#e5e7eb" name="Target" />
          <Bar dataKey="actual" fill="#3b82f6" name="Actual" />
          <Line type="monotone" dataKey="forecast" stroke="#10b981" strokeWidth={2} name="Forecast" />
        </ComposedChart>
      </ResponsiveContainer>
    </ResponsiveCard>
  );

  // Revenue by Category Pie Chart
  const RevenueByCategoryChart = () => (
    <ResponsiveCard>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Revenue by Category</h3>
      </div>
      
      <ResponsiveContainer width="100%" height={screenSize === 'mobile' ? 250 : 300}>
        <RechartsPieChart>
          <Pie
            data={financialData.revenue.byCategory}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percentage, growth }) => (
              <div>
                <div className="font-medium">{name}</div>
                <div className="text-xs text-gray-500">{formatPercentage(percentage)}</div>
                <div className="text-xs text-green-600">↑{formatPercentage(growth)}</div>
              </div>
            )}
            outerRadius={screenSize === 'mobile' ? 80 : 100}
            fill="#8884d8"
            dataKey="value"
          >
            {financialData.revenue.byCategory.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatCurrency(value)} />
        </RechartsPieChart>
      </ResponsiveContainer>
    </ResponsiveCard>
  );

  // Expense Analysis Chart
  const ExpenseAnalysisChart = () => (
    <ResponsiveCard>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Expense Analysis</h3>
      </div>
      
      <ResponsiveContainer width="100%" height={screenSize === 'mobile' ? 250 : 350}>
        <BarChart data={financialData.expenses.categories} layout="horizontal">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
          <YAxis dataKey="name" type="category" width={120} />
          <Tooltip content={<FinancialTooltip />} />
          <Bar dataKey="amount" fill="#ef4444" name="Actual" />
          <Bar dataKey="budget" fill="#f59e0b" name="Budget" />
        </BarChart>
      </ResponsiveContainer>
    </ResponsiveCard>
  );

  // Profitability Trend Chart
  const ProfitabilityTrendChart = () => (
    <ResponsiveCard>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Profitability Trend</h3>
      </div>
      
      <ResponsiveContainer width="100%" height={screenSize === 'mobile' ? 250 : 350}>
        <ComposedChart data={financialData.profitability.monthly}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis yAxisId="left" tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} />
          <Tooltip content={<FinancialTooltip />} />
          <Legend />
          <Bar yAxisId="left" dataKey="expenses" fill="#ef4444" name="Expenses" />
          <Bar yAxisId="left" dataKey="revenue" fill="#10b981" name="Revenue" />
          <Line yAxisId="right" type="monotone" dataKey="margin" stroke="#3b82f6" strokeWidth={2} name="Margin %" />
        </ComposedChart>
      </ResponsiveContainer>
    </ResponsiveCard>
  );

  // Cash Flow Chart
  const CashFlowChart = () => (
    <ResponsiveCard>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Cash Flow Analysis</h3>
      </div>
      
      <ResponsiveContainer width="100%" height={screenSize === 'mobile' ? 250 : 350}>
        <AreaChart data={financialData.cashFlow.monthly}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
          <Tooltip content={<FinancialTooltip />} />
          <Legend />
          <Area type="monotone" dataKey="inflow" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Inflow" />
          <Area type="monotone" dataKey="outflow" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Outflow" />
        </AreaChart>
      </ResponsiveContainer>
    </ResponsiveCard>
  );

  // Profitability by Service
  const ProfitabilityByServiceChart = () => (
    <ResponsiveCard>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Profitability by Service</h3>
      </div>
      
      <ResponsiveContainer width="100%" height={screenSize === 'mobile' ? 250 : 350}>
        <BarChart data={financialData.profitability.byService}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="service" />
          <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
          <Tooltip content={<FinancialTooltip />} />
          <Legend />
          <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
          <Bar dataKey="cost" fill="#ef4444" name="Cost" />
          <Bar dataKey="profit" fill="#3b82f6" name="Profit" />
        </BarChart>
      </ResponsiveContainer>
    </ResponsiveCard>
  );

  // KPI Radial Chart
  const KPIRadialChart = () => {
    const kpiData = [
      { name: 'Gross Margin', value: financialData.profitability.kpis.grossMargin, target: 40, fill: '#3b82f6' },
      { name: 'Net Margin', value: financialData.profitability.kpis.netMargin, target: 30, fill: '#10b981' },
      { name: 'Operating Margin', value: financialData.profitability.kpis.operatingMargin, target: 35, fill: '#f59e0b' },
      { name: 'ROA', value: financialData.profitability.kpis.returnOnAssets, target: 20, fill: '#ef4444' },
      { name: 'ROE', value: financialData.profitability.kpis.returnOnEquity, target: 25, fill: '#8b5cf6' },
      { name: 'D/E Ratio', value: (1 - financialData.profitability.kpis.debtToEquity) * 100, target: 80, fill: '#ec4899' }
    ];

    return (
      <ResponsiveCard>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Key Performance Indicators</h3>
        </div>
        
        <ResponsiveContainer width="100%" height={screenSize === 'mobile' ? 250 : 350}>
          <RadialBarChart cx="50%" cy="50%" innerRadius="10%" outerRadius="80%" data={kpiData}>
            <RadialBar dataKey="value" fill="#8884d8" />
            <Tooltip 
              content={({ payload }) => (
                <div className="bg-white p-2 border border-gray-200 rounded shadow">
                  <p className="font-semibold">{payload[0]?.payload?.name}</p>
                  <p className="text-sm">Current: {formatPercentage(payload[0]?.value)}</p>
                  <p className="text-sm">Target: {formatPercentage(payload[0]?.payload?.target)}</p>
                </div>
              )}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          {kpiData.map((kpi, index) => (
            <div key={index} className="text-center">
              <div className="text-sm font-medium text-gray-600">{kpi.name}</div>
              <div className="text-lg font-bold text-gray-900">{formatPercentage(kpi.value)}</div>
              <div className="text-xs text-gray-500">Target: {formatPercentage(kpi.target)}</div>
            </div>
          ))}
        </div>
      </ResponsiveCard>
    );
  };

  // Daily Revenue Trend
  const DailyRevenueTrendChart = () => (
    <ResponsiveCard>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Daily Revenue Trend</h3>
      </div>
      
      <ResponsiveContainer width="100%" height={screenSize === 'mobile' ? 200 : 300}>
        <AreaChart data={financialData.revenue.daily}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`} />
          <Tooltip content={<FinancialTooltip />} />
          <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
        </AreaChart>
      </ResponsiveContainer>
    </ResponsiveCard>
  );

  // Hourly Revenue Pattern
  const HourlyRevenuePatternChart = () => (
    <ResponsiveCard>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Hourly Revenue Pattern</h3>
      </div>
      
      <ResponsiveContainer width="100%" height={screenSize === 'mobile' ? 200 : 300}>
        <ComposedChart data={financialData.revenue.hourly}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="hour" />
          <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`} />
          <Tooltip content={<FinancialTooltip />} />
          <Legend />
          <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" />
          <Line type="monotone" dataKey="patients" stroke="#10b981" strokeWidth={2} name="Patients" />
        </ComposedChart>
      </ResponsiveContainer>
    </ResponsiveCard>
  );

  // Render charts based on chart type
  const renderCharts = () => {
    switch (chartType) {
      case 'overview':
        return (
          <div className="space-y-6">
            <RevenueOverviewChart />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RevenueByCategoryChart />
              <ExpenseAnalysisChart />
            </div>
            <ProfitabilityTrendChart />
          </div>
        );
      
      case 'detailed':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProfitabilityByServiceChart />
              <CashFlowChart />
            </div>
            <KPIRadialChart />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DailyRevenueTrendChart />
              <HourlyRevenuePatternChart />
            </div>
          </div>
        );
      
      case 'revenue':
        return (
          <div className="space-y-6">
            <RevenueOverviewChart />
            <RevenueByCategoryChart />
            <DailyRevenueTrendChart />
            <HourlyRevenuePatternChart />
          </div>
        );
      
      case 'expenses':
        return (
          <div className="space-y-6">
            <ExpenseAnalysisChart />
          </div>
        );
      
      case 'profitability':
        return (
          <div className="space-y-6">
            <ProfitabilityTrendChart />
            <ProfitabilityByServiceChart />
            <KPIRadialChart />
          </div>
        );
      
      case 'cashflow':
        return (
          <div className="space-y-6">
            <CashFlowChart />
          </div>
        );
      
      default:
        return <RevenueOverviewChart />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Chart Type Selector */}
      <div className="flex flex-wrap items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setChartType('overview')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              chartType === 'overview' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Overview
          </button>
          
          <button
            onClick={() => setChartType('detailed')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              chartType === 'detailed' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <PieChart className="w-4 h-4 mr-2" />
            Detailed
          </button>
          
          <button
            onClick={() => setChartType('revenue')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              chartType === 'revenue' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Revenue
          </button>
          
          <button
            onClick={() => setChartType('expenses')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              chartType === 'expenses' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <TrendingDown className="w-4 h-4 mr-2" />
            Expenses
          </button>
          
          <button
            onClick={() => setChartType('profitability')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              chartType === 'profitability' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Profitability
          </button>
          
          <button
            onClick={() => setChartType('cashflow')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              chartType === 'cashflow' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Activity className="w-4 h-4 mr-2" />
            Cash Flow
          </button>
        </div>
        
        <div className="flex items-center space-x-2">
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
          </select>
        </div>
      </div>

      {/* Render Charts */}
      {renderCharts()}
    </div>
  );
};

export default FinancialCharts;
