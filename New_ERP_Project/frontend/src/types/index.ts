// Global type definitions for ARIS ERP

import { ReactNode } from 'react';

// User Types
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  center_id?: number;
  center_name?: string;
  permissions: string[];
  dashboard_widgets: string[];
  report_access: string[];
  is_corporate_role: boolean;
  can_access_all_centers: boolean;
  allowed_centers?: number[];
  employee_type: 'Corporate' | 'Team-Based' | 'Center-Specific';
}

// Center Types
export interface Center {
  id: number;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
  email: string;
  gst_number?: string;
  pan_number?: string;
  license_number?: string;
  established_year?: number;
  logo_path?: string;
  active: boolean;
  modalities?: Modality[];
}

export interface Modality {
  id: number;
  center_id: number;
  modality: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  installation_date: string;
  warranty_expiry?: string;
  last_maintenance?: string;
  next_maintenance?: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  active: boolean;
}

// Patient Types
export interface Patient {
  id: number;
  name: string;
  email?: string;
  phone: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  date_of_birth: string;
  age?: number;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  has_insurance: boolean;
  insurance_provider_id?: number;
  policy_number?: string;
  insured_name?: string;
  relationship?: string;
  referring_physician_code?: string;
  center_id: number;
  created_at: string;
  updated_at: string;
  active: boolean;
}

export interface InsuranceProvider {
  id: number;
  name: string;
  code: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  gst_number?: string;
  pan_number?: string;
  tds_rate: number;
  settlement_days: number;
  active: boolean;
}

// Study Types
export interface Study {
  id: number;
  study_id: string;
  patient_id: number;
  study_code: string;
  center_id: number;
  scanner_id?: number;
  radiologist_code?: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
  scheduled_date: string;
  scheduled_time: string;
  completion_date?: string;
  report_date?: string;
  reporting_rate?: number;
  report_status?: 'COMPLETED' | 'PARTIAL' | 'REVIEW';
  payment_status?: 'PENDING' | 'PAID';
  payment_date?: string;
  payment_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  active: boolean;
}

export interface StudyMaster {
  id: number;
  study_code: string;
  study_name: string;
  modality: string;
  description: string;
  base_rate: number;
  contrast_required: boolean;
  contrast_rate?: number;
  preparation_instructions?: string;
  duration_minutes: number;
  active: boolean;
}

// Billing Types
export interface PatientBill {
  id: number;
  invoice_number: string;
  patient_id: number;
  center_id: number;
  study_ids: number[];
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  status: 'DRAFT' | 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
  payment_mode?: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
  payment_date?: string;
  transaction_reference?: string;
  due_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  active: boolean;
}

export interface BillItem {
  id: number;
  bill_id: number;
  study_code: string;
  study_name: string;
  quantity: number;
  rate: number;
  amount: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

// Radiologist Types
export interface Radiologist {
  id: number;
  radiologist_code: string;
  name: string;
  type: 'INDIVIDUAL' | 'TELERADIOLOGY_COMPANY';
  specialty: string;
  qualification?: string;
  license_number?: string;
  center_id?: number;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  reporting_rates: ReportingRate[];
  bank_account_number?: string;
  bank_name?: string;
  ifsc_code?: string;
  gst_number?: string;
  pan_number?: string;
  contact_person?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  active: boolean;
}

export interface ReportingRate {
  modality: string;
  rate: number;
  currency: string;
  study_code?: string;
}

// Employee Types
export interface Employee {
  id: number;
  employee_code: string;
  name: string;
  email: string;
  phone: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  date_of_birth: string;
  department: string;
  position: string;
  center_id: number;
  bank_account_number: string;
  bank_name: string;
  ifsc_code: string;
  basic_salary: number;
  hra: number;
  da: number;
  other_allowances: number;
  pf_deduction: number;
  esi_deduction: number;
  professional_tax: number;
  total_deductions: number;
  net_salary: number;
  joining_date: string;
  employment_type: 'PERMANENT' | 'CONTRACT' | 'PART_TIME';
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
  created_at: string;
  updated_at: string;
  active: boolean;
}

export interface Attendance {
  id: number;
  employee_id: number;
  attendance_date: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY';
  check_in_time?: string;
  check_out_time?: string;
  overtime_hours?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Dashboard Types
export interface DashboardData {
  patient_stats: {
    total_patients: number;
    today_patients: number;
    week_patients: number;
    month_patients: number;
    insured_patients: number;
    uninsured_patients: number;
  };
  study_stats: {
    total_studies: number;
    today_studies: number;
    week_studies: number;
    month_studies: number;
    completed_studies: number;
    pending_studies: number;
    in_progress_studies: number;
  };
  revenue_stats: {
    total_revenue: number;
    paid_amount: number;
    pending_amount: number;
    total_bills: number;
    paid_bills: number;
    pending_bills: number;
  };
  modality_breakdown: Array<{
    modality: string;
    study_count: number;
    revenue: number;
  }>;
  radiologist_workload: Array<{
    radiologist_name: string;
    radiologist_code: string;
    study_count: number;
    completed_studies: number;
    pending_studies: number;
    total_earnings: number;
  }>;
  center_utilization: Array<{
    center_name: string;
    city: string;
    study_count: number;
    patient_count: number;
    revenue: number;
  }>;
  monthly_trend: Array<{
    month: string;
    study_count: number;
    patient_count: number;
    revenue: number;
  }>;
  staff_attendance: {
    total_employees: number;
    present_today: number;
    absent_today: number;
    leave_today: number;
    active_last_week: number;
  };
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Filter Types
export interface DashboardFilters {
  center_id?: number;
  date_from?: string;
  date_to?: string;
  modality?: string;
  radiologist_id?: string;
  department?: string;
  period?: '7' | '30' | '90' | '365';
}

// Report Types
export interface ReportData {
  title: string;
  generated_by: string;
  generated_at: Date;
  filters: DashboardFilters;
  data: any[];
}

// Form Types
export interface FormData {
  [key: string]: any;
}

// Component Props Types
export interface BaseComponentProps {
  className?: string;
  children?: ReactNode;
}

export interface ButtonProps extends BaseComponentProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export interface InputProps extends BaseComponentProps {
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

// Chart Types
export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
  }>;
}

// Utility Types
export type SortDirection = 'asc' | 'desc';
export type Status = 'ACTIVE' | 'INACTIVE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

// Error Types
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

// Theme Types
export interface Theme {
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    light: string;
    dark: string;
  };
  breakpoints: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}

// Navigation Types
export interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  children?: NavigationItem[];
  permissions?: string[];
}

// Modal Types
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

// Table Types
export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (value: any, row: any) => ReactNode;
}

export interface TableProps {
  data: any[];
  columns: TableColumn[];
  loading?: boolean;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  onSort?: (key: string, direction: SortDirection) => void;
}

// Export Types
export type ExportFormat = 'PDF' | 'Excel' | 'CSV';

export interface ExportOptions {
  format: ExportFormat;
  filters?: DashboardFilters;
  columns?: string[];
}

// Notification Types
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
}

// Search Types
export interface SearchFilters {
  query?: string;
  filters?: Record<string, any>;
  sortBy?: string;
  sortOrder?: SortDirection;
  page?: number;
  limit?: number;
}

// File Upload Types
export interface FileUpload {
  file: File;
  name: string;
  size: number;
  type: string;
  url?: string;
  progress?: number;
}

// Validation Types
export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'select' | 'textarea' | 'date' | 'number';
  validation?: ValidationRule[];
  options?: Array<{ value: string; label: string }>;
}

// Permission Types
export type Permission = string;

export interface Role {
  id: number;
  role: string;
  role_name: string;
  description: string;
  permissions: Permission[];
  dashboard_widgets: string[];
  report_access: string[];
  is_corporate_role: boolean;
  can_access_all_centers: boolean;
  allowed_centers?: number[];
  active: boolean;
}

// Session Types
export interface Session {
  user: User;
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

// Cache Types
export interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// WebSocket Types
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: number;
}

// Health Check Types
export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: 'connected' | 'disconnected';
    redis?: 'connected' | 'disconnected';
    storage: 'available' | 'unavailable';
  };
}

// Audit Log Types
export interface AuditLog {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  resource: string;
  resource_id?: string;
  ip_address: string;
  user_agent: string;
  timestamp: string;
  details?: any;
}
