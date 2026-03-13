import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  EyeOff, 
  Download, 
  Filter, 
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Calendar,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  Database,
  Layers,
  Zap,
  Target,
  MoreHorizontal,
  Maximize2,
  Minimize2
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveTable from '../Common/ResponsiveTable';
import {
  LineChart,
  AreaChart,
  BarChart,
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
  Treemap
} from 'recharts';
import '../styles/theme.css';

const DrillDownComponents = ({ data, type, onDrillDown, onExport, level = 0 }) => {
  const [expandedItems, setExpandedItems] = useState({});
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [viewMode, setViewMode] = useState('table');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const toggleExpansion = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleItemClick = (item, subType) => {
    if (item.subCategories || item.invoices || item.roles || item.companies) {
      toggleExpansion(item.id || item.name);
    } else {
      onDrillDown?.(subType, item);
    }
  };

  const renderRevenueDrillDown = (item) => {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{item.category}</h3>
            <p className="text-sm text-gray-600">Revenue Breakdown</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-600">{formatCurrency(item.amount)}</p>
            <p className="text-sm text-gray-500">{formatPercentage(item.percentage)} of total</p>
          </div>
        </div>

        {/* Subcategories */}
        {item.subCategories && (
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-gray-700">Subcategories</h4>
            {item.subCategories.map((subItem, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => handleItemClick(subItem, 'revenue-subcategory')}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{subItem.name}</p>
                    <p className="text-sm text-gray-500">
                      {subItem.patients ? `${subItem.patients.toLocaleString()} patients` : 
                       subItem.tests ? `${subItem.tests.toLocaleString()} tests` : 
                       subItem.items ? `${subItem.items.toLocaleString()} items` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatCurrency(subItem.amount)}</p>
                  <p className="text-sm text-gray-500">
                    {formatPercentage((subItem.amount / item.amount) * 100)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mini Chart */}
        <ResponsiveCard>
          <h4 className="text-md font-semibold text-gray-700 mb-4">Revenue Distribution</h4>
          <ResponsiveContainer width="100%" height={200}>
            <RechartsPieChart>
              <Pie
                data={item.subCategories}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                fill="#8884d8"
                dataKey="amount"
              >
                {item.subCategories.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </RechartsPieChart>
          </ResponsiveContainer>
        </ResponsiveCard>
      </div>
    );
  };

  const renderPayablesDrillDown = (item) => {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{item.vendor}</h3>
            <p className="text-sm text-gray-600">Payables Details</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(item.amount)}</p>
            <p className="text-sm text-gray-500">{formatPercentage(item.percentage)} of total</p>
            <p className="text-xs text-gray-500">Due: {item.dueDate}</p>
          </div>
        </div>

        {/* Invoices */}
        {item.invoices && (
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-gray-700">Invoices</h4>
            <ResponsiveTable
              data={item.invoices}
              columns={[
                { key: 'number', title: 'Invoice #', sortable: true },
                { 
                  key: 'amount', 
                  title: 'Amount', 
                  sortable: true,
                  render: (value) => formatCurrency(value)
                },
                { key: 'dueDate', title: 'Due Date', sortable: true },
                { key: 'status', title: 'Status', sortable: true },
                {
                  key: 'actions',
                  title: 'Actions',
                  render: (value, row) => (
                    <div className="flex items-center space-x-2">
                      <button className="p-1 text-blue-600 hover:text-blue-800">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-1 text-green-600 hover:text-green-800">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  )
                }
              ]}
              searchable={true}
              selectable={true}
              onSelectionChange={setSelectedItems}
            />
          </div>
        )}

        {/* Aging Analysis */}
        <ResponsiveCard>
          <h4 className="text-md font-semibold text-gray-700 mb-4">Aging Analysis</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-lg font-bold text-green-600">0-30 days</p>
              <p className="text-sm text-gray-600">Current</p>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <p className="text-lg font-bold text-yellow-600">31-60 days</p>
              <p className="text-sm text-gray-600">Overdue</p>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <p className="text-lg font-bold text-orange-600">61-90 days</p>
              <p className="text-sm text-gray-600">Critical</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-lg font-bold text-red-600">90+ days</p>
              <p className="text-sm text-gray-600">Urgent</p>
            </div>
          </div>
        </ResponsiveCard>
      </div>
    );
  };

  const renderReceivablesDrillDown = (item) => {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{item.payer}</h3>
            <p className="text-sm text-gray-600">Receivables Details</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(item.amount)}</p>
            <p className="text-sm text-gray-500">{formatPercentage(item.percentage)} of total</p>
            <p className="text-xs text-gray-500">Aging: {item.aging}</p>
          </div>
        </div>

        {/* Companies */}
        {item.companies && (
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-gray-700">Companies</h4>
            {item.companies.map((company, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => handleItemClick(company, 'receivables-company')}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Building className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{company.name}</p>
                    <p className="text-sm text-gray-500">
                      {company.claims ? `${company.claims.toLocaleString()} claims` : 
                       company.employees ? `${company.employees.toLocaleString()} employees` : 
                       company.transactions ? `${company.transactions.toLocaleString()} transactions` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatCurrency(company.amount)}</p>
                  <p className="text-sm text-gray-500">
                    {formatPercentage((company.amount / item.amount) * 100)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Collection Performance */}
        <ResponsiveCard>
          <h4 className="text-md font-semibold text-gray-700 mb-4">Collection Performance</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Collection Rate</span>
              <span className="text-sm font-bold text-green-600">94.5%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Average Days</span>
              <span className="text-sm font-bold text-orange-600">32 days</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Overdue Amount</span>
              <span className="text-sm font-bold text-red-600">{formatCurrency(item.amount * 0.15)}</span>
            </div>
          </div>
        </ResponsiveCard>
      </div>
    );
  };

  const renderExpensesDrillDown = (item) => {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{item.category}</h3>
            <p className="text-sm text-gray-600">Expense Details</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-red-600">{formatCurrency(item.amount)}</p>
            <p className="text-sm text-gray-500">{formatPercentage(item.percentage)} of total</p>
            <p className="text-xs text-gray-500">Budget: {formatCurrency(item.budget)}</p>
          </div>
        </div>

        {/* Subcategories */}
        {item.subCategories && (
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-gray-700">Subcategories</h4>
            {item.subCategories.map((subItem, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => handleItemClick(subItem, 'expenses-subcategory')}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                    <TrendingDown className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{subItem.name}</p>
                    <p className="text-sm text-gray-500">
                      {subItem.count ? `${subItem.count} employees` : 
                       subItem.items ? `${subItem.items} items` : 
                       subItem.sqft ? `${subItem.sqft.toLocaleString()} sqft` : 
                       subItem.units ? subItem.units : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatCurrency(subItem.amount)}</p>
                  <p className="text-sm text-gray-500">
                    {subItem.avgSalary ? `Avg: ${formatCurrency(subItem.avgSalary)}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Budget Variance */}
        <ResponsiveCard>
          <h4 className="text-md font-semibold text-gray-700 mb-4">Budget Analysis</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Budget</span>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(item.budget)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Actual</span>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(item.amount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Variance</span>
              <span className={`text-sm font-bold ${item.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(item.variance)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Utilization</span>
              <span className="text-sm font-bold text-blue-600">
                {formatPercentage((item.amount / item.budget) * 100)}
              </span>
            </div>
          </div>
        </ResponsiveCard>
      </div>
    );
  };

  const renderPayrollDrillDown = (item) => {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{item.department}</h3>
            <p className="text-sm text-gray-600">Payroll Details</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-purple-600">{formatCurrency(item.totalSalary)}</p>
            <p className="text-sm text-gray-500">{formatPercentage(item.percentage)} of total</p>
            <p className="text-xs text-gray-500">{item.employees} employees</p>
          </div>
        </div>

        {/* Roles */}
        {item.roles && (
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-gray-700">Roles</h4>
            {item.roles.map((role, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => handleItemClick(role, 'payroll-role')}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Users className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{role.title}</p>
                    <p className="text-sm text-gray-500">{role.count} employees</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatCurrency(role.totalSalary)}</p>
                  <p className="text-sm text-gray-500">Avg: {formatCurrency(role.avgSalary)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Performance Metrics */}
        <ResponsiveCard>
          <h4 className="text-md font-semibold text-gray-700 mb-4">Performance Metrics</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-lg font-bold text-green-600">87.2%</p>
              <p className="text-sm text-gray-600">Productivity</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-lg font-bold text-blue-600">94.5%</p>
              <p className="text-sm text-gray-600">Attendance</p>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <p className="text-lg font-bold text-orange-600">1,234</p>
              <p className="text-sm text-gray-600">Overtime Hours</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-lg font-bold text-purple-600">567</p>
              <p className="text-sm text-gray-600">Training Hours</p>
            </div>
          </div>
        </ResponsiveCard>
      </div>
    );
  };

  const renderDrillDownContent = () => {
    if (!data) return null;

    switch (type) {
      case 'revenue-category':
        return renderRevenueDrillDown(data);
      case 'payables-vendor':
        return renderPayablesDrillDown(data);
      case 'receivables-payer':
        return renderReceivablesDrillDown(data);
      case 'expenses-category':
        return renderExpensesDrillDown(data);
      case 'payroll-department':
        return renderPayrollDrillDown(data);
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Drill-Down Analysis</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode(viewMode === 'table' ? 'chart' : 'table')}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {viewMode === 'table' ? <BarChart3 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={() => onExport?.(data)}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search drill-down data..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Drill-Down Content */}
      {renderDrillDownContent()}

      {/* Level Indicator */}
      <div className="flex items-center justify-center space-x-2 p-4 bg-gray-50 rounded-lg">
        <Layers className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-600">Level {level + 1} Analysis</span>
        <div className="flex items-center space-x-1">
          {[...Array(level + 1)].map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full ${
                index === level ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DrillDownComponents;
