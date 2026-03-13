const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ARIS ERP API',
      version: '1.0.0',
      description: 'Comprehensive ERP system for Kerala Diagnostic Centers',
      contact: {
        name: 'ARIS ERP Team',
        email: 'support@aris-erp.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000/api',
        description: 'Development server',
      },
      {
        url: 'https://api.aris-erp.com/api',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'session',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'John Doe' },
            email: { type: 'string', example: 'john@example.com' },
            role: { type: 'string', example: 'CENTER_MANAGER' },
            center_id: { type: 'integer', example: 1 },
            permissions: { type: 'array', items: { type: 'string' } },
            employee_type: { type: 'string', enum: ['Corporate', 'Team-Based', 'Center-Specific'] },
          },
        },
        Patient: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Jane Doe' },
            phone: { type: 'string', example: '+919876543210' },
            gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'] },
            date_of_birth: { type: 'string', format: 'date', example: '1990-01-01' },
            address: { type: 'string', example: '123 Main St, Kochi' },
            has_insurance: { type: 'boolean', example: true },
          },
        },
        Study: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            study_id: { type: 'string', example: 'STY123456' },
            patient_id: { type: 'integer', example: 1 },
            study_code: { type: 'string', example: 'MRI-BRAIN' },
            status: { type: 'string', enum: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
            scheduled_date: { type: 'string', format: 'date', example: '2024-03-15' },
            radiologist_code: { type: 'string', example: 'RAD001' },
          },
        },
        PatientBill: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            invoice_number: { type: 'string', example: 'INV-2024-001' },
            patient_id: { type: 'integer', example: 1 },
            total_amount: { type: 'number', format: 'float', example: 5000.00 },
            paid_amount: { type: 'number', format: 'float', example: 3000.00 },
            pending_amount: { type: 'number', format: 'float', example: 2000.00 },
            status: { type: 'string', enum: ['DRAFT', 'PENDING', 'PAID', 'PARTIAL', 'CANCELLED'] },
            payment_mode: { type: 'string', enum: ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE'] },
          },
        },
        Radiologist: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            radiologist_code: { type: 'string', example: 'RAD001' },
            name: { type: 'string', example: 'Dr. Michael Wilson' },
            type: { type: 'string', enum: ['INDIVIDUAL', 'TELERADIOLOGY_COMPANY'] },
            specialty: { type: 'string', example: 'Neuroradiology' },
            reporting_rates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  modality: { type: 'string', example: 'MRI' },
                  rate: { type: 'number', format: 'float', example: 50.00 },
                  currency: { type: 'string', example: 'INR' },
                },
              },
            },
          },
        },
        Employee: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            employee_code: { type: 'string', example: 'EMP001' },
            name: { type: 'string', example: 'John Smith' },
            email: { type: 'string', example: 'john@example.com' },
            department: { type: 'string', example: 'RADIOLOGY' },
            position: { type: 'string', example: 'Senior Radiologist' },
            basic_salary: { type: 'number', format: 'float', example: 80000.00 },
            net_salary: { type: 'number', format: 'float', example: 95000.00 },
          },
        },
        Center: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Kochi Medical Imaging Center' },
            code: { type: 'string', example: 'KMC001' },
            address: { type: 'string', example: '123 Medical Complex, Kochi' },
            city: { type: 'string', example: 'Kochi' },
            state: { type: 'string', example: 'Kerala' },
            phone: { type: 'string', example: '+914842345678' },
            email: { type: 'string', example: 'kochi@aris-erp.com' },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            message: { type: 'string', example: 'Operation completed successfully' },
            error: { type: 'string', example: 'Error message' },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer', example: 1 },
                limit: { type: 'integer', example: 10 },
                total: { type: 'integer', example: 100 },
                pages: { type: 'integer', example: 10 },
              },
            },
          },
        },
        DashboardData: {
          type: 'object',
          properties: {
            patient_stats: {
              type: 'object',
              properties: {
                total_patients: { type: 'integer', example: 1500 },
                today_patients: { type: 'integer', example: 25 },
                week_patients: { type: 'integer', example: 120 },
                month_patients: { type: 'integer', example: 450 },
                insured_patients: { type: 'integer', example: 800 },
                uninsured_patients: { type: 'integer', example: 700 },
              },
            },
            study_stats: {
              type: 'object',
              properties: {
                total_studies: { type: 'integer', example: 2500 },
                today_studies: { type: 'integer', example: 45 },
                week_studies: { type: 'integer', example: 200 },
                month_studies: { type: 'integer', example: 750 },
                completed_studies: { type: 'integer', example: 2000 },
                pending_studies: { type: 'integer', example: 300 },
                in_progress_studies: { type: 'integer', example: 200 },
              },
            },
            revenue_stats: {
              type: 'object',
              properties: {
                total_revenue: { type: 'number', format: 'float', example: 2500000.00 },
                paid_amount: { type: 'number', format: 'float', example: 2000000.00 },
                pending_amount: { type: 'number', format: 'float', example: 500000.00 },
                total_bills: { type: 'integer', example: 1800 },
                paid_bills: { type: 'integer', example: 1500 },
                pending_bills: { type: 'integer', example: 300 },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Validation failed' },
            details: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
      {
        cookieAuth: [],
      },
    ],
    tags: [
      'Authentication',
      'Users',
      'Patients',
      'Studies',
      'Billing',
      'Radiology',
      'Employees',
      'Centers',
      'Dashboard',
      'Reports',
      'RBAC',
      'Password Settings',
    ],
  },
  apis: [
    './src/routes/*.js',
    './src/routes/**/*.js',
  ],
};

const specs = swaggerJsdoc(options);

const swaggerUiOptions = {
  explorer: true,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    docExpansion: 'none',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    displayOperationId: false,
    tryItOutEnabled: true,
  },
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info { margin: 20px 0 }
    .swagger-ui .scheme-container { margin: 20px 0 }
    .swagger-ui .info .title { color: #3b82f6; }
    .swagger-ui .opblock.opblock-post { border-color: #10b981; }
    .swagger-ui .opblock.opblock-get { border-color: #3b82f6; }
    .swagger-ui .opblock.opblock-put { border-color: #f59e0b; }
    .swagger-ui .opblock.opblock-delete { border-color: #ef4444; }
  `,
  customSiteTitle: 'ARIS ERP API Documentation',
};

module.exports = {
  specs,
  swaggerUiOptions,
};
