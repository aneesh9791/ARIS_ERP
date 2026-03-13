import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  Bell, 
  Calendar, 
  FileText, 
  TrendingUp, 
  Settings, 
  Users, 
  Target, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Info,
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  Download,
  RefreshCw,
  Smartphone,
  Megaphone,
  Mail,
  Phone,
  DollarSign,
  Activity
} from 'lucide-react';

interface WhatsAppNotification {
  id: number;
  patient_id: number;
  patient_name: string;
  entity_id: number;
  notification_type: string;
  message: string;
  status: string;
  message_id: string;
  error_message: string;
  sent_at: string;
}

interface WhatsAppPromotion {
  id: number;
  title: string;
  message: string;
  discount_percentage: number;
  valid_from: string;
  valid_to: string;
  service_types: string[];
  target_audience: string;
  status: string;
  created_at: string;
}

interface WhatsAppTemplate {
  id: number;
  template_name: string;
  template_type: string;
  message_template: string;
  variables: string[];
  status: string;
  whatsapp_template_id: string;
}

interface NotificationStats {
  notification_type: string;
  total_sent: number;
  successful: number;
  failed: number;
  success_rate: number;
  notification_date: string;
}

const WhatsAppIntegration: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'notifications' | 'promotions' | 'templates' | 'settings' | 'stats'>('notifications');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data states
  const [notifications, setNotifications] = useState<WhatsAppNotification[]>([]);
  const [promotions, setPromotions] = useState<WhatsAppPromotion[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [stats, setStats] = useState<NotificationStats[]>([]);

  // Modal states
  const [showSendModal, setShowSendModal] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Form states
  const [sendForm, setSendForm] = useState({
    notification_type: 'BILL_NOTIFICATION',
    patient_id: '',
    entity_id: '',
    custom_message: ''
  });

  const [promotionForm, setPromotionForm] = useState({
    title: '',
    message: '',
    discount_percentage: 0,
    valid_from: '',
    valid_to: '',
    service_types: [],
    target_audience: 'all'
  });

  const [templateForm, setTemplateForm] = useState({
    template_name: '',
    template_type: 'BILL_NOTIFICATION',
    message_template: '',
    variables: []
  });

  // Filter states
  const [notificationFilter, setNotificationFilter] = useState({
    type: '',
    status: '',
    date_range: '7'
  });

  // Fetch notifications
  const fetchNotifications = async () => {
    setLoading(true);
    try {
      // This would be implemented when backend is ready
      // const response = await fetch('/api/whatsapp-integration/notifications');
      // const data = await response.json();
      
      // Mock data for now
      const mockNotifications: WhatsAppNotification[] = [
        {
          id: 1,
          patient_id: 1,
          patient_name: 'John Doe',
          entity_id: 101,
          notification_type: 'BILL_NOTIFICATION',
          message: 'Your bill has been generated...',
          status: 'sent',
          message_id: 'msg_123456',
          error_message: null,
          sent_at: '2023-12-01T10:30:00Z'
        },
        {
          id: 2,
          patient_id: 2,
          patient_name: 'Jane Smith',
          entity_id: 102,
          notification_type: 'STUDY_COMPLETION',
          message: 'Your study has been completed...',
          status: 'sent',
          message_id: 'msg_123457',
          error_message: null,
          sent_at: '2023-12-01T11:15:00Z'
        }
      ];
      
      setNotifications(mockNotifications);
    } catch (error) {
      setError('Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  // Fetch promotions
  const fetchPromotions = async () => {
    setLoading(true);
    try {
      // Mock data for now
      const mockPromotions: WhatsAppPromotion[] = [
        {
          id: 1,
          title: 'Christmas Special Offer',
          message: 'Get 20% off on all radiology services this December!',
          discount_percentage: 20,
          valid_from: '2023-12-01',
          valid_to: '2023-12-31',
          service_types: ['X-RAY', 'MRI', 'CT'],
          target_audience: 'all',
          status: 'active',
          created_at: '2023-11-25T10:00:00Z'
        }
      ];
      
      setPromotions(mockPromotions);
    } catch (error) {
      setError('Failed to fetch promotions');
    } finally {
      setLoading(false);
    }
  };

  // Fetch templates
  const fetchTemplates = async () => {
    setLoading(true);
    try {
      // Mock data for now
      const mockTemplates: WhatsAppTemplate[] = [
        {
          id: 1,
          template_name: 'bill_notification',
          template_type: 'BILL_NOTIFICATION',
          message_template: '🏥 *Bill Notification*\\n\\nDear {{patient_name}},...',
          variables: ['patient_name', 'bill_number', 'bill_amount'],
          status: 'active',
          whatsapp_template_id: 'whatsapp_template_123'
        }
      ];
      
      setTemplates(mockTemplates);
    } catch (error) {
      setError('Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  // Fetch statistics
  const fetchStats = async () => {
    setLoading(true);
    try {
      // Mock data for now
      const mockStats: NotificationStats[] = [
        {
          notification_type: 'BILL_NOTIFICATION',
          total_sent: 150,
          successful: 145,
          failed: 5,
          success_rate: 96.67,
          notification_date: '2023-12-01'
        },
        {
          notification_type: 'STUDY_COMPLETION',
          total_sent: 75,
          successful: 72,
          failed: 3,
          success_rate: 96.0,
          notification_date: '2023-12-01'
        }
      ];
      
      setStats(mockStats);
    } catch (error) {
      setError('Failed to fetch statistics');
    } finally {
      setLoading(false);
    }
  };

  // Send notification
  const sendNotification = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // This would be implemented when backend is ready
      // const response = await fetch('/api/whatsapp-integration/send-notification', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(sendForm)
      // });

      setSuccess('Notification sent successfully');
      setShowSendModal(false);
      setSendForm({
        notification_type: 'BILL_NOTIFICATION',
        patient_id: '',
        entity_id: '',
        custom_message: ''
      });
      fetchNotifications();
    } catch (error) {
      setError('Failed to send notification');
    } finally {
      setLoading(false);
    }
  };

  // Create promotion
  const createPromotion = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // This would be implemented when backend is ready
      // const response = await fetch('/api/whatsapp-integration/promotions', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(promotionForm)
      // });

      setSuccess('Promotion created successfully');
      setShowPromotionModal(false);
      setPromotionForm({
        title: '',
        message: '',
        discount_percentage: 0,
        valid_from: '',
        valid_to: '',
        service_types: [],
        target_audience: 'all'
      });
      fetchPromotions();
    } catch (error) {
      setError('Failed to create promotion');
    } finally {
      setLoading(false);
    }
  };

  // Effects
  useEffect(() => {
    if (activeTab === 'notifications') {
      fetchNotifications();
    } else if (activeTab === 'promotions') {
      fetchPromotions();
    } else if (activeTab === 'templates') {
      fetchTemplates();
    } else if (activeTab === 'stats') {
      fetchStats();
    }
  }, [activeTab]);

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">WhatsApp Integration</h2>
        <p className="text-gray-600 mt-1">Manage WhatsApp notifications, promotions, and templates</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'notifications'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <MessageSquare className="w-4 h-4 inline mr-2" />
            Notifications
          </button>
          <button
            onClick={() => setActiveTab('promotions')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'promotions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Megaphone className="w-4 h-4 inline mr-2" />
            Promotions
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'templates'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Templates
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'settings'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Settings className="w-4 h-4 inline mr-2" />
            Settings
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'stats'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" />
            Statistics
          </button>
        </nav>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-600">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
            <span className="text-green-600">{success}</span>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-4">
              <select
                value={notificationFilter.type}
                onChange={(e) => setNotificationFilter({ ...notificationFilter, type: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                <option value="BILL_NOTIFICATION">Bill Notification</option>
                <option value="STUDY_COMPLETION">Study Completion</option>
                <option value="REPORT_READY">Report Ready</option>
                <option value="APPOINTMENT_REMINDER">Appointment Reminder</option>
                <option value="SERVICE_STATUS">Service Status</option>
              </select>

              <select
                value={notificationFilter.status}
                onChange={(e) => setNotificationFilter({ ...notificationFilter, status: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowSendModal(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Notification
              </button>
              
              <button
                onClick={fetchNotifications}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent At</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {notifications.map((notification) => (
                  <tr key={notification.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{notification.patient_name}</div>
                      <div className="text-sm text-gray-500">ID: {notification.patient_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {notification.notification_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        notification.status === 'sent' 
                          ? 'bg-green-100 text-green-800' 
                          : notification.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {notification.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {notification.message}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(notification.sent_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-900 mr-3">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="text-red-600 hover:text-red-900">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Promotions Tab */}
      {activeTab === 'promotions' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Promotional Campaigns</h3>
            <button
              onClick={() => setShowPromotionModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Promotion
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {promotions.map((promotion) => (
              <div key={promotion.id} className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-gray-900">{promotion.title}</h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        promotion.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {promotion.status}
                      </span>
                    </div>
                <p className="text-sm text-gray-600 mb-3">{promotion.message}</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Discount:</span>
                    <span className="font-medium">{promotion.discount_percentage}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Valid:</span>
                    <span className="font-medium">
                      {new Date(promotion.valid_from).toLocaleDateString()} - {new Date(promotion.valid_to).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Target:</span>
                    <span className="font-medium">{promotion.target_audience}</span>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 mt-4">
                  <button className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-green-600 hover:bg-green-50 rounded">
                    <Send className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-red-600 hover:bg-red-50 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Message Templates</h3>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </button>
          </div>

          <div className="space-y-4">
            {templates.map((template) => (
              <div key={template.id} className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-medium text-gray-900">{template.template_name}</h4>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {template.template_type.replace('_', ' ')}
                    </span>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        template.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                    {template.status}
                  </span>
                </div>
                <div className="bg-gray-50 p-3 rounded text-sm font-mono text-gray-700 mb-2">
                  {template.message_template.substring(0, 200)}...
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    Variables: {template.variables.join(', ')}
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-red-600 hover:bg-red-50 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div>
          <div className="max-w-2xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">WhatsApp Settings</h3>
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                  <Info className="w-5 h-5 text-yellow-600 mr-2" />
                  <span className="text-yellow-800">
                    WhatsApp integration requires API setup. Configure your WhatsApp Business API credentials to enable notifications.
                  </span>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="font-medium text-gray-900 mb-4">API Configuration</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter WhatsApp API key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number ID</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter WhatsApp phone number ID"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                    <input
                      type="url"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter webhook URL"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="font-medium text-gray-900 mb-4">Notification Settings</h4>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input type="checkbox" className="mr-2" defaultChecked />
                    <span className="text-sm text-gray-700">Enable bill notifications</span>
                  </label>
                  <label className="flex items-center">
                    <input type="checkbox" className="mr-2" defaultChecked />
                    <span className="text-sm text-gray-700">Enable appointment reminders</span>
                  </label>
                  <label className="flex items-center">
                    <input type="checkbox" className="mr-2" defaultChecked />
                    <span className="text-sm text-gray-700">Enable study completion notifications</span>
                  </label>
                  <label className="flex items-center">
                    <input type="checkbox" className="mr-2" defaultChecked />
                    <span className="text-sm text-gray-700">Enable promotional messages</span>
                  </label>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="font-medium text-gray-900 mb-4">Rate Limiting</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max messages per hour</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      defaultValue="10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message delay (seconds)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      defaultValue="1"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === 'stats' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Total Sent</span>
                <Send className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {stats.reduce((sum, stat) => sum + stat.total_sent, 0)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Successful</span>
                <CheckCircle className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-green-600">
                {stats.reduce((sum, stat) => sum + stat.successful, 0)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Failed</span>
                <AlertCircle className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-red-600">
                {stats.reduce((sum, stat) => sum + stat.failed, 0)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Success Rate</span>
                <TrendingUp className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {stats.length > 0 
                  ? (stats.reduce((sum, stat) => sum + stat.success_rate, 0) / stats.length).toFixed(1)
                  : 0}%
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Statistics</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Sent</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Successful</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failed</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Success Rate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stats.map((stat, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          {stat.notification_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{stat.total_sent}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">{stat.successful}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">{stat.failed}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{stat.success_rate}%</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(stat.notification_date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Send Notification Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Send Notification</h3>
              <button
                onClick={() => setShowSendModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notification Type</label>
                <select
                  value={sendForm.notification_type}
                  onChange={(e) => setSendForm({ ...sendForm, notification_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="BILL_NOTIFICATION">Bill Notification</option>
                  <option value="STUDY_COMPLETION">Study Completion</option>
                  <option value="REPORT_READY">Report Ready</option>
                  <option value="APPOINTMENT_REMINDER">Appointment Reminder</option>
                  <option value="SERVICE_STATUS">Service Status Update</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Patient ID</label>
                <input
                  type="text"
                  value={sendForm.patient_id}
                  onChange={(e) => setSendForm({ ...sendForm, patient_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter patient ID"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entity ID</label>
                <input
                  type="text"
                  value={sendForm.entity_id}
                  onChange={(e) => setSendForm({ ...sendForm, entity_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter bill/study/report ID"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Custom Message (Optional)</label>
                <textarea
                  value={sendForm.custom_message}
                  onChange={(e) => setSendForm({ ...sendForm, custom_message: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter custom message"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowSendModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={sendNotification}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Notification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppIntegration;
