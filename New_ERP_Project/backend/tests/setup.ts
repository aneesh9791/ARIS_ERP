// Test setup file for Jest
require('dotenv').config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.SESSION_SECRET = 'test-session-secret';

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set timeout for async operations
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  // Initialize test database
  console.log('Setting up test environment...');
});

afterAll(async () => {
  // Cleanup test database
  console.log('Cleaning up test environment...');
});

// Mock external services
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  })),
}));

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('test-pdf')),
      close: jest.fn(),
    }),
    close: jest.fn(),
  }),
}));

jest.mock('exceljs', () => ({
  Workbook: jest.fn().mockImplementation(() => ({
    addWorksheet: jest.fn().mockReturnValue({
      addRow: jest.fn(),
      getRow: jest.fn().mockReturnValue({
        font: {},
        fill: {},
      }),
      columns: [],
    }),
    xlsx: {
      writeBuffer: jest.fn().mockResolvedValue(Buffer.from('test-excel')),
    },
  })),
}));

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
  }),
}));

// Global test utilities
global.testUtils = {
  createTestUser: () => ({
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    username: 'testuser',
    role: 'CENTER_MANAGER',
    center_id: 1,
    permissions: ['PATIENT_READ', 'STUDY_READ', 'BILLING_READ'],
    dashboard_widgets: ['PATIENT_COUNT', 'STUDY_COUNT', 'REVENUE_SUMMARY'],
    report_access: ['PATIENT_DEMOGRAPHICS', 'STUDY_REPORTS'],
    is_corporate_role: false,
    can_access_all_centers: false,
    allowed_centers: [1],
    employee_type: 'Center-Specific',
    password_changed: true,
    last_login: new Date(),
    failed_login_attempts: 0,
    locked_until: null,
    created_at: new Date(),
    updated_at: new Date(),
    active: true,
  }),
  
  createTestPatient: () => ({
    id: 1,
    name: 'Test Patient',
    phone: '+919876543210',
    gender: 'MALE',
    date_of_birth: new Date('1990-01-01'),
    age: 34,
    address: '123 Test Street',
    city: 'Kochi',
    state: 'Kerala',
    postal_code: '682024',
    has_insurance: false,
    center_id: 1,
    created_at: new Date(),
    updated_at: new Date(),
    active: true,
  }),
  
  createTestStudy: () => ({
    id: 1,
    study_id: 'STY123456',
    patient_id: 1,
    study_code: 'MRI-BRAIN',
    center_id: 1,
    status: 'SCHEDULED',
    priority: 'ROUTINE',
    scheduled_date: new Date(),
    scheduled_time: '10:00',
    created_at: new Date(),
    updated_at: new Date(),
    active: true,
  }),
  
  createTestBill: () => ({
    id: 1,
    invoice_number: 'INV-2024-001',
    patient_id: 1,
    center_id: 1,
    study_ids: [1],
    total_amount: 5000.00,
    paid_amount: 0.00,
    pending_amount: 5000.00,
    status: 'PENDING',
    created_at: new Date(),
    updated_at: new Date(),
    active: true,
  }),
  
  createTestCenter: () => ({
    id: 1,
    name: 'Kochi Medical Imaging Center',
    code: 'KMC001',
    address: '123 Medical Complex, Kochi',
    city: 'Kochi',
    state: 'Kerala',
    postal_code: '682024',
    phone: '+914842345678',
    email: 'kochi@aris-erp.com',
    created_at: new Date(),
    updated_at: new Date(),
    active: true,
  }),
  
  createTestRadiologist: () => ({
    id: 1,
    radiologist_code: 'RAD001',
    name: 'Dr. Michael Wilson',
    type: 'INDIVIDUAL',
    specialty: 'Neuroradiology',
    reporting_rates: [
      { modality: 'MRI', rate: 50.00, currency: 'INR' },
      { modality: 'CT', rate: 30.00, currency: 'INR' },
    ],
    created_at: new Date(),
    updated_at: new Date(),
    active: true,
  }),
  
  createTestEmployee: () => ({
    id: 1,
    employee_code: 'EMP001',
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+919876543210',
    gender: 'MALE',
    date_of_birth: new Date('1985-01-01'),
    department: 'RADIOLOGY',
    position: 'Senior Radiologist',
    center_id: 1,
    bank_account_number: '1234567890',
    bank_name: 'Test Bank',
    ifsc_code: 'TEST0001234',
    basic_salary: 80000.00,
    hra: 12000.00,
    da: 8000.00,
    other_allowances: 5000.00,
    pf_deduction: 8000.00,
    esi_deduction: 2000.00,
    professional_tax: 200.00,
    total_deductions: 10200.00,
    net_salary: 94800.00,
    joining_date: new Date('2020-01-01'),
    employment_type: 'PERMANENT',
    status: 'ACTIVE',
    created_at: new Date(),
    updated_at: new Date(),
    active: true,
  }),
  
  // Helper function to generate JWT token for testing
  generateTestToken: (user: any) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },
  
  // Helper function to create test database connection
  createTestDbConnection: () => {
    const { Pool } = require('pg');
    return new Pool({
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'aris_erp_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'password',
      ssl: false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  },
  
  // Helper function to clean test database
  cleanTestDatabase: async (pool: any) => {
    const tables = [
      'patient_bills',
      'studies',
      'patients',
      'employees',
      'attendance',
      'radiologist_master',
      'centers',
      'users',
    ];
    
    for (const table of tables) {
      try {
        await pool.query(`DELETE FROM ${table} WHERE id > 0`);
      } catch (error) {
        console.log(`Warning: Could not clean table ${table}:`, error.message);
      }
    }
  },
  
  // Helper function to seed test data
  seedTestData: async (pool: any) => {
    // Insert test center
    await pool.query(`
      INSERT INTO centers (id, name, code, address, city, state, postal_code, phone, email, active, created_at, updated_at)
      VALUES (1, 'Kochi Medical Imaging Center', 'KMC001', '123 Medical Complex, Kochi', 'Kochi', 'Kerala', '682024', '+914842345678', 'kochi@aris-erp.com', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    
    // Insert test user
    await pool.query(`
      INSERT INTO users (id, name, email, username, password, role, center_id, active, created_at, updated_at)
      VALUES (1, 'Test User', 'test@example.com', 'testuser', '$2b$10$test.hash', 'CENTER_MANAGER', 1, true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    
    // Insert test patient
    await pool.query(`
      INSERT INTO patients (id, name, phone, gender, date_of_birth, address, city, state, postal_code, has_insurance, center_id, active, created_at, updated_at)
      VALUES (1, 'Test Patient', '+919876543210', 'MALE', '1990-01-01', '123 Test Street', 'Kochi', 'Kerala', '682024', false, 1, true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
  },
};

// Export test utilities for use in other test files
module.exports = global.testUtils;
