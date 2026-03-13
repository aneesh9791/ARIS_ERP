// Backend type definitions for ARIS ERP

import { Request, Response, NextFunction } from 'express';
import { Pool, PoolClient } from 'pg';

// User Types
export interface User {
  id: number;
  name: string;
  email: string;
  username: string;
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
  password_changed: boolean;
  last_login?: Date;
  failed_login_attempts: number;
  locked_until?: Date;
  created_at: Date;
  updated_at: Date;
  active: boolean;
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
  created_at: Date;
  updated_at: Date;
}

export interface Modality {
  id: number;
  center_id: number;
  modality: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  installation_date: Date;
  warranty_expiry?: Date;
  last_maintenance?: Date;
  next_maintenance?: Date;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Patient Types
export interface Patient {
  id: number;
  name: string;
  email?: string;
  phone: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  date_of_birth: Date;
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
  created_at: Date;
  updated_at: Date;
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
  scheduled_date: Date;
  scheduled_time: string;
  completion_date?: Date;
  report_date?: Date;
  reporting_rate?: number;
  report_status?: 'COMPLETED' | 'PARTIAL' | 'REVIEW';
  payment_status?: 'PENDING' | 'PAID';
  payment_date?: Date;
  payment_id?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
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
  payment_date?: Date;
  transaction_reference?: string;
  due_date?: Date;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  active: boolean;
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
  created_at: Date;
  updated_at: Date;
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
  date_of_birth: Date;
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
  joining_date: Date;
  employment_type: 'PERMANENT' | 'CONTRACT' | 'PART_TIME';
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
  created_at: Date;
  updated_at: Date;
  active: boolean;
}

export interface Attendance {
  id: number;
  employee_id: number;
  attendance_date: Date;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY';
  check_in_time?: string;
  check_out_time?: string;
  overtime_hours?: number;
  notes?: string;
  created_at: Date;
  updated_at: Date;
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
    month: Date;
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
export interface ApiResponse<T = any> {
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
  date_from?: Date;
  date_to?: Date;
  modality?: string;
  radiologist_id?: string;
  department?: string;
  period?: '7' | '30' | '90' | '365';
}

// Database Types
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

// Express Types
export interface AuthenticatedRequest extends Request {
  user?: User;
  userPermissions?: string[];
  session?: any;
}

export interface DatabaseRequest extends AuthenticatedRequest {
  pool?: Pool;
  client?: PoolClient;
}

// Validation Types
export interface ValidationRule {
  field: string;
  rules: string[];
  message?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// Error Types
export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
  details?: any;
}

export interface DatabaseError extends Error {
  code?: string;
  severity?: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: number;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
}

// Logger Types
export interface LoggerConfig {
  level: string;
  format: string;
  transports: Array<{
    type: string;
    filename?: string;
    maxSize?: string;
    maxFiles?: string;
  }>;
}

// Session Types
export interface SessionData {
  user: User;
  csrfToken: string;
  expiresAt: Date;
}

// Pagination Types
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// File Upload Types
export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

// Report Types
export interface ReportData {
  title: string;
  generated_by: string;
  generated_at: Date;
  filters: DashboardFilters;
  data: any[];
}

export interface ReportOptions {
  format: 'PDF' | 'Excel';
  filters?: DashboardFilters;
  columns?: string[];
}

// Password Policy Types
export interface PasswordPolicy {
  id: number;
  min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_numbers: boolean;
  require_special_chars: boolean;
  prevent_common_passwords: boolean;
  prevent_reuse: boolean;
  max_reuse_count: number;
  session_timeout: number;
  lockout_threshold: number;
  lockout_duration: number;
  password_expiry_days: number;
  created_at: Date;
  updated_at: Date;
  active: boolean;
}

// RBAC Types
export interface Role {
  id: number;
  role: string;
  role_name: string;
  description: string;
  permissions: string[];
  dashboard_widgets: string[];
  report_access: string[];
  is_corporate_role: boolean;
  can_access_all_centers: boolean;
  allowed_centers?: number[];
  created_at: Date;
  updated_at: Date;
  active: boolean;
}

// Health Check Types
export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: 'connected' | 'disconnected';
    redis?: 'connected' | 'disconnected';
    storage: 'available' | 'unavailable';
  };
  metrics?: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
    disk: {
      used: number;
      total: number;
      percentage: number;
    };
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
  timestamp: Date;
  details?: any;
}

// Utility Types
export type SortDirection = 'ASC' | 'DESC';
export type Status = 'ACTIVE' | 'INACTIVE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type PaymentMode = 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
export type StudyStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type BillStatus = 'DRAFT' | 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY';

// Function Types
export type AsyncFunction<T = void> = () => Promise<T>;
export type AsyncFunctionWithParams<P, T = void> = (params: P) => Promise<T>;
export type MiddlewareFunction = (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export type ErrorHandlerFunction = (err: Error, req: Request, res: Response, next: NextFunction) => void;

// Event Types
export interface DatabaseEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  old?: any;
  new?: any;
  timestamp: Date;
}

// Configuration Types
export interface AppConfig {
  port: number;
  env: string;
  database: DatabaseConfig;
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  session: {
    secret: string;
    resave: boolean;
    saveUninitialized: boolean;
    cookie: {
      secure: boolean;
      httpOnly: boolean;
      maxAge: number;
    };
  };
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  upload: {
    maxFileSize: number;
    allowedTypes: string[];
  };
  logging: LoggerConfig;
}

// Cache Types
export interface CacheItem<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
}

// WebSocket Types
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: number;
  userId?: number;
}

// Export all types for easy importing
export * from 'express';
export * from 'pg';
