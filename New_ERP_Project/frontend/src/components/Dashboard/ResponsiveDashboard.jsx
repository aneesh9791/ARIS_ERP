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
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import '../styles/theme.css';
import '../styles/responsive.css';

const ResponsiveDashboard = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCards, setExpandedCards] = useState({});
  const [viewMode, setViewMode] = useState('grid'); // grid, list, compact
  const [screenSize, setScreenSize] = useState('mobile');
  const [showDetails, setShowDetails] = useState({});

  // Detect screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
        setViewMode('list');
      } else if (width < 1024) {
        setScreenSize('tablet');
        setViewMode('grid');
      } else {
        setScreenSize('desktop');
        setViewMode('grid');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const toggleDetails = (itemId) => {
    setShowDetails(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
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

  // Responsive stats grid
  const getStatsGridClasses = () => {
    if (screenSize === 'mobile') {
      return 'grid grid-cols-2 gap-4';
    } else if (screenSize === 'tablet') {
      return 'grid grid-cols-2 gap-6';
    } else {
      return 'grid grid-cols-2 lg:grid-cols-4 gap-6';
    }
  };

  // Responsive card classes
  const getCardClasses = () => {
    let classes = 'bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all duration-200';
    
    if (screenSize === 'mobile') {
      classes += ' p-4';
    } else if (screenSize === 'tablet') {
      classes += ' p-6';
    } else {
      classes += ' p-6';
    }
    
    return classes;
  };

  // Responsive Stat Card Component
  const StatCard = ({ title, value, change, icon: Icon, color, type }) => {
    const isCompact = screenSize === 'mobile';
    
    return (
      <div className={getCardClasses()}>
        <div className="flex items-center justify-between">
          <div className={`${isCompact ? 'flex-1' : ''}`}>
            <p className={`font-medium text-gray-600 ${isCompact ? 'text-xs' : 'text-sm'}`}>
              {title}
            </p>
            <p className={`font-bold text-gray-900 mt-1 ${isCompact ? 'text-lg' : 'text-2xl'}`}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {!isCompact && change && (
              <div className="flex items-center mt-2 text-sm">
                {change.type === 'positive' ? (
                  <ArrowUp className="w-4 h-4 text-green-500 mr-1" />
                ) : (
                  <ArrowDown className="w-4 h-4 text-red-500 mr-1" />
                )}
                <span className={change.type === 'positive' ? 'text-green-600' : 'text-red-600'}>
                  {change.value}
                </span>
              </div>
            )}
          </div>
          
          {!isCompact && (
            <div className={`w-12 h-12 ${color} rounded-lg flex items-center justify-center ml-4`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
          )}
        </div>
      </div>
    );
  };

  // Responsive Activity List Component
  const ActivityList = () => {
    const isCompact = screenSize === 'mobile';
    
    return (
      <div className={getCardClasses()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-semibold text-gray-900 ${isCompact ? 'text-base' : 'text-lg'}`}>
            Recent Activities
          </h3>
          <button className="text-gray-400 hover:text-gray-600">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          {recentActivities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-3">
              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getActivityColor(activity.type)}`}>
                <getActivityIcon type={activity.type} className="w-3 h-3 sm:w-4 sm:h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-gray-900 ${isCompact ? 'text-sm' : 'text-base'}`}>
                  {activity.message}
                </p>
                <p className={`text-gray-500 mt-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                  {activity.user} • {activity.time}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Responsive Low Stock Component
  const LowStockAlerts = () => {
    const isCompact = screenSize === 'mobile';
    
    return (
      <div className={getCardClasses()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-semibold text-gray-900 ${isCompact ? 'text-base' : 'text-lg'}`}>
            Low Stock Alerts
          </h3>
          <button className="text-gray-400 hover:text-gray-600">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          {lowStockItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <div className="flex-1">
                <p className={`font-medium text-gray-900 ${isCompact ? 'text-sm' : 'text-base'}`}>
                  {item.name}
                </p>
                <p className={`text-gray-500 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                  Min: {item.minStock} {item.unit}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-bold text-red-600 ${isCompact ? 'text-base' : 'text-lg'}`}>
                  {item.current_stock}
                </p>
                <p className={`text-gray-500 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                  {item.unit}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Responsive Appointments Table
  const AppointmentsTable = () => {
    const isCompact = screenSize === 'mobile' || screenSize === 'tablet';
    
    return (
      <div className={getCardClasses()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-semibold text-gray-900 ${isCompact ? 'text-base' : 'text-lg'}`}>
            Upcoming Appointments
          </h3>
          <button className="text-gray-400 hover:text-gray-600">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
        
        {isCompact ? (
          // Card layout for mobile/tablet
          <div className="space-y-3">
            {upcomingAppointments.map((appointment) => (
              <div key={appointment.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">{appointment.patient}</h4>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    appointment.status === 'confirmed' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {appointment.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Time:</span>
                    <span className="text-gray-900 ml-1">{appointment.time}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Type:</span>
                    <span className="text-gray-900 ml-1">{appointment.type}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Doctor:</span>
                    <span className="text-gray-900 ml-1">{appointment.doctor}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Table layout for desktop
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Doctor
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
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
        )}
      </div>
    );
  };

  // Responsive Revenue Overview
  const RevenueOverview = () => {
    const isCompact = screenSize === 'mobile';
    
    return (
      <div className={`${getCardClasses()} ${!isCompact ? 'lg:col-span-2' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-semibold text-gray-900 ${isCompact ? 'text-base' : 'text-lg'}`}>
            Revenue Overview
          </h3>
          <button className="text-gray-400 hover:text-gray-600">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
        <div className={`${isCompact ? 'space-y-3' : 'space-y-4'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-gray-600 ${isCompact ? 'text-sm' : 'text-sm'}`}>Total Revenue</p>
              <p className={`font-bold text-green-600 ${isCompact ? 'text-xl' : 'text-2xl'}`}>
                {formatCurrency(stats.totalRevenue)}
              </p>
            </div>
            <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center`}>
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-gray-600 ${isCompact ? 'text-sm' : 'text-sm'}`}>Total Expenses</p>
              <p className={`font-bold text-red-600 ${isCompact ? 'text-xl' : 'text-2xl'}`}>
                {formatCurrency(stats.totalExpenses)}
              </p>
            </div>
            <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-red-100 rounded-lg flex items-center justify-center`}>
              <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-gray-600 ${isCompact ? 'text-sm' : 'text-sm'}`}>Net Profit</p>
              <p className={`font-bold text-blue-600 ${isCompact ? 'text-xl' : 'text-2xl'}`}>
                {formatCurrency(stats.totalRevenue - stats.totalExpenses)}
              </p>
            </div>
            <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center`}>
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className={`font-bold text-gray-900 ${screenSize === 'mobile' ? 'text-2xl' : 'text-3xl'}`}>
            Dashboard
          </h1>
          <p className="text-gray-500 mt-1">Welcome back! Here's what's happening today.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className={`px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${screenSize === 'mobile' ? 'text-sm' : 'text-base'}`}
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
          
          <div className="flex items-center space-x-2">
            <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
              <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button 
              onClick={() => setIsLoading(!isLoading)}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className={getStatsGridClasses()}>
        <StatCard
          title="Total Assets"
          value={stats.totalAssets}
          change={{ type: 'positive', value: '+12%' }}
          icon={Package}
          color={getStatColor('assets')}
        />
        <StatCard
          title="Active Patients"
          value={stats.activePatients}
          change={{ type: 'positive', value: '+8%' }}
          icon={Users}
          color={getStatColor('patients')}
        />
        <StatCard
          title="Low Stock"
          value={stats.lowStockItems}
          change={{ type: 'warning', value: 'Attention' }}
          icon={AlertTriangle}
          color={getStatColor('stock')}
        />
        <StatCard
          title="Pending"
          value={stats.pendingApprovals}
          change={{ type: 'warning', value: '3 urgent' }}
          icon={FileText}
          color={getStatColor('approvals')}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Revenue Overview */}
        <RevenueOverview />
        
        {/* Today's Schedule */}
        <div className={getCardClasses()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`font-semibold text-gray-900 ${screenSize === 'mobile' ? 'text-base' : 'text-lg'}`}>
              Today's Schedule
            </h3>
            <button className="text-gray-400 hover:text-gray-600">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Appointments</p>
                <p className="font-bold text-purple-600">{stats.appointmentsToday}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Staff on Duty</p>
                <p className="font-bold text-indigo-600">{stats.staffOnDuty}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Building className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Occupancy</p>
                <p className="font-bold text-teal-600">78%</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <ActivityList />
        <LowStockAlerts />
      </div>

      {/* Appointments Table */}
      <AppointmentsTable />
    </div>
  );
};

export default ResponsiveDashboard;
