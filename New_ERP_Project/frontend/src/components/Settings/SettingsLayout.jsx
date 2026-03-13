import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Settings, 
  User, 
  Shield, 
  Database, 
  Bell, 
  Palette, 
  Globe, 
  CreditCard, 
  FileText, 
  HelpCircle,
  ChevronRight,
  Building,
  Image,
  Lock,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  BarChart3
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import '../styles/theme.css';

const SettingsLayout = ({ children }) => {
  const location = useLocation();
  const [activeSection, setActiveSection] = useState('general');

  const settingsSections = [
    {
      id: 'general',
      name: 'General Settings',
      icon: Settings,
      description: 'Basic system configuration',
      path: '/settings',
      items: [
        { id: 'company', name: 'Company Information', icon: Building, path: '/settings/company' },
        { id: 'logo', name: 'Logo Settings', icon: Image, path: '/settings/logo' },
        { id: 'timezone', name: 'Time & Date', icon: Clock, path: '/settings/timezone' },
        { id: 'language', name: 'Language & Region', icon: Globe, path: '/settings/language' }
      ]
    },
    {
      id: 'users',
      name: 'User Management',
      icon: User,
      description: 'User accounts and permissions',
      path: '/settings/users',
      items: [
        { id: 'users', name: 'User Accounts', icon: User, path: '/settings/users' },
        { id: 'roles', name: 'Roles & Permissions', icon: Shield, path: '/settings/roles' },
        { id: 'teams', name: 'Teams & Departments', icon: Building, path: '/settings/teams' }
      ]
    },
    {
      id: 'security',
      name: 'Security',
      icon: Shield,
      description: 'Security and authentication',
      path: '/settings/security',
      items: [
        { id: 'password', name: 'Password Policy', icon: Lock, path: '/settings/password' },
        { id: '2fa', name: 'Two-Factor Auth', icon: Shield, path: '/settings/2fa' },
        { id: 'audit', name: 'Audit Logs', icon: FileText, path: '/settings/audit' }
      ]
    },
    {
      id: 'notifications',
      name: 'Notifications',
      icon: Bell,
      description: 'Email and in-app notifications',
      path: '/settings/notifications',
      items: [
        { id: 'email', name: 'Email Settings', icon: Mail, path: '/settings/email' },
        { id: 'sms', name: 'SMS Settings', icon: Phone, path: '/settings/sms' },
        { id: 'alerts', name: 'System Alerts', icon: Bell, path: '/settings/alerts' }
      ]
    },
    {
      id: 'appearance',
      name: 'Appearance',
      icon: Palette,
      description: 'Customize look and feel',
      path: '/settings/appearance',
      items: [
        { id: 'theme', name: 'Theme Settings', icon: Palette, path: '/settings/theme' },
        { id: 'branding', name: 'Branding', icon: Image, path: '/settings/branding' },
        { id: 'layout', name: 'Layout Options', icon: Database, path: '/settings/layout' }
      ]
    },
    {
      id: 'integrations',
      name: 'Integrations',
      icon: Database,
      description: 'Third-party integrations',
      path: '/settings/integrations',
      items: [
        { id: 'payment', name: 'Payment Gateways', icon: CreditCard, path: '/settings/payment' },
        { id: 'api', name: 'API Settings', icon: Database, path: '/settings/api' },
        { id: 'backup', name: 'Backup & Sync', icon: Database, path: '/settings/backup' }
      ]
    },
    {
      id: 'reports',
      name: 'Reports & Analytics',
      icon: BarChart3,
      description: 'Reporting configuration',
      path: '/settings/reports',
      items: [
        { id: 'analytics', name: 'Analytics Settings', icon: BarChart3, path: '/settings/analytics' },
        { id: 'exports', name: 'Export Settings', icon: FileText, path: '/settings/exports' },
        { id: 'scheduling', name: 'Report Scheduling', icon: Calendar, path: '/settings/scheduling' }
      ]
    },
    {
      id: 'support',
      name: 'Help & Support',
      icon: HelpCircle,
      description: 'Get help and support',
      path: '/settings/support',
      items: [
        { id: 'help', name: 'Help Center', icon: HelpCircle, path: '/settings/help' },
        { id: 'contact', name: 'Contact Support', icon: Mail, path: '/settings/contact' },
        { id: 'about', name: 'About', icon: FileText, path: '/settings/about' }
      ]
    }
  ];

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const getActiveSection = () => {
    const currentPath = location.pathname;
    for (const section of settingsSections) {
      if (isActive(section.path)) {
        return section.id;
      }
      for (const item of section.items) {
        if (isActive(item.path)) {
          return section.id;
        }
      }
    }
    return 'general';
  };

  const currentSection = getActiveSection();

  const renderSidebar = () => (
    <div className="w-full lg:w-80 space-y-6">
      {/* Main Sections */}
      <div className="space-y-2">
        {settingsSections.map((section) => (
          <div key={section.id}>
            <Link
              to={section.path}
              onClick={() => setActiveSection(section.id)}
              className={`
                flex items-center justify-between p-3 rounded-lg transition-colors
                ${currentSection === section.id 
                  ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600' 
                  : 'text-gray-700 hover:bg-gray-100'
                }
              `}
            >
              <div className="flex items-center space-x-3">
                <section.icon className="w-5 h-5" />
                <div>
                  <p className="font-medium">{section.name}</p>
                  <p className="text-xs text-gray-500">{section.description}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4" />
            </Link>

            {/* Sub-items when section is active */}
            {currentSection === section.id && (
              <div className="ml-8 mt-2 space-y-1">
                {section.items.map((item) => (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`
                      flex items-center space-x-2 p-2 rounded-lg transition-colors
                      ${isActive(item.path)
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50'
                      }
                    `}
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="text-sm">{item.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <ResponsiveCard>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
        <div className="space-y-2">
          <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Export Settings
          </button>
          <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Reset to Defaults
          </button>
          <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            System Health Check
          </button>
        </div>
      </ResponsiveCard>
    </div>
  );

  const renderBreadcrumbs = () => {
    const currentPath = location.pathname;
    const breadcrumbs = [];

    // Find current section and item
    for (const section of settingsSections) {
      if (isActive(section.path)) {
        breadcrumbs.push({ name: section.name, path: section.path });
        
        // Find current item
        for (const item of section.items) {
          if (isActive(item.path)) {
            breadcrumbs.push({ name: item.name, path: item.path });
            break;
          }
        }
        break;
      }
    }

    return (
      <nav className="flex items-center space-x-2 text-sm text-gray-500">
        <Link to="/dashboard" className="hover:text-gray-700">Dashboard</Link>
        <span>/</span>
        <Link to="/settings" className="hover:text-gray-700">Settings</Link>
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.path}>
            <span>/</span>
            {index === breadcrumbs.length - 1 ? (
              <span className="text-gray-900">{crumb.name}</span>
            ) : (
              <Link to={crumb.path} className="hover:text-gray-700">{crumb.name}</Link>
            )}
          </React.Fragment>
        ))}
      </nav>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
              {renderBreadcrumbs()}
            </div>
            
            {/* Search Bar */}
            <div className="hidden md:block relative max-w-md">
              <input
                type="text"
                placeholder="Search settings..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col lg:flex-row">
        {/* Sidebar */}
        <div className="lg:hidden">
          {/* Mobile Navigation */}
          <div className="bg-white border-b border-gray-200 px-4 py-3">
            <select
              value={currentSection}
              onChange={(e) => {
                const section = settingsSections.find(s => s.id === e.target.value);
                if (section) {
                  window.location.href = section.path;
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {settingsSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <div className="w-80 bg-white border-r border-gray-200 min-h-screen p-4">
            {renderSidebar()}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-4 lg:p-8">
          {children}
        </div>
      </div>
    </div>
  );
};

export default SettingsLayout;
