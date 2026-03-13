import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Edit, 
  Trash2, 
  Eye,
  User,
  Shield,
  Database,
  Bell,
  Globe,
  Lock,
  Key,
  Monitor,
  Smartphone,
  Moon,
  Sun,
  CheckCircle,
  AlertTriangle,
  Clock,
  Save,
  Upload,
  DownloadCloud,
  Wifi
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveTable from '../Common/ResponsiveTable';
import ResponsiveForm from '../Common/ResponsiveForm';
import '../styles/theme.css';

const Settings = () => {
  const [users, setUsers] = useState([]);
  const [systemSettings, setSystemSettings] = useState({});
  const [securitySettings, setSecuritySettings] = useState({});
  const [backupSettings, setBackupSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [screenSize, setScreenSize] = useState('desktop');
  const [viewMode, setViewMode] = useState('table');
  const [activeTab, setActiveTab] = useState('system');
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Detect screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
        setViewMode('cards');
      } else if (width < 1024) {
        setScreenSize('tablet');
        setViewMode('table');
      } else {
        setScreenSize('desktop');
        setViewMode('table');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mock API calls - replace with real APIs
  useEffect(() => {
    fetchUsers();
    fetchSystemSettings();
    fetchSecuritySettings();
    fetchBackupSettings();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockUsers = [
        {
          id: 1,
          username: 'admin',
          email: 'admin@arishealthcare.com',
          firstName: 'System',
          lastName: 'Administrator',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          centerId: null,
          centerName: 'All Centers',
          departmentId: null,
          departmentName: 'Administration',
          lastLogin: '2024-03-15 09:30:00',
          loginCount: 1250,
          createdDate: '2023-01-01',
          lastModified: '2024-03-15',
          permissions: ['ALL'],
          twoFactorEnabled: true,
          passwordExpiryDate: '2024-06-15',
          sessionTimeout: 30,
          allowedIPs: ['192.168.1.0/24', '10.0.0.0/8'],
          notes: 'System administrator with full access'
        },
        {
          id: 2,
          username: 'jsmith',
          email: 'john.smith@hospital.com',
          firstName: 'John',
          lastName: 'Smith',
          role: 'DOCTOR',
          status: 'ACTIVE',
          centerId: 1,
          centerName: 'Main Hospital',
          departmentId: 1,
          departmentName: 'General Medicine',
          lastLogin: '2024-03-15 08:15:00',
          loginCount: 450,
          createdDate: '2023-01-15',
          lastModified: '2024-03-10',
          permissions: ['PATIENT_VIEW', 'PATIENT_EDIT', 'APPOINTMENT_MANAGE'],
          twoFactorEnabled: false,
          passwordExpiryDate: '2024-05-15',
          sessionTimeout: 15,
          allowedIPs: ['192.168.1.0/24'],
          notes: 'Senior doctor in general medicine'
        },
        {
          id: 3,
          username: 'jdoe',
          email: 'jane.doe@hospital.com',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'NURSE',
          status: 'ACTIVE',
          centerId: 1,
          centerName: 'Main Hospital',
          departmentId: 1,
          departmentName: 'General Medicine',
          lastLogin: '2024-03-15 07:45:00',
          loginCount: 320,
          createdDate: '2023-02-20',
          lastModified: '2024-03-12',
          permissions: ['PATIENT_VIEW', 'APPOINTMENT_VIEW'],
          twoFactorEnabled: false,
          passwordExpiryDate: '2024-04-20',
          sessionTimeout: 10,
          allowedIPs: ['192.168.1.0/24'],
          notes: 'Head nurse in general medicine'
        },
        {
          id: 4,
          username: 'rjohnson',
          email: 'robert.johnson@hospital.com',
          firstName: 'Robert',
          lastName: 'Johnson',
          role: 'MANAGER',
          status: 'ACTIVE',
          centerId: 2,
          centerName: 'Diagnostic Center',
          departmentId: null,
          departmentName: 'Management',
          lastLogin: '2024-03-14 16:30:00',
          loginCount: 280,
          createdDate: '2023-03-10',
          lastModified: '2024-03-08',
          permissions: ['USER_MANAGE', 'REPORT_VIEW', 'INVENTORY_MANAGE'],
          twoFactorEnabled: true,
          passwordExpiryDate: '2024-06-10',
          sessionTimeout: 20,
          allowedIPs: ['10.0.0.0/8'],
          notes: 'Diagnostic center manager'
        },
        {
          id: 5,
          username: 'mbrown',
          email: 'mary.brown@hospital.com',
          firstName: 'Mary',
          lastName: 'Brown',
          role: 'RECEPTIONIST',
          status: 'ACTIVE',
          centerId: 1,
          centerName: 'Main Hospital',
          departmentId: null,
          departmentName: 'Front Office',
          lastLogin: '2024-03-15 08:00:00',
          loginCount: 180,
          createdDate: '2023-04-15',
          lastModified: '2024-03-05',
          permissions: ['PATIENT_VIEW', 'APPOINTMENT_CREATE'],
          twoFactorEnabled: false,
          passwordExpiryDate: '2024-04-15',
          sessionTimeout: 8,
          allowedIPs: ['192.168.1.0/24'],
          notes: 'Front office receptionist'
        }
      ];
      
      setUsers(mockUsers);
    } catch (err) {
      setError('Failed to fetch users');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemSettings = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockSystemSettings = {
        systemName: 'ARIS ERP',
        systemVersion: '1.0.0',
        organizationName: 'ARIS Healthcare',
        logoUrl: '/assets/logo.png',
        timezone: 'Asia/Kolkata',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
        language: 'en',
        currency: 'INR',
        currencySymbol: '₹',
        decimalPlaces: 2,
        thousandSeparator: ',',
        notificationEmail: 'admin@arishealthcare.com',
        backupEmail: 'backup@arishealthcare.com',
        maintenanceMode: false,
        debugMode: false,
        apiRateLimit: 100,
        sessionTimeout: 30,
        maxFileSize: 10485760,
        allowedFileTypes: ['pdf', 'doc', 'docx', 'jpg', 'png', 'xlsx'],
        theme: 'light',
        primaryColor: '#3b82f6',
        secondaryColor: '#22c55e',
        accentColor: '#a855f7',
        lastUpdated: '2024-03-15 10:30:00',
        updatedBy: 'admin'
      };
      
      setSystemSettings(mockSystemSettings);
    } catch (err) {
      console.error('Error fetching system settings:', err);
    }
  };

  const fetchSecuritySettings = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockSecuritySettings = {
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          preventCommonPasswords: true,
          maxLoginAttempts: 5,
          lockoutDuration: 30,
          passwordExpiryDays: 90,
          passwordHistory: 5
        },
        sessionPolicy: {
          sessionTimeout: 30,
          maxConcurrentSessions: 3,
          requireReauth: false,
          idleTimeout: 15,
          rememberMeDuration: 7
        },
        twoFactorAuth: {
          enabled: true,
          requiredForRoles: ['SUPER_ADMIN', 'MANAGER'],
          methods: ['email', 'sms'],
          issuer: 'ARIS ERP',
          secretLength: 6
        },
        ipRestrictions: {
          enabled: true,
          allowedIPs: ['192.168.1.0/24', '10.0.0.0/8'],
          blockedIPs: [],
          vpnRequired: false,
          geoRestrictions: false
        },
        auditLog: {
          enabled: true,
          retentionDays: 365,
          logLevel: 'INFO',
          includeSensitiveData: false
        },
        encryption: {
          dataAtRest: true,
          dataInTransit: true,
          algorithm: 'AES-256',
          keyRotation: 'quarterly'
        },
        lastUpdated: '2024-03-15 10:30:00',
        updatedBy: 'admin'
      };
      
      setSecuritySettings(mockSecuritySettings);
    } catch (err) {
      console.error('Error fetching security settings:', err);
    }
  };

  const fetchBackupSettings = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockBackupSettings = {
        automaticBackup: {
          enabled: true,
          frequency: 'daily',
          time: '02:00',
          retentionDays: 30,
          compressionEnabled: true,
          encryptionEnabled: true
        },
        backupLocations: [
          {
            type: 'local',
            path: '/backups/local',
            enabled: true,
            description: 'Local backup storage'
          },
          {
            type: 'cloud',
            provider: 'AWS S3',
            bucket: 'aris-erp-backups',
            enabled: true,
            description: 'Cloud backup storage'
          }
        ],
        backupContent: {
          database: true,
          files: true,
          logs: false,
          settings: true,
          userPreferences: true
        },
        restoreSettings: {
          allowRestore: true,
          requireConfirmation: true,
          createBackupBeforeRestore: true,
          notifyOnRestore: true
        },
        lastBackup: {
          date: '2024-03-15 02:00:00',
          size: '2.5 GB',
          duration: '15 minutes',
          status: 'SUCCESS',
          location: 'Local + Cloud'
        },
        lastUpdated: '2024-03-15 10:30:00',
        updatedBy: 'admin'
      };
      
      setBackupSettings(mockBackupSettings);
    } catch (err) {
      console.error('Error fetching backup settings:', err);
    }
  };

  const handleAddUser = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newUser = {
        id: users.length + 1,
        ...formData,
        status: 'ACTIVE',
        loginCount: 0,
        createdDate: new Date().toISOString().split('T')[0],
        lastModified: new Date().toISOString().split('T')[0],
        lastLogin: null
      };
      
      setUsers([...users, newUser]);
      setShowAddModal(false);
      alert('User added successfully!');
    } catch (err) {
      console.error('Error adding user:', err);
      alert('Failed to add user');
    }
  };

  const handleEditUser = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setUsers(users.map(user => 
        user.id === editingItem.id 
          ? { ...user, ...formData, lastModified: new Date().toISOString().split('T')[0] }
          : user
      ));
      setShowEditModal(false);
      setEditingItem(null);
      alert('User updated successfully!');
    } catch (err) {
      console.error('Error updating user:', err);
      alert('Failed to update user');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) {
      return;
    }
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setUsers(users.filter(user => user.id !== userId));
      alert('User deleted successfully!');
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Failed to delete user');
    }
  };

  const handleSystemSettingsSave = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSystemSettings({
        ...systemSettings,
        ...formData,
        lastUpdated: new Date().toISOString().slice(0, 19).replace('T', ' '),
        updatedBy: 'admin'
      });
      alert('System settings saved successfully!');
    } catch (err) {
      console.error('Error saving system settings:', err);
      alert('Failed to save system settings');
    }
  };

  const handleSecuritySettingsSave = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSecuritySettings({
        ...securitySettings,
        ...formData,
        lastUpdated: new Date().toISOString().slice(0, 19).replace('T', ' '),
        updatedBy: 'admin'
      });
      alert('Security settings saved successfully!');
    } catch (err) {
      console.error('Error saving security settings:', err);
      alert('Failed to save security settings');
    }
  };

  const handleBackupSettingsSave = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setBackupSettings({
        ...backupSettings,
        ...formData,
        lastUpdated: new Date().toISOString().slice(0, 19).replace('T', ' '),
        updatedBy: 'admin'
      });
      alert('Backup settings saved successfully!');
    } catch (err) {
      console.error('Error saving backup settings:', err);
      alert('Failed to save backup settings');
    }
  };

  const handleBackupNow = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      alert('Backup completed successfully!');
    } catch (err) {
      console.error('Error performing backup:', err);
      alert('Failed to perform backup');
    }
  };

  const handleRestore = async () => {
    if (!confirm('Are you sure you want to restore from backup? This action cannot be undone.')) {
      return;
    }
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      alert('Restore completed successfully!');
    } catch (err) {
      console.error('Error performing restore:', err);
      alert('Failed to perform restore');
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'text-red-600 bg-red-100';
      case 'ADMIN': return 'text-orange-600 bg-orange-100';
      case 'MANAGER': return 'text-purple-600 bg-purple-100';
      case 'DOCTOR': return 'text-blue-600 bg-blue-100';
      case 'NURSE': return 'text-green-600 bg-green-100';
      case 'RECEPTIONIST': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-600 bg-green-100';
      case 'INACTIVE': return 'text-gray-600 bg-gray-100';
      case 'SUSPENDED': return 'text-red-600 bg-red-100';
      case 'LOCKED': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Users table columns
  const userColumns = [
    {
      key: 'username',
      title: 'Username',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'firstName',
      title: 'Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{value} {row.lastName}</div>
          <div className="text-sm text-gray-500">{row.email}</div>
        </div>
      )
    },
    {
      key: 'role',
      title: 'Role',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleColor(value)}`}>
          {value}
        </span>
      )
    },
    {
      key: 'centerName',
      title: 'Center',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value}</div>
          <div className="text-sm text-gray-500">{row.departmentName}</div>
        </div>
      )
    },
    {
      key: 'lastLogin',
      title: 'Last Login',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value || 'Never'}</div>
          <div className="text-sm text-gray-500">{row.loginCount} logins</div>
        </div>
      )
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(value)}`}>
          {value}
        </span>
      )
    },
    {
      key: 'twoFactorEnabled',
      title: '2FA',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
          value ? 'text-green-600 bg-green-100' : 'text-gray-600 bg-gray-100'
        }`}>
          {value ? 'Enabled' : 'Disabled'}
        </span>
      )
    }
  ];

  // Form fields for users
  const userFormFields = [
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      placeholder: 'Enter username'
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      placeholder: 'Enter email address'
    },
    {
      name: 'firstName',
      label: 'First Name',
      type: 'text',
      required: true,
      placeholder: 'Enter first name'
    },
    {
      name: 'lastName',
      label: 'Last Name',
      type: 'text',
      required: true,
      placeholder: 'Enter last name'
    },
    {
      name: 'role',
      label: 'Role',
      type: 'select',
      required: true,
      options: [
        { value: 'SUPER_ADMIN', label: 'Super Admin' },
        { value: 'ADMIN', label: 'Admin' },
        { value: 'MANAGER', label: 'Manager' },
        { value: 'DOCTOR', label: 'Doctor' },
        { value: 'NURSE', label: 'Nurse' },
        { value: 'RECEPTIONIST', label: 'Receptionist' }
      ]
    },
    {
      name: 'centerId',
      label: 'Center',
      type: 'select',
      required: true,
      options: [
        { value: 1, label: 'Main Hospital' },
        { value: 2, label: 'Diagnostic Center' },
        { value: 3, label: 'Clinic Branch' },
        { value: 4, label: 'Specialty Center' }
      ]
    },
    {
      name: 'departmentId',
      label: 'Department',
      type: 'select',
      options: [
        { value: 1, label: 'General Medicine' },
        { value: 2, label: 'Radiology' },
        { value: 3, label: 'Cardiology' },
        { value: 4, label: 'Laboratory' }
      ]
    },
    {
      name: 'permissions',
      label: 'Permissions',
      type: 'select',
      multiple: true,
      options: [
        { value: 'PATIENT_VIEW', label: 'View Patients' },
        { value: 'PATIENT_EDIT', label: 'Edit Patients' },
        { value: 'APPOINTMENT_VIEW', label: 'View Appointments' },
        { value: 'APPOINTMENT_MANAGE', label: 'Manage Appointments' },
        { value: 'USER_MANAGE', label: 'Manage Users' },
        { value: 'REPORT_VIEW', label: 'View Reports' },
        { value: 'INVENTORY_MANAGE', label: 'Manage Inventory' }
      ]
    },
    {
      name: 'twoFactorEnabled',
      label: 'Enable Two-Factor Authentication',
      type: 'checkbox'
    },
    {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      placeholder: 'Enter notes'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage system settings, users, security, and backup</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('system')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'system'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            System Settings
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'security'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Security
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'backup'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Backup & Restore
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'system' && (
        <div className="space-y-6">
          <ResponsiveCard>
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">System Configuration</h2>
              <ResponsiveForm
                fields={[
                  {
                    name: 'systemName',
                    label: 'System Name',
                    type: 'text',
                    required: true,
                    defaultValue: systemSettings.systemName
                  },
                  {
                    name: 'organizationName',
                    label: 'Organization Name',
                    type: 'text',
                    required: true,
                    defaultValue: systemSettings.organizationName
                  },
                  {
                    name: 'timezone',
                    label: 'Timezone',
                    type: 'select',
                    required: true,
                    defaultValue: systemSettings.timezone,
                    options: [
                      { value: 'Asia/Kolkata', label: 'Asia/Kolkata' },
                      { value: 'Asia/Dubai', label: 'Asia/Dubai' },
                      { value: 'UTC', label: 'UTC' }
                    ]
                  },
                  {
                    name: 'dateFormat',
                    label: 'Date Format',
                    type: 'select',
                    required: true,
                    defaultValue: systemSettings.dateFormat,
                    options: [
                      { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                      { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                      { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
                    ]
                  },
                  {
                    name: 'currency',
                    label: 'Currency',
                    type: 'select',
                    required: true,
                    defaultValue: systemSettings.currency,
                    options: [
                      { value: 'INR', label: 'Indian Rupee (₹)' },
                      { value: 'USD', label: 'US Dollar ($)' },
                      { value: 'EUR', label: 'Euro (€)' }
                    ]
                  },
                  {
                    name: 'language',
                    label: 'Language',
                    type: 'select',
                    required: true,
                    defaultValue: systemSettings.language,
                    options: [
                      { value: 'en', label: 'English' },
                      { value: 'hi', label: 'Hindi' },
                      { value: 'ml', label: 'Malayalam' }
                    ]
                  },
                  {
                    name: 'notificationEmail',
                    label: 'Notification Email',
                    type: 'email',
                    required: true,
                    defaultValue: systemSettings.notificationEmail
                  },
                  {
                    name: 'sessionTimeout',
                    label: 'Session Timeout (minutes)',
                    type: 'number',
                    required: true,
                    defaultValue: systemSettings.sessionTimeout
                  }
                ]}
                onSubmit={handleSystemSettingsSave}
                submitText="Save Settings"
                layout="responsive"
              />
            </div>
          </ResponsiveCard>
        </div>
      )}

      {activeTab === 'users' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={users}
            columns={userColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={true}
            onSelectionChange={setSelectedItems}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchUsers}
          />
        </ResponsiveCard>
      )}

      {activeTab === 'security' && (
        <div className="space-y-6">
          <ResponsiveCard>
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Security Settings</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-700 mb-4">Password Policy</h3>
                  <ResponsiveForm
                    fields={[
                      {
                        name: 'minLength',
                        label: 'Minimum Password Length',
                        type: 'number',
                        defaultValue: securitySettings.passwordPolicy?.minLength
                      },
                      {
                        name: 'requireUppercase',
                        label: 'Require Uppercase Letters',
                        type: 'checkbox',
                        defaultValue: securitySettings.passwordPolicy?.requireUppercase
                      },
                      {
                        name: 'requireLowercase',
                        label: 'Require Lowercase Letters',
                        type: 'checkbox',
                        defaultValue: securitySettings.passwordPolicy?.requireLowercase
                      },
                      {
                        name: 'requireNumbers',
                        label: 'Require Numbers',
                        type: 'checkbox',
                        defaultValue: securitySettings.passwordPolicy?.requireNumbers
                      },
                      {
                        name: 'requireSpecialChars',
                        label: 'Require Special Characters',
                        type: 'checkbox',
                        defaultValue: securitySettings.passwordPolicy?.requireSpecialChars
                      },
                      {
                        name: 'passwordExpiryDays',
                        label: 'Password Expiry (days)',
                        type: 'number',
                        defaultValue: securitySettings.passwordPolicy?.passwordExpiryDays
                      }
                    ]}
                    onSubmit={handleSecuritySettingsSave}
                    submitText="Save Security Settings"
                    layout="responsive"
                  />
                </div>
              </div>
            </div>
          </ResponsiveCard>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="space-y-6">
          <ResponsiveCard>
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Backup Configuration</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-700 mb-4">Automatic Backup</h3>
                  <ResponsiveForm
                    fields={[
                      {
                        name: 'enabled',
                        label: 'Enable Automatic Backup',
                        type: 'checkbox',
                        defaultValue: backupSettings.automaticBackup?.enabled
                      },
                      {
                        name: 'frequency',
                        label: 'Backup Frequency',
                        type: 'select',
                        defaultValue: backupSettings.automaticBackup?.frequency,
                        options: [
                          { value: 'daily', label: 'Daily' },
                          { value: 'weekly', label: 'Weekly' },
                          { value: 'monthly', label: 'Monthly' }
                        ]
                      },
                      {
                        name: 'time',
                        label: 'Backup Time',
                        type: 'text',
                        defaultValue: backupSettings.automaticBackup?.time
                      },
                      {
                        name: 'retentionDays',
                        label: 'Retention Days',
                        type: 'number',
                        defaultValue: backupSettings.automaticBackup?.retentionDays
                      }
                    ]}
                    onSubmit={handleBackupSettingsSave}
                    submitText="Save Backup Settings"
                    layout="responsive"
                  />
                </div>
                
                <div className="flex space-x-4">
                  <button
                    onClick={handleBackupNow}
                    className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Backup Now
                  </button>
                  <button
                    onClick={handleRestore}
                    className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <DownloadCloud className="w-4 h-4 mr-2" />
                    Restore
                  </button>
                </div>
              </div>
            </div>
          </ResponsiveCard>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Add New User</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={userFormFields}
                onSubmit={handleAddUser}
                onCancel={() => setShowAddModal(false)}
                submitText="Add User"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Edit User</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={userFormFields}
                initialValues={editingItem}
                onSubmit={handleEditUser}
                onCancel={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
                submitText="Update User"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
