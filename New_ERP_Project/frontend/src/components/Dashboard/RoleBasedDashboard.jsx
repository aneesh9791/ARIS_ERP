import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Building, 
  Briefcase, 
  Calculator, 
  Stethoscope, 
  User,
  TrendingUp,
  DollarSign,
  CreditCard,
  FileText,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Activity,
  BarChart3,
  PieChart,
  LineChart
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
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
  RadialBar
} from 'recharts';
import '../styles/theme.css';

const RoleBasedDashboard = () => {
  const [userRole, setUserRole] = useState('ADMIN');
  const [userCenter, setUserCenter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [screenSize, setScreenSize] = useState('desktop');
  const [dateRange, setDateRange] = useState('month');

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
    // Simulate different user roles for testing
    const roles = ['CORPORATE', 'ACCOUNTANT', 'CENTER_MANAGER', 'DOCTOR', 'STAFF'];
    const randomRole = roles[Math.floor(Math.random() * roles.length)];
    setUserRole(randomRole);
  }, []);

  // Role-based dashboard data
  const getDashboardData = (role) => {
    switch (role) {
      case 'CORPORATE':
        return {
          title: 'Corporate Dashboard',
          subtitle: 'All Centers Overview',
          metrics: {
            totalRevenue: 12456789,
            totalProfit: 3456789,
            totalPatients: 45678,
            totalCenters: 4,
            totalStaff: 567,
            operatingMargin: 27.8,
            bedOccupancy: 78.5,
            collectionRate: 94.3
          },
          charts: {
            revenueByCenter: [
              { name: 'Main Hospital', revenue: 5678901, patients: 12345 },
              { name: 'Diagnostic Center', revenue: 3456789, patients: 8765 },
              { name: 'Clinic Branch', revenue: 1987654, patients: 5432 },
              { name: 'Specialty Center', revenue: 1334445, patients: 19136 }
            ],
            monthlyTrend: [
              { month: 'Jan', revenue: 8900000, profit: 2340000, patients: 35000 },
              { month: 'Feb', revenue: 9200000, profit: 2450000, patients: 37000 },
              { month: 'Mar', revenue: 12456789, profit: 3456789, patients: 45678 }
            ],
            categoryBreakdown: [
              { name: 'Consultations', value: 4567890, percentage: 36.7 },
              { name: 'Diagnostics', value: 3456789, percentage: 27.7 },
              { name: 'Pharmacy', value: 2345678, percentage: 18.8 },
              { name: 'Lab Tests', value: 1234567, percentage: 9.9 },
              { name: 'Other', value: 852965, percentage: 6.9 }
            ]
          }
        };

      case 'ACCOUNTANT':
        return {
          title: 'Financial Dashboard',
          subtitle: 'Financial Overview - All Centers',
          metrics: {
            totalRevenue: 12456789,
            totalExpenses: 9000000,
            netProfit: 3456789,
            totalPayables: 2345678,
            totalReceivables: 3456789,
            cashFlow: 1111111,
            operatingMargin: 27.8,
            collectionRate: 94.3
          },
          charts: {
            revenueExpenses: [
              { month: 'Jan', revenue: 8900000, expenses: 6500000 },
              { month: 'Feb', revenue: 9200000, expenses: 6800000 },
              { month: 'Mar', revenue: 12456789, expenses: 9000000 }
            ],
            payablesReceivables: [
              { type: 'Payables', amount: 2345678, aging: '0-30 days: 45%, 31-60: 30%, 61-90: 15%, 90+: 10%' },
              { type: 'Receivables', amount: 3456789, aging: '0-30 days: 60%, 31-60: 25%, 61-90: 10%, 90+: 5%' }
            ],
            expenseCategories: [
              { name: 'Salaries', value: 4500000, percentage: 50.0 },
              { name: 'Medical Supplies', value: 2250000, percentage: 25.0 },
              { name: 'Equipment', value: 1125000, percentage: 12.5 },
              { name: 'Utilities', value: 562500, percentage: 6.25 },
              { name: 'Other', value: 562500, percentage: 6.25 }
            ]
          }
        };

      case 'CENTER_MANAGER':
        return {
          title: 'Center Dashboard',
          subtitle: 'Main Hospital Overview',
          metrics: {
            totalRevenue: 5678901,
            totalProfit: 1567890,
            totalPatients: 12345,
            totalStaff: 156,
            bedOccupancy: 82.3,
            staffProductivity: 87.2,
            patientSatisfaction: 4.5,
            avgRevenuePerPatient: 460.5
          },
          charts: {
            departmentPerformance: [
              { department: 'General Medicine', revenue: 2345678, patients: 5678 },
              { department: 'Radiology', revenue: 1987654, patients: 3456 },
              { department: 'Cardiology', revenue: 1234567, patients: 2345 },
              { department: 'Laboratory', revenue: 109876, patients: 866 }
            ],
            monthlyTrend: [
              { month: 'Jan', revenue: 4500000, patients: 10000 },
              { month: 'Feb', revenue: 4800000, patients: 11000 },
              { month: 'Mar', revenue: 5678901, patients: 12345 }
            ],
            staffUtilization: [
              { name: 'Doctors', utilized: 45, total: 50, percentage: 90 },
              { name: 'Nurses', utilized: 78, total: 90, percentage: 87 },
              { name: 'Staff', utilized: 28, total: 35, percentage: 80 },
              { name: 'Admin', utilized: 3, total: 4, percentage: 75 }
            ]
          }
        };

      case 'DOCTOR':
        return {
          title: 'Department Dashboard',
          subtitle: 'General Medicine Overview',
          metrics: {
            totalPatients: 5678,
            appointmentsToday: 24,
            completedToday: 18,
            pendingToday: 6,
            avgConsultationTime: 15,
            patientSatisfaction: 4.7,
            revenueThisMonth: 345678,
            followUpRate: 85.2
          },
          charts: {
            patientFlow: [
              { time: '8AM', patients: 2 },
              { time: '9AM', patients: 5 },
              { time: '10AM', patients: 8 },
              { time: '11AM', patients: 6 },
              { time: '12PM', patients: 3 },
              { time: '2PM', patients: 7 },
              { time: '3PM', patients: 4 },
              { time: '4PM', patients: 3 },
              { time: '5PM', patients: 2 }
            ],
            appointmentTypes: [
              { type: 'New Consultation', count: 1234, percentage: 45 },
              { type: 'Follow-up', count: 890, percentage: 32 },
              { type: 'Emergency', count: 234, percentage: 8 },
              { type: 'Review', count: 1320, percentage: 48 }
            ],
            weeklySchedule: [
              { day: 'Mon', appointments: 28, completed: 25 },
              { day: 'Tue', appointments: 32, completed: 30 },
              { day: 'Wed', appointments: 30, completed: 28 },
              { day: 'Thu', appointments: 35, completed: 33 },
              { day: 'Fri', appointments: 24, completed: 22 }
            ]
          }
        };

      case 'STAFF':
        return {
          title: 'Staff Dashboard',
          subtitle: 'Personal Overview',
          metrics: {
            tasksCompleted: 45,
            tasksPending: 8,
            attendanceThisMonth: 22,
            overtimeHours: 12,
            performanceScore: 4.2,
            trainingCompleted: 3,
            pendingApprovals: 2,
            messagesUnread: 5
          },
          charts: {
            taskProgress: [
              { day: 'Mon', completed: 8, pending: 2 },
              { day: 'Tue', completed: 10, pending: 1 },
              { day: 'Wed', completed: 9, pending: 3 },
              { day: 'Thu', completed: 11, pending: 1 },
              { day: 'Fri', completed: 7, pending: 1 }
            ],
            performanceMetrics: [
              { metric: 'Efficiency', score: 85, target: 90 },
              { metric: 'Quality', score: 92, target: 85 },
              { metric: 'Teamwork', score: 88, target: 85 },
              { metric: 'Punctuality', score: 95, target: 90 }
            ]
          }
        };

      default:
        return {
          title: 'Dashboard',
          subtitle: 'Overview',
          metrics: {},
          charts: {}
        };
    }
  };

  const dashboardData = getDashboardData(userRole);

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

  const getRoleIcon = (role) => {
    switch (role) {
      case 'CORPORATE': return Building;
      case 'ACCOUNTANT': return Calculator;
      case 'CENTER_MANAGER': return Briefcase;
      case 'DOCTOR': return Stethoscope;
      case 'STAFF': return User;
      default: return Users;
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'CORPORATE': return 'text-purple-600 bg-purple-100';
      case 'ACCOUNTANT': return 'text-blue-600 bg-blue-100';
      case 'CENTER_MANAGER': return 'text-green-600 bg-green-100';
      case 'DOCTOR': return 'text-red-600 bg-red-100';
      case 'STAFF': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const RoleIcon = getRoleIcon(userRole);

  // Render role-specific metrics
  const renderMetrics = () => {
    const metrics = dashboardData.metrics;
    
    if (userRole === 'CORPORATE') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(metrics.totalRevenue)}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Revenue</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(metrics.totalProfit)}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Profit</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {metrics.totalPatients.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Patients</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {metrics.totalCenters}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Centers</div>
            </div>
          </ResponsiveCard>
        </div>
      );
    }

    if (userRole === 'ACCOUNTANT') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(metrics.totalRevenue)}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Revenue</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(metrics.totalExpenses)}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Expenses</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(metrics.totalPayables)}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Payables</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(metrics.totalReceivables)}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Receivables</div>
            </div>
          </ResponsiveCard>
        </div>
      );
    }

    if (userRole === 'CENTER_MANAGER') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(metrics.totalRevenue)}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Revenue</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(metrics.totalProfit)}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Profit</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {metrics.totalPatients.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Patients</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {formatPercentage(metrics.bedOccupancy)}
              </div>
              <div className="text-sm text-gray-600 mt-1">Bed Occupancy</div>
            </div>
          </ResponsiveCard>
        </div>
      );
    }

    if (userRole === 'DOCTOR') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {metrics.totalPatients.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Patients</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {metrics.appointmentsToday}
              </div>
              <div className="text-sm text-gray-600 mt-1">Appointments Today</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {metrics.completedToday}
              </div>
              <div className="text-sm text-gray-600 mt-1">Completed Today</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {metrics.patientSatisfaction}
              </div>
              <div className="text-sm text-gray-600 mt-1">Satisfaction Score</div>
            </div>
          </ResponsiveCard>
        </div>
      );
    }

    if (userRole === 'STAFF') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {metrics.tasksCompleted}
              </div>
              <div className="text-sm text-gray-600 mt-1">Tasks Completed</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {metrics.tasksPending}
              </div>
              <div className="text-sm text-gray-600 mt-1">Tasks Pending</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {metrics.attendanceThisMonth}
              </div>
              <div className="text-sm text-gray-600 mt-1">Days Present</div>
            </div>
          </ResponsiveCard>
          
          <ResponsiveCard>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {metrics.performanceScore}
              </div>
              <div className="text-sm text-gray-600 mt-1">Performance Score</div>
            </div>
          </ResponsiveCard>
        </div>
      );
    }

    return null;
  };

  // Render role-specific charts
  const renderCharts = () => {
    const charts = dashboardData.charts;

    if (userRole === 'CORPORATE') {
      return (
        <div className="space-y-6">
          {/* Revenue by Center */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Center</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={charts.revenueByCenter}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="revenue" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Category Breakdown */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={charts.categoryBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {charts.categoryBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </ResponsiveCard>
        </div>
      );
    }

    if (userRole === 'ACCOUNTANT') {
      return (
        <div className="space-y-6">
          {/* Revenue vs Expenses */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue vs Expenses</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={charts.revenueExpenses}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" name="Revenue" />
                <Line type="monotone" dataKey="expenses" stroke="#ef4444" name="Expenses" />
              </LineChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Expense Categories */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Categories</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={charts.expenseCategories}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {charts.expenseCategories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </ResponsiveCard>
        </div>
      );
    }

    if (userRole === 'CENTER_MANAGER') {
      return (
        <div className="space-y-6">
          {/* Department Performance */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Department Performance</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={charts.departmentPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="revenue" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Staff Utilization */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Staff Utilization</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="10%" outerRadius="80%" data={charts.staffUtilization}>
                <RadialBar dataKey="percentage" fill="#3b82f6" />
                <Tooltip />
              </RadialBarChart>
            </ResponsiveContainer>
          </ResponsiveCard>
        </div>
      );
    }

    if (userRole === 'DOCTOR') {
      return (
        <div className="space-y-6">
          {/* Patient Flow */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Patient Flow</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={charts.patientFlow}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="patients" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Appointment Types */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Appointment Types</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={charts.appointmentTypes}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {charts.appointmentTypes.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </RechartsPieChart>
            </ResponsiveContainer>
          </ResponsiveCard>
        </div>
      );
    }

    if (userRole === 'STAFF') {
      return (
        <div className="space-y-6">
          {/* Task Progress */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Task Progress</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={charts.taskProgress}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" fill="#10b981" name="Completed" />
                <Bar dataKey="pending" fill="#f59e0b" name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Performance Metrics */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="10%" outerRadius="80%" data={charts.performanceMetrics}>
                <RadialBar dataKey="score" fill="#3b82f6" />
                <Tooltip />
              </RadialBarChart>
            </ResponsiveContainer>
          </ResponsiveCard>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getRoleColor(userRole)}`}>
              <RoleIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{dashboardData.title}</h1>
              <p className="text-gray-600">{dashboardData.subtitle}</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
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
          
          <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <Calendar className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Role-specific Metrics */}
      {renderMetrics()}

      {/* Role-specific Charts */}
      {renderCharts()}

      {/* Quick Actions */}
      <ResponsiveCard>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <FileText className="w-4 h-4 mr-2" />
            Generate Report
          </button>
          
          <button className="flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </button>
          
          <button className="flex items-center justify-center px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </button>
          
          <button className="flex items-center justify-center px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors">
            <Calendar className="w-4 h-4 mr-2" />
            Schedule
          </button>
        </div>
      </ResponsiveCard>
    </div>
  );
};

export default RoleBasedDashboard;
