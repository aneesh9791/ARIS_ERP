import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Menu, 
  X, 
  Home, 
  Users, 
  Package, 
  FileText, 
  Settings, 
  LogOut,
  ChevronDown,
  ChevronRight,
  Bell,
  Search,
  User,
  HelpCircle,
  TrendingUp,
  Building,
  Calendar,
  CreditCard,
  Shield,
  Database,
  BarChart3
} from 'lucide-react';
import '../styles/theme.css';

const ModernLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [topbarOpen, setTopbarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Toggle menu expansion
  const toggleMenu = (menuName) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuName]: !prev[menuName]
    }));
  };

  // Check if menu item is active
  const isActive = (path) => {
    return location.pathname === path;
  };

  // Check if parent menu has active child
  const hasActiveChild = (children) => {
    return children?.some(child => isActive(child.path));
  };

  // Handle theme toggle
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [isDarkMode]);

  // Menu items configuration
  const menuItems = [
    {
      name: 'Dashboard',
      icon: Home,
      path: '/dashboard',
      badge: null
    },
    {
      name: 'Assets',
      icon: Package,
      children: [
        { name: 'Asset Management', path: '/assets' },
        { name: 'Asset Categories', path: '/asset-categories' },
        { name: 'Maintenance', path: '/asset-maintenance' },
        { name: 'Loaner Assets', path: '/loaner-assets' }
      ]
    },
    {
      name: 'Inventory',
      icon: Database,
      children: [
        { name: 'Expense Items', path: '/expense-items' },
        { name: 'Stock Management', path: '/stock' },
        { name: 'Purchase Orders', path: '/purchase-orders' },
        { name: 'Vendors', path: '/vendors' }
      ]
    },
    {
      name: 'Patients',
      icon: Users,
      children: [
        { name: 'Patient Registration', path: '/patients' },
        { name: 'Appointments', path: '/appointments' },
        { name: 'Medical Records', path: '/medical-records' },
        { name: 'Billing', path: '/billing' }
      ]
    },
    {
      name: 'Financial',
      icon: CreditCard,
      children: [
        { name: 'Chart of Accounts', path: '/chart-of-accounts' },
        { name: 'Journal Entries', path: '/journal-entries' },
        { name: 'Trial Balance', path: '/trial-balance' },
        { name: 'Reports', path: '/financial-reports' }
      ]
    },
    {
      name: 'Centers',
      icon: Building,
      children: [
        { name: 'Center Management', path: '/centers' },
        { name: 'Departments', path: '/departments' },
        { name: 'Staff Management', path: '/staff' }
      ]
    },
    {
      name: 'Reports',
      icon: BarChart3,
      children: [
        { name: 'Analytics Dashboard', path: '/analytics' },
        { name: 'Asset Reports', path: '/asset-reports' },
        { name: 'Financial Reports', path: '/financial-reports' },
        { name: 'Patient Reports', path: '/patient-reports' }
      ]
    },
    {
      name: 'Settings',
      icon: Settings,
      children: [
        { name: 'System Settings', path: '/settings' },
        { name: 'User Management', path: '/users' },
        { name: 'Security', path: '/security' },
        { name: 'Backup & Restore', path: '/backup' }
      ]
    }
  ];

  // Sample notifications
  const notifications = [
    { id: 1, title: 'Low Stock Alert', message: 'Syringes stock below minimum level', type: 'warning', time: '5 min ago' },
    { id: 2, title: 'Maintenance Due', message: 'MRI Machine maintenance scheduled tomorrow', type: 'info', time: '1 hour ago' },
    { id: 3, title: 'New Patient', message: '5 new patients registered today', type: 'success', time: '2 hours ago' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:inset-0
      `}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-6 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-bold text-xl">ARIS</span>
              </div>
            </div>
            <div className="ml-3">
              <h1 className="text-white font-bold text-lg">ARIS ERP</h1>
              <p className="text-blue-100 text-xs">Healthcare Management</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white hover:text-blue-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {menuItems.map((item) => (
            <div key={item.name}>
              {item.children ? (
                <div>
                  <button
                    onClick={() => toggleMenu(item.name)}
                    className={`
                      w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors
                      ${hasActiveChild(item.children) 
                        ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600' 
                        : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    <div className="flex items-center">
                      <item.icon className="w-5 h-5 mr-3" />
                      <span>{item.name}</span>
                    </div>
                    {expandedMenus[item.name] ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  
                  {expandedMenus[item.name] && (
                    <div className="mt-1 ml-4 space-y-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.path}
                          to={child.path}
                          className={`
                            block px-3 py-2 text-sm rounded-lg transition-colors
                            ${isActive(child.path)
                              ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }
                          `}
                        >
                          {child.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to={item.path}
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                    ${isActive(item.path)
                      ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  <span>{item.name}</span>
                  {item.badge && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-gray-600" />
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900">Admin User</p>
              <p className="text-xs text-gray-500">admin@arishealthcare.com</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="mt-3 w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Bar */}
        <header className={`
          bg-white shadow-sm border-b border-gray-200 transition-all duration-300
          ${topbarOpen ? 'h-16' : 'h-12'}
        `}>
          <div className="flex items-center justify-between h-full px-4 sm:px-6 lg:px-8">
            {/* Left side */}
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
              
              <div className="ml-4 flex-1 max-w-lg">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search patients, assets, reports..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-4">
              {/* Theme Toggle */}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {isDarkMode ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors relative"
                >
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                </button>
                
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.map((notification) => (
                        <div key={notification.id} className="p-4 border-b border-gray-100 hover:bg-gray-50">
                          <div className="flex items-start">
                            <div className={`w-2 h-2 rounded-full mt-2 mr-3 ${
                              notification.type === 'warning' ? 'bg-yellow-500' :
                              notification.type === 'error' ? 'bg-red-500' :
                              notification.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                            }`}></div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                              <p className="text-xs text-gray-500 mt-1">{notification.message}</p>
                              <p className="text-xs text-gray-400 mt-1">{notification.time}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 border-t border-gray-200">
                      <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                        View all notifications
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-600" />
                  </div>
                  <ChevronDown className="w-4 h-4 ml-2" />
                </button>
                
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-2">
                      <Link
                        to="/profile"
                        className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      >
                        Profile
                      </Link>
                      <Link
                        to="/settings"
                        className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      >
                        Settings
                      </Link>
                      <button className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
                        Help
                      </button>
                      <hr className="my-2 border-gray-200" />
                      <button className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors">
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default ModernLayout;
