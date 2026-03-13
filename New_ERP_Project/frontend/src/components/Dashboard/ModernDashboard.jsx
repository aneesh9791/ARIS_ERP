import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Users, 
  Package, 
  AlertTriangle, 
  DollarSign, 
  Activity, 
  Calendar,
  Building,
  CreditCard,
  FileText,
  Bell,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  Search,
  Filter,
  Download,
  RefreshCw
} from 'lucide-react';
import '../styles/theme.css';

const ModernDashboard = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCards, setExpandedCards] = useState({});

  // Sample data - in real app, this would come from API
  const stats = {
    totalAssets: 1247,
    activePatients: 342,
    lowStockItems: 8,
    pendingApprovals: 15,
    totalRevenue: 2456789,
    totalExpenses: 1234567,
    appointmentsToday: 24,
    staffOnDuty: 45
  };

  const recentActivities = [
    { id: 1, type: 'asset', message: 'New MRI Machine added to Radiology', time: '2 mins ago', user: 'Dr. Smith' },
    { id: 2, type: 'patient', message: 'Patient John Doe registered', time: '5 mins ago', user: 'Reception' },
    { id: 3, type: 'maintenance', message: 'X-Ray Machine maintenance completed', time: '1 hour ago', user: 'Maintenance Team' },
    { id: 4, type: 'billing', message: 'Invoice #1234 generated', time: '2 hours ago', user: 'Billing Dept' },
    { id: 5, type: 'alert', message: 'Low stock alert: Syringes', time: '3 hours ago', user: 'System' }
  ];

  const upcomingAppointments = [
    { id: 1, patient: 'John Doe', time: '09:00 AM', type: 'MRI Scan', doctor: 'Dr. Smith', status: 'confirmed' },
    { id: 2, patient: 'Jane Smith', time: '09:30 AM', type: 'CT Scan', doctor: 'Dr. Johnson', status: 'confirmed' },
    { id: 3, patient: 'Robert Johnson', time: '10:00 AM', type: 'X-Ray', doctor: 'Dr. Williams', status: 'pending' },
    { id: 4, patient: 'Mary Davis', time: '10:30 AM', type: 'Ultrasound', doctor: 'Dr. Brown', status: 'confirmed' }
  ];

  const lowStockItems = [
    { id: 1, name: 'Syringes 5ml', currentStock: 45, minStock: 100, unit: 'pieces' },
    { id: 2, name: 'Gloves Medium', currentStock: 12, minStock: 50, unit: 'boxes' },
    { id: 3, name: 'Face Masks', currentStock: 8, minStock: 25, unit: 'boxes' },
    { id: 4, name: 'Alcohol Swabs', currentStock: 15, minStock: 30, unit: 'packets' }
  ];

  const toggleCardExpansion = (cardId) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const getStatIcon = (type) => {
    const icons = {
      assets: Package,
      patients: Users,
      stock: AlertTriangle,
      approvals: FileText,
      revenue: DollarSign,
      expenses: CreditCard,
      appointments: Calendar,
      staff: Building
    };
    return icons[type] || Activity;
  };

  const getStatColor = (type) => {
    const colors = {
      assets: 'bg-blue-500',
      patients: 'bg-green-500',
      stock: 'bg-red-500',
      approvals: 'bg-yellow-500',
      revenue: 'bg-emerald-500',
      expenses: 'bg-red-500',
      appointments: 'bg-purple-500',
      staff: 'bg-indigo-500'
    };
    return colors[type] || 'bg-gray-500';
  };

  const getActivityIcon = (type) => {
    const icons = {
      asset: Package,
      patient: Users,
      maintenance: RefreshCw,
      billing: CreditCard,
      alert: Bell
    };
    return icons[type] || Activity;
  };

  const getActivityColor = (type) => {
    const colors = {
      asset: 'text-blue-600 bg-blue-50',
      patient: 'text-green-600 bg-green-50',
      maintenance: 'text-purple-600 bg-purple-50',
      billing: 'text-yellow-600 bg-yellow-50',
      alert: 'text-red-600 bg-red-50'
    };
    return colors[type] || 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Welcome back! Here's what's happening today.</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
          <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <Filter className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <Download className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsLoading(!isLoading)}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Assets</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalAssets.toLocaleString()}</p>
              <div className="flex items-center mt-2 text-sm">
                <ArrowUp className="w-4 h-4 text-green-500 mr-1" />
                <span className="text-green-600">12% from last month</span>
              </div>
            </div>
            <div className={`w-12 h-12 ${getStatColor('assets')} rounded-lg flex items-center justify-center`}>
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Patients</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.activePatients}</p>
              <div className="flex items-center mt-2 text-sm">
                <ArrowUp className="w-4 h-4 text-green-500 mr-1" />
                <span className="text-green-600">8% from last week</span>
              </div>
            </div>
            <div className={`w-12 h-12 ${getStatColor('patients')} rounded-lg flex items-center justify-center`}>
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.lowStockItems}</p>
              <div className="flex items-center mt-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-red-500 mr-1" />
                <span className="text-red-600">Requires attention</span>
              </div>
            </div>
            <div className={`w-12 h-12 ${getStatColor('stock')} rounded-lg flex items-center justify-center`}>
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Approvals</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.pendingApprovals}</p>
              <div className="flex items-center mt-2 text-sm">
                <Clock className="w-4 h-4 text-yellow-500 mr-1" />
                <span className="text-yellow-600">3 urgent</span>
              </div>
            </div>
            <div className={`w-12 h-12 ${getStatColor('approvals')} rounded-lg flex items-center justify-center`}>
              <FileText className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Revenue and Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Revenue Overview</h3>
            <button className="text-gray-400 hover:text-gray-600">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalRevenue)}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.totalExpenses)}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Net Profit</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.totalRevenue - stats.totalExpenses)}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Today's Schedule</h3>
            <button className="text-gray-400 hover:text-gray-600">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Appointments</p>
                <p className="text-2xl font-bold text-purple-600">{stats.appointmentsToday}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Staff on Duty</p>
                <p className="text-2xl font-bold text-indigo-600">{stats.staffOnDuty}</p>
              </div>
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Building className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Occupancy Rate</p>
                <p className="text-2xl font-bold text-teal-600">78%</p>
              </div>
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-teal-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activities and Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activities</h3>
            <button className="text-gray-400 hover:text-gray-600">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getActivityColor(activity.type)}`}>
                  <getActivityIcon type={activity.type} className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{activity.message}</p>
                  <p className="text-xs text-gray-500 mt-1">{activity.user} • {activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Low Stock Alerts</h3>
            <button className="text-gray-400 hover:text-gray-600">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            {lowStockItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-500">Min: {item.minStock} {item.unit}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-600">{item.current_stock}</p>
                  <p className="text-xs text-gray-500">{item.unit}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming Appointments */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Upcoming Appointments</h3>
          <button className="text-gray-400 hover:text-gray-600">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Patient</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Time</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Type</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Doctor</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcomingAppointments.map((appointment) => (
                <tr key={appointment.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">{appointment.patient}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{appointment.time}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{appointment.type}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{appointment.doctor}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      appointment.status === 'confirmed' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {appointment.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ModernDashboard;
