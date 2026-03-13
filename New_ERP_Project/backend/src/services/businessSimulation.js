// Business Process Simulation Service
// Simulates real hospital workflows and business processes

const { Pool } = require('pg');
const Redis = require('redis');
const EventEmitter = require('events');

class BusinessSimulation extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      simulationSpeed: options.simulationSpeed || 1, // 1 = real-time, 10 = 10x speed
      enableLogging: options.enableLogging !== false,
      enableMetrics: options.enableMetrics !== false,
      ...options
    };
    
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    this.redisClient = require('redis').createClient({
      url: process.env.REDIS_URL
    });
    
    this.metrics = {
      patientsProcessed: 0,
      appointmentsCompleted: 0,
      prescriptionsFilled: 0,
      labTestsCompleted: 0,
      revenueGenerated: 0,
      staffSatisfaction: 0,
      patientSatisfaction: 0,
      systemResponseTime: 0
    };
    
    this.isRunning = false;
    this.simulationTimer = null;
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.log('Business simulation started');
    this.emit('started');
    
    // Start simulation loop
    this.simulationTimer = setInterval(() => {
      this.runSimulationCycle();
    }, 1000 / this.options.simulationSpeed);
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    
    this.log('Business simulation stopped');
    this.emit('stopped');
  }

  async runSimulationCycle() {
    try {
      // Simulate various business processes
      await this.simulatePatientArrival();
      await this.simulateDoctorWorkflow();
      await this.simulatePharmacyOperations();
      await this.simulateLabOperations();
      await this.simulateBillingProcess();
      await this.simulateAdministrativeTasks();
      
      // Update metrics
      this.updateMetrics();
      
      // Emit cycle completion
      this.emit('cycleCompleted', this.metrics);
      
    } catch (error) {
      this.log(`Simulation cycle error: ${error.message}`, 'error');
      this.emit('error', error);
    }
  }

  // Hospital Daily Operations
  async simulateMorningOpening() {
    const startTime = Date.now();
    
    try {
      // Simulate 20 doctors logging in simultaneously
      const doctorPromises = Array.from({ length: 20 }, (_, i) => 
        this.simulateDoctorLogin(i + 1)
      );
      
      const doctors = await Promise.all(doctorPromises);
      
      // Simulate 50 patients arriving
      const patients = await this.simulatePatientArrival(50);
      
      // Simulate check-in process
      const checkins = await this.simulateCheckInProcess(patients);
      
      const duration = Date.now() - startTime;
      this.log(`Morning opening simulation completed in ${duration}ms`);
      
      return { doctors, patients, checkins };
      
    } catch (error) {
      this.log(`Morning opening simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async simulateDoctorLogin(doctorId) {
    const startTime = Date.now();
    
    try {
      // Simulate doctor authentication
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update doctor status
      await this.pool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [doctorId]
      );
      
      const duration = Date.now() - startTime;
      this.metrics.systemResponseTime = (this.metrics.systemResponseTime + duration) / 2;
      
      return { doctorId, loginTime: duration };
      
    } catch (error) {
      this.log(`Doctor login simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async simulatePatientArrival(count = 1) {
    const startTime = Date.now();
    
    try {
      const patients = [];
      
      for (let i = 0; i < count; i++) {
        // Simulate patient arrival
        const patient = {
          id: `PAT_${Date.now()}_${i}`,
          name: `Patient ${i + 1}`,
          arrivalTime: new Date(),
          priority: this.getRandomPriority(),
          type: this.getRandomPatientType()
        };
        
        patients.push(patient);
        
        // Add small delay between arrivals
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const duration = Date.now() - startTime;
      this.log(`Simulated ${count} patient arrivals in ${duration}ms`);
      
      return patients;
      
    } catch (error) {
      this.log(`Patient arrival simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async simulateCheckInProcess(patients) {
    const startTime = Date.now();
    
    try {
      const checkins = [];
      
      for (const patient of patients) {
        // Simulate check-in process
        const checkinTime = 2000 + Math.random() * 3000; // 2-5 seconds
        
        await new Promise(resolve => setTimeout(resolve, checkinTime / this.options.simulationSpeed));
        
        const checkin = {
          patientId: patient.id,
          checkInTime: new Date(),
          processingTime: checkinTime,
          status: 'checked_in'
        };
        
        checkins.push(checkin);
        this.metrics.patientsProcessed++;
      }
      
      const duration = Date.now() - startTime;
      this.log(`Processed ${patients.length} check-ins in ${duration}ms`);
      
      return checkins;
      
    } catch (error) {
      this.log(`Check-in process simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  // Doctor Workflow Simulation
  async simulateDoctorWorkflow(doctorId) {
    const startTime = Date.now();
    
    try {
      // Get today's appointments
      const appointments = await this.getAppointmentsForDoctor(doctorId);
      
      const workflow = [];
      
      for (const appointment of appointments) {
        // Simulate patient consultation
        const consultation = await this.simulateConsultation(doctorId, appointment);
        workflow.push(consultation);
        
        // Simulate medical record update
        await this.simulateMedicalRecordUpdate(consultation);
        
        // Simulate prescription if needed
        if (Math.random() > 0.6) {
          const prescription = await this.simulatePrescription(consultation);
          workflow.push(prescription);
        }
        
        // Simulate lab test order if needed
        if (Math.random() > 0.7) {
          const labOrder = await this.simulateLabOrder(consultation);
          workflow.push(labOrder);
        }
      }
      
      const duration = Date.now() - startTime;
      this.log(`Doctor ${doctorId} workflow completed in ${duration}ms`);
      
      return workflow;
      
    } catch (error) {
      this.log(`Doctor workflow simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async simulateConsultation(doctorId, appointment) {
    const startTime = Date.now();
    
    try {
      // Simulate consultation time (10-20 minutes)
      const consultationTime = 600000 + Math.random() * 600000; // 10-20 minutes
      
      await new Promise(resolve => 
        setTimeout(resolve, consultationTime / this.options.simulationSpeed)
      );
      
      const consultation = {
        doctorId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        startTime: new Date(),
        endTime: new Date(Date.now() + consultationTime),
        duration: consultationTime,
        diagnosis: this.getRandomDiagnosis(),
        treatment: this.getRandomTreatment(),
        notes: 'Consultation completed successfully'
      };
      
      this.metrics.appointmentsCompleted++;
      
      // Update patient satisfaction
      this.metrics.patientSatisfaction = 
        (this.metrics.patientSatisfaction * 0.9 + 0.95 * 0.1); // 95% satisfaction
      
      const duration = Date.now() - startTime;
      this.log(`Consultation completed in ${duration}ms`);
      
      return consultation;
      
    } catch (error) {
      this.log(`Consultation simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async simulateMedicalRecordUpdate(consultation) {
    const startTime = Date.now();
    
    try {
      // Simulate medical record update
      await this.pool.query(
        `INSERT INTO medical_records 
         (patient_id, doctor_id, appointment_id, diagnosis, treatment, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [
          consultation.patientId,
          consultation.doctorId,
          consultation.appointmentId,
          consultation.diagnosis,
          consultation.treatment,
          consultation.notes
        ]
      );
      
      const duration = Date.now() - startTime;
      this.log(`Medical record updated in ${duration}ms`);
      
      return { success: true, duration };
      
    } catch (error) {
      this.log(`Medical record update failed: ${error.message}`, 'error');
      throw error;
    }
  }

  // Pharmacy Operations Simulation
  async simulatePharmacyOperations() {
    const startTime = Date.now();
    
    try {
      // Simulate prescription processing
      const prescriptions = await this.getPendingPrescriptions();
      const processed = [];
      
      for (const prescription of prescriptions) {
        const processedPrescription = await this.simulatePrescriptionFilling(prescription);
        processed.push(processedPrescription);
      }
      
      // Simulate inventory management
      await this.simulateInventoryUpdate();
      
      // Simulate insurance claims
      await this.simulateInsuranceClaims(processed);
      
      const duration = Date.now() - startTime;
      this.log(`Pharmacy operations completed in ${duration}ms`);
      
      return processed;
      
    } catch (error) {
      this.log(`Pharmacy operations simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async simulatePrescriptionFilling(prescription) {
    const startTime = Date.now();
    
    try {
      // Simulate prescription filling time (3-8 minutes)
      const fillingTime = 180000 + Math.random() * 300000; // 3-8 minutes
      
      await new Promise(resolve => 
        setTimeout(resolve, fillingTime / this.options.simulationSpeed)
      );
      
      // Check drug availability
      const availability = await this.checkDrugAvailability(prescription);
      
      // Update prescription status
      await this.pool.query(
        'UPDATE prescriptions SET status = $1, filled_at = NOW() WHERE id = $2',
        ['filled', prescription.id]
      );
      
      const filledPrescription = {
        ...prescription,
        status: 'filled',
        filledAt: new Date(),
        fillingTime,
        availability
      };
      
      this.metrics.prescriptionsFilled++;
      this.metrics.revenueGenerated += prescription.cost || 50;
      
      const duration = Date.now() - startTime;
      this.log(`Prescription filled in ${duration}ms`);
      
      return filledPrescription;
      
    } catch (error) {
      this.log(`Prescription filling failed: ${error.message}`, 'error');
      throw error;
    }
  }

  // Lab Operations Simulation
  async simulateLabOperations() {
    const startTime = Date.now();
    
    try {
      // Get pending lab orders
      const labOrders = await this.getPendingLabOrders();
      const processed = [];
      
      for (const order of labOrders) {
        const processedOrder = await this.simulateLabTestProcessing(order);
        processed.push(processedOrder);
      }
      
      // Simulate result upload
      await this.simulateLabResultUpload(processed);
      
      // Simulate doctor notification
      await this.simulateDoctorNotification(processed);
      
      const duration = Date.now() - startTime;
      this.log(`Lab operations completed in ${duration}ms`);
      
      return processed;
      
    } catch (error) {
      this.log(`Lab operations simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async simulateLabTestProcessing(order) {
    const startTime = Date.now();
    
    try {
      // Simulate lab test processing time (15-45 minutes)
      const processingTime = 900000 + Math.random() * 1800000; // 15-45 minutes
      
      await new Promise(resolve => 
        setTimeout(resolve, processingTime / this.options.simulationSpeed)
      );
      
      // Generate test results
      const results = this.generateLabResults(order.testType);
      
      // Update lab order status
      await this.pool.query(
        'UPDATE lab_orders SET status = $1, results = $2, completed_at = NOW() WHERE id = $3',
        ['completed', JSON.stringify(results), order.id]
      );
      
      const processedOrder = {
        ...order,
        status: 'completed',
        results,
        processingTime,
        completedAt: new Date()
      };
      
      this.metrics.labTestsCompleted++;
      
      const duration = Date.now() - startTime;
      this.log(`Lab test processed in ${duration}ms`);
      
      return processedOrder;
      
    } catch (error) {
      this.log(`Lab test processing failed: ${error.message}`, 'error');
      throw error;
    }
  }

  // Billing Process Simulation
  async simulateBillingProcess() {
    const startTime = Date.now();
    
    try {
      // Get completed appointments
      const appointments = await this.getCompletedAppointments();
      const bills = [];
      
      for (const appointment of appointments) {
        const bill = await this.simulateBillGeneration(appointment);
        bills.push(bill);
      }
      
      // Simulate insurance verification
      await this.simulateInsuranceVerification(bills);
      
      // Simulate payment processing
      await this.simulatePaymentProcessing(bills);
      
      const duration = Date.now() - startTime;
      this.log(`Billing process completed in ${duration}ms`);
      
      return bills;
      
    } catch (error) {
      this.log(`Billing process simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async simulateBillGeneration(appointment) {
    const startTime = Date.now();
    
    try {
      // Calculate bill amount
      const baseAmount = 200 + Math.random() * 800; // $200-$1000
      const taxAmount = baseAmount * 0.1; // 10% tax
      const totalAmount = baseAmount + taxAmount;
      
      // Generate bill
      const bill = {
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        baseAmount,
        taxAmount,
        totalAmount,
        status: 'pending',
        createdAt: new Date()
      };
      
      // Save bill to database
      const result = await this.pool.query(
        `INSERT INTO bills 
         (appointment_id, patient_id, doctor_id, base_amount, tax_amount, total_amount, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          bill.appointmentId,
          bill.patientId,
          bill.doctorId,
          bill.baseAmount,
          bill.taxAmount,
          bill.totalAmount,
          bill.status,
          bill.createdAt
        ]
      );
      
      bill.id = result.rows[0].id;
      
      const duration = Date.now() - startTime;
      this.log(`Bill generated in ${duration}ms`);
      
      return bill;
      
    } catch (error) {
      this.log(`Bill generation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  // Administrative Tasks Simulation
  async simulateAdministrativeTasks() {
    const startTime = Date.now();
    
    try {
      // Simulate staff management
      await this.simulateStaffManagement();
      
      // Simulate inventory management
      await this.simulateInventoryManagement();
      
      // Simulate report generation
      await this.simulateReportGeneration();
      
      // Simulate compliance checks
      await this.simulateComplianceChecks();
      
      const duration = Date.now() - startTime;
      this.log(`Administrative tasks completed in ${duration}ms`);
      
      return { success: true, duration };
      
    } catch (error) {
      this.log(`Administrative tasks simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  // Helper Methods
  getRandomPriority() {
    const priorities = ['low', 'medium', 'high', 'urgent'];
    const weights = [0.4, 0.3, 0.2, 0.1];
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < priorities.length; i++) {
      cumulative += weights[i];
      if (random < cumulative) {
        return priorities[i];
      }
    }
    
    return 'medium';
  }

  getRandomPatientType() {
    const types = ['new', 'returning', 'emergency', 'followup'];
    const weights = [0.3, 0.4, 0.1, 0.2];
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < types.length; i++) {
      cumulative += weights[i];
      if (random < cumulative) {
        return types[i];
      }
    }
    
    return 'returning';
  }

  getRandomDiagnosis() {
    const diagnoses = [
      'Hypertension',
      'Diabetes Type 2',
      'Upper Respiratory Infection',
      'Gastroenteritis',
      'Musculoskeletal Pain',
      'Headache',
      'Allergic Rhinitis',
      'Dermatitis',
      'Anxiety',
      'Insomnia'
    ];
    
    return diagnoses[Math.floor(Math.random() * diagnoses.length)];
  }

  getRandomTreatment() {
    const treatments = [
      'Prescribed medication',
      'Lifestyle changes recommended',
      'Follow-up in 2 weeks',
      'Referral to specialist',
      'Lab tests ordered',
      'Physical therapy recommended',
      'Dietary changes',
      'Rest and hydration'
    ];
    
    return treatments[Math.floor(Math.random() * treatments.length)];
  }

  generateLabResults(testType) {
    const results = {
      'Blood Test': {
        hemoglobin: 12 + Math.random() * 4,
        wbc: 4000 + Math.random() * 4000,
        platelets: 150000 + Math.random() * 100000,
        glucose: 70 + Math.random() * 60
      },
      'Urine Test': {
        ph: 5 + Math.random() * 3,
        protein: Math.random() < 0.1 ? 'negative' : 'trace',
        glucose: Math.random() < 0.5 ? 'negative' : 'positive',
        ketones: 'negative'
      },
      'X-Ray': {
        result: 'Normal',
      findings: 'No acute abnormalities',
      impression: 'Unremarkable'
      }
    };
    
    return results[testType] || { status: 'Normal' };
  }

  // Database Helper Methods
  async getAppointmentsForDoctor(doctorId) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM appointments WHERE doctor_id = $1 AND date = CURRENT_DATE ORDER BY time',
        [doctorId]
      );
      return result.rows;
    } catch (error) {
      this.log(`Failed to get appointments for doctor ${doctorId}: ${error.message}`, 'error');
      return [];
    }
  }

  async getPendingPrescriptions() {
    try {
      const result = await this.pool.query(
        'SELECT * FROM prescriptions WHERE status = $1 ORDER BY created_at LIMIT 50',
        ['pending']
      );
      return result.rows;
    } catch (error) {
      this.log(`Failed to get pending prescriptions: ${error.message}`, 'error');
      return [];
    }
  }

  async getPendingLabOrders() {
    try {
      const result = await this.pool.query(
        'SELECT * FROM lab_orders WHERE status = $1 ORDER BY created_at LIMIT 100',
        ['pending']
      );
      return result.rows;
    } catch (error) {
      this.log(`Failed to get pending lab orders: ${error.message}`, 'error');
      return [];
    }
  }

  async getCompletedAppointments() {
    try {
      const result = await this.pool.query(
        'SELECT * FROM appointments WHERE status = $1 AND date = CURRENT_DATE ORDER BY time',
        ['completed']
      );
      return result.rows;
    } catch (error) {
      this.log(`Failed to get completed appointments: ${error.message}`, 'error');
      return [];
    }
  }

  // Metrics and Monitoring
  updateMetrics() {
    // Update staff satisfaction
    this.metrics.staffSatisfaction = 
      (this.metrics.staffSatisfaction * 0.9 + 0.92 * 0.1); // 92% satisfaction
    
    // Update system response time
    this.metrics.systemResponseTime = 
      Math.max(1000, this.metrics.systemResponseTime + (Math.random() - 0.5) * 100);
  }

  getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      simulationSpeed: this.options.simulationSpeed,
      timestamp: new Date().toISOString()
    };
  }

  log(message, level = 'info') {
    if (this.options.enableLogging) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [BUSINESS_SIMULATION] [${level.toUpperCase()}] ${message}`;
      
      console.log(logMessage);
      
      // Also log to file if needed
      // fs.appendFileSync('logs/business-simulation.log', logMessage + '\n');
    }
  }
}

module.exports = BusinessSimulation;
