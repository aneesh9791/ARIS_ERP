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
  BarChart3,
  ChevronLeft,
  ChevronUp,
  MoreHorizontal,
  Sun,
  Moon,
  Maximize2,
  Minimize2
} from 'lucide-react';
import Logo from '../Common/Logo';
import '../styles/theme.css';
import '../styles/responsive.css';

const ResponsiveLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [topbarOpen, setTopbarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [screenSize, setScreenSize] = useState('mobile');
  const [logoConfig, setLogoConfig] = useState({
    type: 'default',
    companyName: 'ARIS Healthcare',
    showTagline: true
  });
  const location = useLocation();
  const navigate = useNavigate();

  // Load logo configuration
  useEffect(() => {
    const savedConfig = localStorage.getItem('logoConfig');
    if (savedConfig) {
      setLogoConfig(JSON.parse(savedConfig));
    }
  }, []);

  // Detect screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
        setSidebarOpen(false);
        setSidebarCollapsed(false);
      } else if (width < 1024) {
        setScreenSize('tablet');
        setSidebarOpen(false);
        setSidebarCollapsed(false);
      } else if (width < 1280) {
        setScreenSize('desktop');
        setSidebarOpen(true);
        setSidebarCollapsed(false);
      } else {
        setScreenSize('large');
        setSidebarOpen(true);
        setSidebarCollapsed(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle sidebar collapse (desktop only)
  const toggleSidebarCollapse = () => {
    if (screenSize === 'desktop' || screenSize === 'large') {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  // Menu items configuration
  const menuItems = [
    {
      name: 'Dashboard',
      icon: Home,
      path: '/dashboard',
      badge: null,
      mobileOnly: false
    },
    {
      name: 'Assets',
      icon: Package,
      children: [
        { name: 'Asset Management', path: '/assets', mobileOnly: false },
        { name: 'Asset Categories', path: '/asset-categories', mobileOnly: false },
        { name: 'Maintenance', path: '/asset-maintenance', mobileOnly: false },
        { name: 'Loaner Assets', path: '/loaner-assets', mobileOnly: false }
      ],
      mobileOnly: false
    },
    {
      name: 'Inventory',
      icon: Database,
      children: [
        { name: 'Expense Items', path: '/expense-items', mobileOnly: false },
        { name: 'Stock Management', path: '/stock', mobileOnly: false },
        { name: 'Purchase Orders', path: '/purchase-orders', mobileOnly: false },
        { name: 'Vendors', path: '/vendors', mobileOnly: false }
      ],
      mobileOnly: false
    },
    {
      name: 'Patients',
      icon: Users,
      children: [
        { name: 'Patient Registration', path: '/patients', mobileOnly: false },
        { name: 'Appointments', path: '/appointments', mobileOnly: false },
        { name: 'Medical Records', path: '/medical-records', mobileOnly: false },
        { name: 'Billing', path: '/billing', mobileOnly: false }
      ],
      mobileOnly: false
    },
    {
      name: 'Financial',
      icon: CreditCard,
      children: [
        { name: 'Chart of Accounts', path: '/chart-of-accounts', mobileOnly: false },
        { name: 'Journal Entries', path: '/journal-entries', mobileOnly: false },
        { name: 'Trial Balance', path: '/trial-balance', mobileOnly: false },
        { name: 'Reports', path: '/financial-reports', mobileOnly: false }
      ],
      mobileOnly: false
    },
    {
      name: 'Centers',
      icon: Building,
      children: [
        { name: 'Center Management', path: '/centers', mobileOnly: false },
        { name: 'Departments', path: '/departments', mobileOnly: false },
        { name: 'Staff Management', path: '/staff', mobileOnly: false }
      ],
      mobileOnly: false
    },
    {
      name: 'Reports',
      icon: BarChart3,
      children: [
        { name: 'Analytics Dashboard', path: '/analytics', mobileOnly: false },
        { name: 'Asset Reports', path: '/asset-reports', mobileOnly: false },
        { name: 'Financial Reports', path: '/financial-reports', mobileOnly: false },
        { name: 'Patient Reports', path: '/patient-reports', mobileOnly: false }
      ],
      mobileOnly: false
    },
    {
      name: 'Settings',
      icon: Settings,
      children: [
        { name: 'System Settings', path: '/settings', mobileOnly: false },
        { name: 'User Management', path: '/users', mobileOnly: false },
        { name: 'Security', path: '/security', mobileOnly: false },
        { name: 'Backup & Restore', path: '/backup', mobileOnly: false }
      ],
      mobileOnly: false
    }
  ];

  // Filter menu items based on screen size
  const filteredMenuItems = menuItems.filter(item => !item.mobileOnly || screenSize === 'mobile');

  // Sample notifications
  const notifications = [
    { id: 1, title: 'Low Stock Alert', message: 'Syringes stock below minimum level', type: 'warning', time: '5 min ago' },
    { id: 2, title: 'Maintenance Due', message: 'MRI Machine maintenance scheduled tomorrow', type: 'info', time: '1 hour ago' },
    { id: 3, title: 'New Patient', message: '5 new patients registered today', type: 'success', time: '2 hours ago' }
  ];

  // Responsive sidebar classes
  const getSidebarClasses = () => {
    let classes = 'fixed inset-y-0 left-0 z-50 bg-white shadow-lg transform transition-all duration-300 ease-in-out';
    
    if (screenSize === 'mobile') {
      classes += sidebarOpen ? ' translate-x-0' : ' -translate-x-full';
      classes += ' w-full';
    } else if (screenSize === 'tablet') {
      classes += sidebarOpen ? ' translate-x-0' : ' -translate-x-full';
      classes += ' w-80';
    } else {
      classes += ' translate-x-0';
      classes += sidebarCollapsed ? ' w-20' : ' w-72';
    }
    
    return classes;
  };

  // Responsive main content classes
  const getMainContentClasses = () => {
    let classes = 'min-h-screen bg-gray-50 transition-all duration-300';
    
    if (screenSize === 'mobile' || screenSize === 'tablet') {
      classes += ' pt-16'; // Account for fixed topbar
    } else {
      classes += sidebarCollapsed ? ' ml-20' : ' ml-72';
    }
    
    return classes;
  };

  // Responsive topbar classes
  const getTopbarClasses = () => {
    let classes = 'fixed top-0 left-0 right-0 bg-white shadow-sm border-b border-gray-200 z-40 transition-all duration-300';
    
    if (screenSize === 'mobile') {
      classes += ' h-14';
    } else if (screenSize === 'tablet') {
      classes += ' h-16';
    } else {
      classes += ' h-16';
      classes += sidebarCollapsed ? ' left-20' : ' left-72';
    }
    
    return classes;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={getSidebarClasses()}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-4 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Logo size="small" variant="header" className="transform" />
            </div>
            {!sidebarCollapsed && (
              <div className="ml-3">
                <h1 className="text-white font-bold text-sm sm:text-base">
                  {logoConfig.companyName}
                </h1>
                {logoConfig.showTagline && (
                  <p className="text-blue-100 text-xs hidden sm:block">Healthcare ERP</p>
                )}
              </div>
            )}
          </div>
          
          {/* Close button for mobile/tablet */}
          {(screenSize === 'mobile' || screenSize === 'tablet') && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-white hover:text-blue-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          
          {/* Collapse button for desktop */}
          {(screenSize === 'desktop' || screenSize === 'large') && (
            <button
              onClick={toggleSidebarCollapse}
              className="text-white hover:text-blue-100 transition-colors"
            >
              {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>
          )}
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {filteredMenuItems.map((item) => (
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
                      ${sidebarCollapsed ? 'justify-center' : ''}
                    `}
                  >
                    <div className={`flex items-center ${sidebarCollapsed ? '' : ''}`}>
                      <item.icon className="w-5 h-5" />
                      {!sidebarCollapsed && <span className="ml-3">{item.name}</span>}
                    </div>
                    {!sidebarCollapsed && (
                      expandedMenus[item.name] ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )
                    )}
                  </button>
                  
                  {expandedMenus[item.name] && !sidebarCollapsed && (
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
                    ${sidebarCollapsed ? 'justify-center' : ''}
                  `}
                >
                  <div className="flex items-center">
                    <item.icon className="w-5 h-5" />
                    {!sidebarCollapsed && <span className="ml-3">{item.name}</span>}
                  </div>
                  {item.badge && !sidebarCollapsed && (
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
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-gray-600" />
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">Admin User</p>
                <p className="text-xs text-gray-500 truncate">admin@arishealthcare.com</p>
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
        )}
      </aside>

      {/* Main Content Wrapper */}
      <div className={getMainContentClasses()}>
        {/* Top Bar */}
        <header className={getTopbarClasses()}>
          <div className="flex items-center justify-between h-full px-4">
            {/* Left side */}
            <div className="flex items-center">
              {/* Mobile menu toggle */}
              {(screenSize === 'mobile' || screenSize === 'tablet') && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="text-gray-500 hover:text-gray-700 transition-colors mr-4"
                >
                  <Menu className="w-6 h-6" />
                </button>
              )}
              
              {/* Logo and Company Name */}
              <div className="flex items-center">
                <Logo size="small" variant="header" />
                {screenSize !== 'mobile' && (
                  <div className="ml-3">
                    <h1 className="text-lg font-bold text-gray-900">
                      {logoConfig.companyName}
                    </h1>
                    {logoConfig.showTagline && (
                      <p className="text-xs text-gray-500">Healthcare ERP</p>
                    )}
                  </div>
                )}
              </div>
              
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className={`
                    pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    ${screenSize === 'mobile' ? 'w-32 sm:w-48' : 
                      screenSize === 'tablet' ? 'w-64' : 
                      screenSize === 'desktop' ? 'w-80' : 'w-96'}
                  `}
                />
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* Theme toggle */}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {isDarkMode ? (
                  <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>

              {/* Fullscreen toggle */}
              <button
                onClick={toggleFullscreen}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors hidden sm:block"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors relative"
                >
                  <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
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

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-200 rounded-full flex items-center justify-center">
                    <User className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                  </div>
                  {!sidebarCollapsed && (
                    <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 ml-1 sm:ml-2" />
                  )}
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
                      <Link
                        to="/settings/logo"
                        className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      >
                        Logo Settings
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
      {sidebarOpen && (screenSize === 'mobile' || screenSize === 'tablet') && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default ResponsiveLayout;
