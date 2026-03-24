import axios from 'axios';
import toast from 'react-hot-toast';

// Create axios instance with default configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3003/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle different error types
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          // Unauthorized - clear token and redirect to login
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
          toast.error('Session expired. Please login again.');
          break;
        case 403:
          // Forbidden
          toast.error('Access denied. You don\'t have permission to perform this action.');
          break;
        case 404:
          // Not found
          toast.error('Resource not found.');
          break;
        case 429:
          // Too many requests
          toast.error('Too many requests. Please try again later.');
          break;
        case 500:
          // Internal server error
          toast.error('Server error. Please try again later.');
          break;
        default:
          // Other errors
          toast.error(data?.error || data?.message || 'An error occurred.');
      }
    } else if (error.request) {
      // Network error
      toast.error('Network error. Please check your connection.');
    } else {
      // Other error
      toast.error('An unexpected error occurred.');
    }
    
    return Promise.reject(error);
  }
);

// API service methods
export const apiService = {
  // Auth endpoints
  auth: {
    login: (credentials) => api.post('/auth/login', credentials),
    logout: () => api.post('/auth/logout'),
    refreshToken: () => api.post('/auth/refresh'),
    forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
    resetPassword: (token, newPassword) => api.post('/auth/reset-password', { token, newPassword }),
  },

  // User endpoints
  users: {
    getAll: (params) => api.get('/users', { params }),
    getById: (id) => api.get(`/users/${id}`),
    create: (userData) => api.post('/users', userData),
    update: (id, userData) => api.put(`/users/${id}`, userData),
    delete: (id) => api.delete(`/users/${id}`),
    updateProfile: (userData) => api.put('/users/profile', userData),
    changePassword: (passwords) => api.put('/users/change-password', passwords),
  },

  // Patient endpoints
  patients: {
    getAll: (params) => api.get('/patients', { params }),
    getById: (id) => api.get(`/patients/${id}`),
    create: (patientData) => api.post('/patients', patientData),
    update: (id, patientData) => api.put(`/patients/${id}`, patientData),
    delete: (id) => api.delete(`/patients/${id}`),
    search: (query) => api.get('/patients/search', { params: { q: query } }),
  },

  // Appointment endpoints
  appointments: {
    getAll: (params) => api.get('/appointments', { params }),
    getById: (id) => api.get(`/appointments/${id}`),
    create: (appointmentData) => api.post('/appointments', appointmentData),
    update: (id, appointmentData) => api.put(`/appointments/${id}`, appointmentData),
    delete: (id) => api.delete(`/appointments/${id}`),
    getByDate: (date) => api.get('/appointments/by-date', { params: { date } }),
    getByDoctor: (doctorId) => api.get('/appointments/by-doctor', { params: { doctorId } }),
  },

  // Medical records endpoints
  medicalRecords: {
    getAll: (params) => api.get('/medical-records', { params }),
    getById: (id) => api.get(`/medical-records/${id}`),
    create: (recordData) => api.post('/medical-records', recordData),
    update: (id, recordData) => api.put(`/medical-records/${id}`, recordData),
    delete: (id) => api.delete(`/medical-records/${id}`),
    getByPatient: (patientId) => api.get('/medical-records/by-patient', { params: { patientId } }),
  },

  // Billing endpoints
  billing: {
    getAll: (params) => api.get('/billing', { params }),
    getById: (id) => api.get(`/billing/${id}`),
    create: (billData) => api.post('/billing', billData),
    update: (id, billData) => api.put(`/billing/${id}`, billData),
    delete: (id) => api.delete(`/billing/${id}`),
    getByPatient: (patientId) => api.get('/billing/by-patient', { params: { patientId } }),
    generateBill: (appointmentId) => api.post('/billing/generate', { appointmentId }),
  },

  // Services endpoints
  services: {
    getAll: (params) => api.get('/services', { params }),
    getById: (id) => api.get(`/services/${id}`),
    create: (serviceData) => api.post('/services', serviceData),
    update: (id, serviceData) => api.put(`/services/${id}`, serviceData),
    delete: (id) => api.delete(`/services/${id}`),
    getByCategory: (category) => api.get('/services/by-category', { params: { category } }),
  },

  // Centers endpoints
  centers: {
    getAll: (params) => api.get('/centers', { params }),
    getById: (id) => api.get(`/centers/${id}`),
    create: (centerData) => api.post('/centers', centerData),
    update: (id, centerData) => api.put(`/centers/${id}`, centerData),
    delete: (id) => api.delete(`/centers/${id}`),
  },

  // Departments endpoints
  departments: {
    getAll: (params) => api.get('/departments', { params }),
    getById: (id) => api.get(`/departments/${id}`),
    create: (deptData) => api.post('/departments', deptData),
    update: (id, deptData) => api.put(`/departments/${id}`, deptData),
    delete: (id) => api.delete(`/departments/${id}`),
    getByCenter: (centerId) => api.get('/departments/by-center', { params: { centerId } }),
  },

  // Assets endpoints
  assets: {
    getAll: (params) => api.get('/assets', { params }),
    getById: (id) => api.get(`/assets/${id}`),
    create: (assetData) => api.post('/assets', assetData),
    update: (id, assetData) => api.put(`/assets/${id}`, assetData),
    delete: (id) => api.delete(`/assets/${id}`),
    getByCenter: (centerId) => api.get('/assets/by-center', { params: { centerId } }),
  },

  // Inventory endpoints
  inventory: {
    getAll: (params) => api.get('/inventory', { params }),
    getById: (id) => api.get(`/inventory/${id}`),
    create: (itemData) => api.post('/inventory', itemData),
    update: (id, itemData) => api.put(`/inventory/${id}`, itemData),
    delete: (id) => api.delete(`/inventory/${id}`),
    getByCenter: (centerId) => api.get('/inventory/by-center', { params: { centerId } }),
    updateStock: (id, quantity) => api.put(`/inventory/${id}/stock`, { quantity }),
  },

  // Vendors endpoints
  vendors: {
    getAll: (params) => api.get('/vendors', { params }),
    getById: (id) => api.get(`/vendors/${id}`),
    create: (vendorData) => api.post('/vendors', vendorData),
    update: (id, vendorData) => api.put(`/vendors/${id}`, vendorData),
    delete: (id) => api.delete(`/vendors/${id}`),
  },

  // Purchase orders endpoints
  purchaseOrders: {
    getAll: (params) => api.get('/purchase-orders', { params }),
    getById: (id) => api.get(`/purchase-orders/${id}`),
    create: (orderData) => api.post('/purchase-orders', orderData),
    update: (id, orderData) => api.put(`/purchase-orders/${id}`, orderData),
    delete: (id) => api.delete(`/purchase-orders/${id}`),
    approve: (id) => api.put(`/purchase-orders/${id}/approve`),
    receive: (id, items) => api.put(`/purchase-orders/${id}/receive`, { items }),
  },

  // Dashboard endpoints
  dashboard: {
    getStats: () => api.get('/dashboard/stats'),
    getAppointments: (params) => api.get('/dashboard/appointments', { params }),
    getRevenue: (params) => api.get('/dashboard/revenue', { params }),
    getPatients: (params) => api.get('/dashboard/patients', { params }),
  },

  // Reports endpoints
  reports: {
    getPatientReport: (params) => api.get('/reports/patients', { params }),
    getFinancialReport: (params) => api.get('/reports/financial', { params }),
    getAppointmentReport: (params) => api.get('/reports/appointments', { params }),
    exportReport: (type, params) => api.get(`/reports/export/${type}`, { params, responseType: 'blob' }),
  },

  // Settings endpoints
  settings: {
    getAll: () => api.get('/settings'),
    update: (settings) => api.put('/settings', settings),
    getLogo: () => api.get('/settings/logo'),
    updateLogo: (logoData) => api.post('/settings/logo', logoData),
  },

  // Health check
  health: () => api.get('/health'),
};

// Export the API service
export default api;

// Export individual methods for convenience
export const {
  auth,
  users,
  patients,
  appointments,
  medicalRecords,
  billing,
  services,
  centers,
  departments,
  assets,
  inventory,
  vendors,
  purchaseOrders,
  dashboard,
  reports,
  settings,
  health
} = apiService;
