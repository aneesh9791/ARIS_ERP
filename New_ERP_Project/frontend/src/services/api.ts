import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ApiResponse, User, DashboardData, DashboardFilters } from '../types';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token if available
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

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized access
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Generic GET request
  async get<T>(url: string, params?: any): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.client.get(url, { params });
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Generic POST request
  async post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.client.post(url, data);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Generic PUT request
  async put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.client.put(url, data);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Generic DELETE request
  async delete<T>(url: string): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.client.delete(url);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // File download
  async download(url: string, filename: string): Promise<void> {
    try {
      const response = await this.client.get(url, {
        responseType: 'blob',
      });
      
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Error handling
  private handleError(error: any): Error {
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.error || error.response.data?.message || 'Server error';
      return new Error(message);
    } else if (error.request) {
      // Request was made but no response received
      return new Error('Network error. Please check your connection.');
    } else {
      // Something else happened
      return new Error(error.message || 'An unexpected error occurred');
    }
  }
}

// API Service instance
const apiService = new ApiService();

// Dashboard API
export const dashboardApi = {
  getDashboardData: (filters?: DashboardFilters) =>
    apiService.get<DashboardData>('/dashboard-reports/dashboard', filters),
  
  getDashboardFilters: () =>
    apiService.get('/dashboard-reports/dashboard/filters'),
};

// Authentication API
export const authApi = {
  login: (credentials: { username: string; password: string }) =>
    apiService.post<{ user: User; token: string }>('/auth/login', credentials),
  
  logout: () =>
    apiService.post('/auth/logout'),
  
  changePassword: (data: { current_password: string; new_password: string; confirm_password: string }) =>
    apiService.post('/auth/change-password', data),
  
  refreshToken: () =>
    apiService.post<{ token: string }>('/auth/refresh'),
};

// User API
export const userApi = {
  getCurrentUser: () =>
    apiService.get<User>('/users/me'),
  
  updateProfile: (data: Partial<User>) =>
    apiService.put<User>('/users/profile', data),
  
  getUsers: (params?: any) =>
    apiService.get<User[]>('/users', params),
  
  createUser: (data: Partial<User>) =>
    apiService.post<User>('/users', data),
  
  updateUser: (id: number, data: Partial<User>) =>
    apiService.put<User>(`/users/${id}`, data),
  
  deleteUser: (id: number) =>
    apiService.delete(`/users/${id}`),
};

// Patient API
export const patientApi = {
  getPatients: (params?: any) =>
    apiService.get('/patients', params),
  
  getPatient: (id: number) =>
    apiService.get(`/patients/${id}`),
  
  createPatient: (data: any) =>
    apiService.post('/patients', data),
  
  updatePatient: (id: number, data: any) =>
    apiService.put(`/patients/${id}`, data),
  
  deletePatient: (id: number) =>
    apiService.delete(`/patients/${id}`),
  
  searchPatients: (query: string) =>
    apiService.get('/patients/search', { q: query }),
};

// Study API
export const studyApi = {
  getStudies: (params?: any) =>
    apiService.get('/studies', params),
  
  getStudy: (id: number) =>
    apiService.get(`/studies/${id}`),
  
  createStudy: (data: any) =>
    apiService.post('/studies', data),
  
  updateStudy: (id: number, data: any) =>
    apiService.put(`/studies/${id}`, data),
  
  deleteStudy: (id: number) =>
    apiService.delete(`/studies/${id}`),
  
  updateStudyStatus: (id: number, status: string) =>
    apiService.put(`/studies/${id}/status`, { status }),
};

// Billing API
export const billingApi = {
  getBills: (params?: any) =>
    apiService.get('/billing', params),
  
  getBill: (id: number) =>
    apiService.get(`/billing/${id}`),
  
  createBill: (data: any) =>
    apiService.post('/billing', data),
  
  updateBill: (id: number, data: any) =>
    apiService.put(`/billing/${id}`, data),
  
  deleteBill: (id: number) =>
    apiService.delete(`/billing/${id}`),
  
  addPayment: (id: number, data: any) =>
    apiService.post(`/billing/${id}/payment`, data),
};

// Reports API
export const reportsApi = {
  getReports: () =>
    apiService.get('/dashboard-reports/reports'),
  
  generateReport: (data: {
    report_id: string;
    format: 'PDF' | 'Excel';
    filters?: any;
    date_from?: string;
    date_to?: string;
  }) =>
    apiService.post('/dashboard-reports/reports/generate', data),
  
  downloadReport: (reportId: string, format: string, filters?: any) =>
    apiService.download(`/dashboard-reports/reports/${reportId}/download?format=${format}`, 
      `${reportId}_${format}_${new Date().toISOString().split('T')[0]}.${format.toLowerCase()}`),
};

// Centers API
export const centerApi = {
  getCenters: () =>
    apiService.get('/centers'),
  
  getCenter: (id: number) =>
    apiService.get(`/centers/${id}`),
  
  createCenter: (data: any) =>
    apiService.post('/centers', data),
  
  updateCenter: (id: number, data: any) =>
    apiService.put(`/centers/${id}`, data),
  
  deleteCenter: (id: number) =>
    apiService.delete(`/centers/${id}`),
};

// Radiology API
export const radiologyApi = {
  getRadiologists: () =>
    apiService.get('/radiology-reporting/radiologists'),
  
  getRadiologist: (code: string) =>
    apiService.get(`/radiology-reporting/radiologists/${code}`),
  
  createRadiologist: (data: any) =>
    apiService.post('/radiology-reporting/radiologists', data),
  
  updateRadiologist: (code: string, data: any) =>
    apiService.put(`/radiology-reporting/radiologists/${code}`, data),
  
  deleteRadiologist: (code: string) =>
    apiService.delete(`/radiology-reporting/radiologists/${code}`),
  
  getRadiologistRates: (params?: any) =>
    apiService.get('/radiology-reporting/radiologists/rates', params),
  
  reportStudy: (data: any) =>
    apiService.post('/radiology-reporting/studies/report', data),
  
  processPayment: (data: any) =>
    apiService.post('/radiology-reporting/payments', data),
};

// Employees API
export const employeeApi = {
  getEmployees: (params?: any) =>
    apiService.get('/payroll/employees', params),
  
  getEmployee: (id: number) =>
    apiService.get(`/payroll/employees/${id}`),
  
  createEmployee: (data: any) =>
    apiService.post('/payroll/employees', data),
  
  updateEmployee: (id: number, data: any) =>
    apiService.put(`/payroll/employees/${id}`, data),
  
  deleteEmployee: (id: number) =>
    apiService.delete(`/payroll/employees/${id}`),
  
  markAttendance: (data: any) =>
    apiService.post('/payroll/attendance', data),
  
  updateAttendance: (id: number, data: any) =>
    apiService.put(`/payroll/attendance/${id}`, data),
  
  calculatePayroll: (data: any) =>
    apiService.post('/payroll/calculate', data),
};

// RBAC API
export const rbacApi = {
  getRoles: () =>
    apiService.get('/rbac/roles'),
  
  createRole: (data: any) =>
    apiService.post('/rbac/roles', data),
  
  updateRole: (id: number, data: any) =>
    apiService.put(`/rbac/roles/${id}`, data),
  
  deleteRole: (id: number) =>
    apiService.delete(`/rbac/roles/${id}`),
  
  getPermissions: () =>
    apiService.get('/rbac/permissions'),
  
  assignRole: (userId: number, data: any) =>
    apiService.post(`/rbac/users/${userId}/assign-role`, data),
  
  getUserPermissions: (userId: number) =>
    apiService.get(`/rbac/users/${userId}/permissions`),
  
  getDashboardConfig: () =>
    apiService.get('/rbac/dashboard/config'),
  
  getAccessibleCenters: () =>
    apiService.get('/rbac/centers/accessible'),
};

// Password Settings API
export const passwordSettingsApi = {
  getPasswordPolicy: () =>
    apiService.get('/password-settings/password-policy'),
  
  updatePasswordPolicy: (data: any) =>
    apiService.put('/password-settings/password-policy', data),
  
  changePassword: (data: any) =>
    apiService.post('/password-settings/change-password', data),
  
  resetPassword: (data: any) =>
    apiService.post('/password-settings/reset-password', data),
  
  checkPasswordStrength: (data: { password: string }) =>
    apiService.post('/password-settings/check-password-strength', data),
  
  getPasswordHistory: (userId: number, params?: any) =>
    apiService.get(`/password-settings/password-history/${userId}`, params),
};

export default apiService;
