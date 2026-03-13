import request from 'supertest';
import { app } from '../src/app';
import { DatabaseConfig } from '../src/types';

// Mock database configuration
const mockDbConfig: DatabaseConfig = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  database: process.env.TEST_DB_NAME || 'aris_erp_test',
  username: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'password',
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Test user data
const testUser = {
  name: 'Test User',
  email: 'test@example.com',
  username: 'testuser',
  password: 'Test@123*',
  role: 'CENTER_MANAGER',
  center_id: 1,
};

// Test patient data
const testPatient = {
  name: 'Test Patient',
  phone: '+919876543210',
  gender: 'MALE',
  date_of_birth: '1990-01-01',
  address: '123 Test Street',
  city: 'Kochi',
  state: 'Kerala',
  postal_code: '682024',
  has_insurance: false,
  center_id: 1,
};

// Test study data
const testStudy = {
  patient_id: 1,
  study_code: 'MRI-BRAIN',
  center_id: 1,
  priority: 'ROUTINE',
  scheduled_date: '2024-03-15',
  scheduled_time: '10:00',
};

describe('ARIS ERP API Tests', () => {
  let authToken: string;

  beforeAll(async () => {
    // Setup test database
    console.log('Setting up test database...');
    
    // Create test user and get auth token
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'Aris@123*',
      });
    
    if (response.status === 200) {
      authToken = response.body.token;
    }
  });

  afterAll(async () => {
    // Cleanup test database
    console.log('Cleaning up test database...');
  });

  describe('Authentication', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'Aris@123*',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('name');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should require authentication for protected routes', async () => {
      const response = await request(app)
        .get('/api/users');

      expect(response.status).toBe(401);
    });
  });

  describe('Dashboard', () => {
    it('should get dashboard data', async () => {
      const response = await request(app)
        .get('/api/dashboard-reports/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('dashboard_data');
      expect(response.body.dashboard_data).toHaveProperty('patient_stats');
      expect(response.body.dashboard_data).toHaveProperty('study_stats');
      expect(response.body.dashboard_data).toHaveProperty('revenue_stats');
    });

    it('should get dashboard filters', async () => {
      const response = await request(app)
        .get('/api/dashboard-reports/dashboard/filters')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('filters');
      expect(response.body.filters).toHaveProperty('centers');
      expect(response.body.filters).toHaveProperty('modalities');
      expect(response.body.filters).toHaveProperty('radiologists');
    });
  });

  describe('Patients', () => {
    it('should create a new patient', async () => {
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testPatient);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.patient).toHaveProperty('name', testPatient.name);
      expect(response.body.patient).toHaveProperty('phone', testPatient.phone);
    });

    it('should get patients list', async () => {
      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('patients');
      expect(Array.isArray(response.body.patients)).toBe(true);
    });

    it('should get patient by ID', async () => {
      // First create a patient
      const createResponse = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testPatient);

      const patientId = createResponse.body.patient.id;

      // Then get the patient
      const response = await request(app)
        .get(`/api/patients/${patientId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('patient');
      expect(response.body.patient).toHaveProperty('id', patientId);
    });

    it('should update patient information', async () => {
      // First create a patient
      const createResponse = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testPatient);

      const patientId = createResponse.body.patient.id;

      // Then update the patient
      const updateData = {
        name: 'Updated Test Patient',
        phone: '+919876543211',
      };

      const response = await request(app)
        .put(`/api/patients/${patientId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.patient).toHaveProperty('name', updateData.name);
      expect(response.body.patient).toHaveProperty('phone', updateData.phone);
    });

    it('should delete patient', async () => {
      // First create a patient
      const createResponse = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testPatient);

      const patientId = createResponse.body.patient.id;

      // Then delete the patient
      const response = await request(app)
        .delete(`/api/patients/${patientId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Studies', () => {
    let testPatientId: number;

    beforeAll(async () => {
      // Create a test patient for study tests
      const patientResponse = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testPatient);

      testPatientId = patientResponse.body.patient.id;
    });

    it('should create a new study', async () => {
      const studyData = {
        ...testStudy,
        patient_id: testPatientId,
      };

      const response = await request(app)
        .post('/api/studies')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studyData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.study).toHaveProperty('patient_id', testPatientId);
      expect(response.body.study).toHaveProperty('study_code', testStudy.study_code);
    });

    it('should get studies list', async () => {
      const response = await request(app)
        .get('/api/studies')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('studies');
      expect(Array.isArray(response.body.studies)).toBe(true);
    });

    it('should update study status', async () => {
      // First create a study
      const studyData = {
        ...testStudy,
        patient_id: testPatientId,
      };

      const createResponse = await request(app)
        .post('/api/studies')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studyData);

      const studyId = createResponse.body.study.id;

      // Then update the study status
      const response = await request(app)
        .put(`/api/studies/${studyId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'COMPLETED' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.study).toHaveProperty('status', 'COMPLETED');
    });
  });

  describe('Billing', () => {
    let testPatientId: number;
    let testStudyId: number;

    beforeAll(async () => {
      // Create a test patient for billing tests
      const patientResponse = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testPatient);

      testPatientId = patientResponse.body.patient.id;

      // Create a test study for billing tests
      const studyData = {
        ...testStudy,
        patient_id: testPatientId,
      };

      const studyResponse = await request(app)
        .post('/api/studies')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studyData);

      testStudyId = studyResponse.body.study.id;
    });

    it('should create a new bill', async () => {
      const billData = {
        patient_id: testPatientId,
        study_ids: [testStudyId],
        total_amount: 5000.00,
        paid_amount: 0.00,
        pending_amount: 5000.00,
        status: 'PENDING',
      };

      const response = await request(app)
        .post('/api/billing')
        .set('Authorization', `Bearer ${authToken}`)
        .send(billData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.bill).toHaveProperty('patient_id', testPatientId);
      expect(response.body.bill).toHaveProperty('total_amount', 5000.00);
    });

    it('should get bills list', async () => {
      const response = await request(app)
        .get('/api/billing')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('bills');
      expect(Array.isArray(response.body.bills)).toBe(true);
    });

    it('should add payment to bill', async () => {
      // First create a bill
      const billData = {
        patient_id: testPatientId,
        study_ids: [testStudyId],
        total_amount: 5000.00,
        paid_amount: 0.00,
        pending_amount: 5000.00,
        status: 'PENDING',
      };

      const createResponse = await request(app)
        .post('/api/billing')
        .set('Authorization', `Bearer ${authToken}`)
        .send(billData);

      const billId = createResponse.body.bill.id;

      // Then add payment
      const paymentData = {
        amount: 3000.00,
        payment_mode: 'CASH',
        transaction_reference: 'CASH001',
        notes: 'Partial payment',
      };

      const response = await request(app)
        .post(`/api/billing/${billId}/payment`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.bill).toHaveProperty('paid_amount', 3000.00);
      expect(response.body.bill).toHaveProperty('pending_amount', 2000.00);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
          name: 'Test Patient',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('errors');
      expect(Array.isArray(response.body.errors)).toBe(true);
    });

    it('should handle not found errors', async () => {
      const response = await request(app)
        .get('/api/patients/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle unauthorized access', async () => {
      const response = await request(app)
        .get('/api/patients');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('RBAC', () => {
    it('should get user permissions', async () => {
      const response = await request(app)
        .get('/api/rbac/users/1/permissions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('permissions');
      expect(Array.isArray(response.body.user.permissions)).toBe(true);
    });

    it('should get accessible centers', async () => {
      const response = await request(app)
        .get('/api/rbac/centers/accessible')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('accessible_centers');
      expect(Array.isArray(response.body.accessible_centers)).toBe(true);
    });
  });

  describe('Password Settings', () => {
    it('should get password policy', async () => {
      const response = await request(app)
        .get('/api/password-settings/password-policy')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('password_policy');
      expect(response.body.password_policy).toHaveProperty('min_length');
      expect(response.body.password_policy).toHaveProperty('require_uppercase');
      expect(response.body.password_policy).toHaveProperty('require_lowercase');
    });

    it('should check password strength', async () => {
      const response = await request(app)
        .post('/api/password-settings/check-password-strength')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          password: 'TestPassword123!',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('strength');
      expect(response.body.strength).toHaveProperty('score');
      expect(response.body.strength).toHaveProperty('strength');
    });
  });

  describe('Reports', () => {
    it('should get available reports', async () => {
      const response = await request(app)
        .get('/api/dashboard-reports/reports')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('reports');
      expect(Array.isArray(response.body.reports)).toBe(true);
    });

    it('should generate report', async () => {
      const response = await request(app)
        .post('/api/dashboard-reports/reports/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          report_id: 'PATIENT_DEMOGRAPHICS',
          format: 'PDF',
          filters: {
            center_id: 1,
          },
          date_from: '2024-01-01',
          date_to: '2024-03-31',
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/pdf/);
    });
  });
});

// Health check test
describe('Health Check', () => {
  it('should return healthy status', async () => {
    const response = await request(app)
      .get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('services');
  });
});

// Performance test
describe('Performance Tests', () => {
  it('should handle concurrent requests', async () => {
    const requests = Array.from({ length: 10 }, () =>
      request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${authToken}`)
    );

    const responses = await Promise.all(requests);
    
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  }, 10000);
});
