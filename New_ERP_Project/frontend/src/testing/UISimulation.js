// UI Simulation Framework
// Simulates real user interactions and system behavior

class UISimulation {
  constructor() {
    this.isRunning = false;
    this.simulationSpeed = 1000; // 1 second per action
    this.currentSimulation = null;
    this.userProfiles = this.generateUserProfiles();
    this.systemLoad = {
      users: 0,
      requests: 0,
      data: 0
    };
    this.performanceMetrics = {
      responseTime: [],
      throughput: [],
      errorRate: [],
      resourceUsage: []
    };
  }

  generateUserProfiles() {
    return [
      {
        id: 1,
        name: 'Dr. Sarah Johnson',
        role: 'doctor',
        department: 'General Medicine',
        workload: 'high',
        behavior: {
          loginFrequency: 'daily',
          sessionDuration: '8hours',
          actionsPerHour: 30,
          preferredPages: ['dashboard', 'appointments', 'patients', 'medical-records'],
          typingSpeed: 'fast',
          errorRate: 0.05
        }
      },
      {
        id: 2,
        name: 'Nurse Michael Chen',
        role: 'nurse',
        department: 'Emergency',
        workload: 'medium',
        behavior: {
          loginFrequency: 'daily',
          sessionDuration: '12hours',
          actionsPerHour: 45,
          preferredPages: ['patients', 'appointments', 'vital-signs', 'medications'],
          typingSpeed: 'medium',
          errorRate: 0.08
        }
      },
      {
        id: 3,
        name: 'Admin Lisa Martinez',
        role: 'admin',
        department: 'Front Desk',
        workload: 'high',
        behavior: {
          loginFrequency: 'daily',
          sessionDuration: '8hours',
          actionsPerHour: 60,
          preferredPages: ['dashboard', 'patients', 'appointments', 'billing'],
          typingSpeed: 'fast',
          errorRate: 0.03
        }
      },
      {
        id: 4,
        name: 'Lab Technician Tom Wilson',
        role: 'lab-tech',
        department: 'Laboratory',
        workload: 'medium',
        behavior: {
          loginFrequency: 'daily',
          sessionDuration: '8hours',
          actionsPerHour: 25,
          preferredPages: ['lab-orders', 'lab-results', 'reports'],
          typingSpeed: 'medium',
          errorRate: 0.06
        }
      },
      {
        id: 5,
        name: 'Pharmacist Amy Davis',
        role: 'pharmacist',
        department: 'Pharmacy',
        workload: 'medium',
        behavior: {
          loginFrequency: 'daily',
          sessionDuration: '8hours',
          actionsPerHour: 35,
          preferredPages: ['prescriptions', 'inventory', 'patients'],
          typingSpeed: 'fast',
          errorRate: 0.04
        }
      }
    ];
  }

  async startSimulation() {
    console.log('🚀 Starting UI Simulation...');
    this.isRunning = true;
    this.currentSimulation = {
      startTime: Date.now(),
      users: [],
      actions: [],
      errors: []
    };

    // Start system monitoring
    this.startSystemMonitoring();

    // Simulate multiple users
    const userPromises = this.userProfiles.map(profile => 
      this.simulateUser(profile)
    );

    // Wait for all users to complete their sessions
    await Promise.all(userPromises);

    // Generate simulation report
    this.generateSimulationReport();

    this.isRunning = false;
    console.log('✅ UI Simulation Completed!');
  }

  async simulateUser(userProfile) {
    console.log(`\n👤 Simulating User: ${userProfile.name} (${userProfile.role})`);

    // Simulate user login
    await this.simulateLogin(userProfile);

    // Simulate user session
    const sessionDuration = this.getSessionDuration(userProfile);
    const sessionEndTime = Date.now() + sessionDuration;

    while (Date.now() < sessionEndTime && this.isRunning) {
      // Simulate user actions
      await this.simulateUserActions(userProfile);

      // Random pause between actions
      const pauseTime = this.getRandomPauseTime(userProfile);
      await new Promise(resolve => setTimeout(resolve, pauseTime));
    }

    // Simulate user logout
    await this.simulateLogout(userProfile);

    console.log(`✅ User session completed: ${userProfile.name}`);
  }

  async simulateLogin(userProfile) {
    const startTime = Date.now();
    
    try {
      console.log(`  🔐 ${userProfile.name} logging in...`);
      
      // Navigate to login page
      await this.simulateNavigation('/login');
      
      // Fill login form
      await this.simulateFormFill('#email', this.getUserEmail(userProfile));
      await this.simulateFormFill('#password', this.getUserPassword(userProfile));
      
      // Click login button
      await this.simulateClick('#login-button');
      
      // Wait for dashboard
      await this.simulateWaitFor('.dashboard');
      
      const responseTime = Date.now() - startTime;
      this.recordPerformanceMetric('responseTime', responseTime);
      
      this.systemLoad.users++;
      console.log(`    ✅ Login successful (${responseTime}ms)`);
      
    } catch (error) {
      this.currentSimulation.errors.push({
        user: userProfile.name,
        action: 'login',
        error: error.message,
        timestamp: Date.now()
      });
      console.log(`    ❌ Login failed: ${error.message}`);
    }
  }

  async simulateUserActions(userProfile) {
    const actionsPerHour = userProfile.behavior.actionsPerHour;
    const actionsPerMinute = actionsPerHour / 60;
    const shouldPerformAction = Math.random() < (actionsPerMinute / 60);

    if (shouldPerformAction) {
      const action = this.getRandomAction(userProfile);
      await this.performAction(userProfile, action);
    }
  }

  async performAction(userProfile, action) {
    const startTime = Date.now();
    
    try {
      console.log(`  📝 ${userProfile.name} performing: ${action.name}`);
      
      // Navigate to target page
      if (action.navigation) {
        await this.simulateNavigation(action.navigation);
      }
      
      // Perform action steps
      for (const step of action.steps) {
        await this.performActionStep(step);
      }
      
      const responseTime = Date.now() - startTime;
      this.recordPerformanceMetric('responseTime', responseTime);
      
      this.systemLoad.requests++;
      this.currentSimulation.actions.push({
        user: userProfile.name,
        action: action.name,
        timestamp: Date.now(),
        duration: responseTime
      });
      
      console.log(`    ✅ Action completed (${responseTime}ms)`);
      
    } catch (error) {
      this.currentSimulation.errors.push({
        user: userProfile.name,
        action: action.name,
        error: error.message,
        timestamp: Date.now()
      });
      console.log(`    ❌ Action failed: ${error.message}`);
    }
  }

  async performActionStep(step) {
    switch (step.type) {
      case 'click':
        await this.simulateClick(step.target);
        break;
      case 'fill':
        await this.simulateFormFill(step.target, step.value);
        break;
      case 'select':
        await this.simulateSelect(step.target, step.value);
        break;
      case 'wait':
        await this.simulateWait(step.duration);
        break;
      case 'scroll':
        await this.simulateScroll(step.direction);
        break;
      case 'search':
        await this.simulateSearch(step.target, step.query);
        break;
      case 'upload':
        await this.simulateFileUpload(step.target, step.file);
        break;
    }
  }

  getRandomAction(userProfile) {
    const actions = this.getActionsForRole(userProfile.role);
    return actions[Math.floor(Math.random() * actions.length)];
  }

  getActionsForRole(role) {
    const actionMap = {
      doctor: [
        {
          name: 'View Patient List',
          navigation: '/patients',
          steps: [
            { type: 'wait', duration: 1000 },
            { type: 'scroll', direction: 'down' },
            { type: 'wait', duration: 500 }
          ]
        },
        {
          name: 'Review Appointments',
          navigation: '/appointments',
          steps: [
            { type: 'wait', duration: 1000 },
            { type: 'click', target: '.appointment-item' },
            { type: 'wait', duration: 500 }
          ]
        },
        {
          name: 'Update Medical Record',
          navigation: '/medical-records',
          steps: [
            { type: 'click', target: '.add-record-btn' },
            { type: 'fill', target: '#diagnosis', value: 'Hypertension' },
            { type: 'fill', target: '#treatment', value: 'Medication' },
            { type: 'click', target: '.save-btn' }
          ]
        },
        {
          name: 'View Lab Results',
          navigation: '/lab-results',
          steps: [
            { type: 'wait', duration: 1000 },
            { type: 'click', target: '.result-item' },
            { type: 'wait', duration: 500 }
          ]
        }
      ],
      nurse: [
        {
          name: 'Check Patient Vitals',
          navigation: '/patients',
          steps: [
            { type: 'click', target: '.patient-item' },
            { type: 'click', target: '.vitals-btn' },
            { type: 'fill', target: '#blood-pressure', value: '120/80' },
            { type: 'fill', target: '#heart-rate', value: '72' },
            { type: 'click', target: '.save-vitals-btn' }
          ]
        },
        {
          name: 'Update Medications',
          navigation: '/medications',
          steps: [
            { type: 'click', target: '.add-medication-btn' },
            { type: 'fill', target: '#medication-name', value: 'Aspirin' },
            { type: 'fill', target: '#dosage', value: '100mg' },
            { type: 'click', target: '.save-medication-btn' }
          ]
        },
        {
          name: 'Schedule Follow-up',
          navigation: '/appointments',
          steps: [
            { type: 'click', target: '.schedule-btn' },
            { type: 'select', target: '#patient-select', value: '1' },
            { type: 'fill', target: '#appointment-date', value: '2024-03-15' },
            { type: 'click', target: '.save-appointment-btn' }
          ]
        }
      ],
      admin: [
        {
          name: 'Register New Patient',
          navigation: '/patients',
          steps: [
            { type: 'click', target: '.add-patient-btn' },
            { type: 'fill', target: '#patient-name', value: 'New Patient' },
            { type: 'fill', target: '#patient-email', value: 'patient@email.com' },
            { type: 'fill', target: '#patient-phone', value: '1234567890' },
            { type: 'click', target: '.save-patient-btn' }
          ]
        },
        {
          name: 'Process Payment',
          navigation: '/billing',
          steps: [
            { type: 'click', target: '.add-bill-btn' },
            { type: 'select', target: '#patient-select', value: '1' },
            { type: 'click', target: '.add-service-btn' },
            { type: 'select', target: '#service-select', value: '1' },
            { type: 'click', target: '.calculate-btn' },
            { type: 'click', target: '.save-bill-btn' }
          ]
        },
        {
          name: 'Generate Reports',
          navigation: '/reports',
          steps: [
            { type: 'click', target: '.patient-reports' },
            { type: 'select', target: '#report-type', value: 'daily' },
            { type: 'fill', target: '#start-date', value: '2024-03-01' },
            { type: 'fill', target: '#end-date', value: '2024-03-31' },
            { type: 'click', target: '.generate-btn' }
          ]
        }
      ],
      'lab-tech': [
        {
          name: 'Process Lab Orders',
          navigation: '/lab-orders',
          steps: [
            { type: 'click', target: '.lab-order-item' },
            { type: 'fill', target: '#test-result', value: 'Normal' },
            { type: 'fill', target: '#notes', value: 'Test completed successfully' },
            { type: 'click', target: '.save-result-btn' }
          ]
        },
        {
          name: 'Update Lab Inventory',
          navigation: '/lab-inventory',
          steps: [
            { type: 'click', target: '.add-item-btn' },
            { type: 'fill', target: '#item-name', value: 'Test Kit' },
            { type: 'fill', target: '#quantity', value: '100' },
            { type: 'click', target: '.save-item-btn' }
          ]
        }
      ],
      pharmacist: [
        {
          name: 'Fill Prescription',
          navigation: '/prescriptions',
          steps: [
            { type: 'click', target: '.prescription-item' },
            { type: 'click', target: '.fill-btn' },
            { type: 'fill', target: '#quantity-dispensed', value: '30' },
            { type: 'fill', target: '#instructions', value: 'Take twice daily' },
            { type: 'click', target: '.save-btn' }
          ]
        },
        {
          name: 'Update Inventory',
          navigation: '/pharmacy-inventory',
          steps: [
            { type: 'click', target: '.update-inventory-btn' },
            { type: 'fill', target: '#stock-level', value: '500' },
            { type: 'click', target: '.save-inventory-btn' }
          ]
        }
      ]
    };

    return actionMap[role] || actionMap.admin;
  }

  async simulateNavigation(url) {
    window.location.href = url;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async simulateClick(selector) {
    const element = document.querySelector(selector);
    if (element) {
      element.click();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async simulateFormFill(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  async simulateSelect(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  async simulateWait(duration) {
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  async simulateWaitFor(selector) {
    const startTime = Date.now();
    const timeout = 5000;
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Element not found: ${selector}`);
  }

  async simulateScroll(direction) {
    if (direction === 'down') {
      window.scrollBy(0, 300);
    } else if (direction === 'up') {
      window.scrollBy(0, -300);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async simulateSearch(selector, query) {
    const element = document.querySelector(selector);
    if (element) {
      element.value = query;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async simulateFileUpload(selector, file) {
    const element = document.querySelector(selector);
    if (element) {
      // Create a mock file
      const mockFile = new File(['content'], file, { type: 'text/plain' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(mockFile);
      element.files = dataTransfer.files;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async simulateLogout(userProfile) {
    console.log(`  🔓 ${userProfile.name} logging out...`);
    
    try {
      await this.simulateClick('#logout-btn');
      await this.simulateWaitFor('#login-page');
      
      this.systemLoad.users--;
      console.log(`    ✅ Logout successful`);
      
    } catch (error) {
      console.log(`    ❌ Logout failed: ${error.message}`);
    }
  }

  getSessionDuration(userProfile) {
    const durations = {
      '8hours': 8 * 60 * 60 * 1000,
      '12hours': 12 * 60 * 60 * 1000,
      '4hours': 4 * 60 * 60 * 1000
    };
    
    return durations[userProfile.behavior.sessionDuration] || durations['8hours'];
  }

  getRandomPauseTime(userProfile) {
    const basePause = 60000 / userProfile.behavior.actionsPerHour; // 1 minute / actions per hour
    return basePause + (Math.random() - 0.5) * basePause; // Add some randomness
  }

  getUserEmail(userProfile) {
    return `${userProfile.name.toLowerCase().replace(' ', '.')}@aris.com`;
  }

  getUserPassword(userProfile) {
    return 'password123'; // In real simulation, use proper passwords
  }

  recordPerformanceMetric(type, value) {
    if (!this.performanceMetrics[type]) {
      this.performanceMetrics[type] = [];
    }
    this.performanceMetrics[type].push({
      value,
      timestamp: Date.now()
    });
  }

  startSystemMonitoring() {
    // Monitor system performance
    setInterval(() => {
      if (this.isRunning) {
        // Monitor memory usage
        if (performance.memory) {
          this.recordPerformanceMetric('resourceUsage', {
            type: 'memory',
            value: performance.memory.usedJSHeapSize
          });
        }
        
        // Monitor CPU usage (simplified)
        this.recordPerformanceMetric('resourceUsage', {
          type: 'cpu',
          value: Math.random() * 100 // Simplified CPU usage
        });
      }
    }, 5000);
  }

  generateSimulationReport() {
    console.log('\n📊 UI Simulation Report');
    console.log('================================');
    
    const totalDuration = Date.now() - this.currentSimulation.startTime;
    const totalActions = this.currentSimulation.actions.length;
    const totalErrors = this.currentSimulation.errors.length;
    const averageResponseTime = this.calculateAverageResponseTime();
    const throughput = (totalActions / totalDuration) * 1000; // actions per second
    const errorRate = (totalErrors / totalActions) * 100;
    
    console.log(`Simulation Duration: ${(totalDuration / 1000).toFixed(2)} seconds`);
    console.log(`Total Actions: ${totalActions}`);
    console.log(`Total Errors: ${totalErrors}`);
    console.log(`Error Rate: ${errorRate.toFixed(2)}%`);
    console.log(`Average Response Time: ${averageResponseTime.toFixed(2)}ms`);
    console.log(`Throughput: ${throughput.toFixed(2)} actions/second`);
    
    console.log('\nUser Activity Summary:');
    this.userProfiles.forEach(profile => {
      const userActions = this.currentSimulation.actions.filter(action => action.user === profile.name);
      const userErrors = this.currentSimulation.errors.filter(error => error.user === profile.name);
      
      console.log(`  ${profile.name}: ${userActions.length} actions, ${userErrors.length} errors`);
    });
    
    console.log('\nPerformance Metrics:');
    Object.entries(this.performanceMetrics).forEach(([type, metrics]) => {
      const average = metrics.reduce((sum, metric) => sum + metric.value, 0) / metrics.length;
      console.log(`  ${type}: ${average.toFixed(2)}`);
    });
    
    // Generate detailed report
    this.generateDetailedReport();
  }

  calculateAverageResponseTime() {
    const responseTimes = this.performanceMetrics.responseTime.map(metric => metric.value);
    return responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  }

  generateDetailedReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        duration: Date.now() - this.currentSimulation.startTime,
        totalActions: this.currentSimulation.actions.length,
        totalErrors: this.currentSimulation.errors.length,
        errorRate: (this.currentSimulation.errors.length / this.currentSimulation.actions.length) * 100,
        averageResponseTime: this.calculateAverageResponseTime(),
        throughput: (this.currentSimulation.actions.length / (Date.now() - this.currentSimulation.startTime)) * 1000
      },
      users: this.userProfiles.map(profile => {
        const userActions = this.currentSimulation.actions.filter(action => action.user === profile.name);
        const userErrors = this.currentSimulation.errors.filter(error => error.user === profile.name);
        
        return {
          name: profile.name,
          role: profile.role,
          actions: userActions.length,
          errors: userErrors.length,
          averageResponseTime: userActions.length > 0 ? 
            userActions.reduce((sum, action) => sum + action.duration, 0) / userActions.length : 0
        };
      }),
      performance: this.performanceMetrics,
      systemLoad: this.systemLoad,
      errors: this.currentSimulation.errors
    };
    
    console.log('📄 Detailed simulation report generated');
    return report;
  }

  // Stress testing simulation
  async startStressTest() {
    console.log('🔥 Starting Stress Test Simulation...');
    
    // Simulate high load with multiple users
    const stressUsers = this.generateStressUsers();
    const userPromises = stressUsers.map(user => this.simulateUser(user));
    
    await Promise.all(userPromises);
    
    console.log('✅ Stress Test Completed!');
  }

  generateStressUsers() {
    // Generate additional users for stress testing
    const stressUsers = [];
    for (let i = 0; i < 20; i++) {
      stressUsers.push({
        id: 100 + i,
        name: `Stress User ${i + 1}`,
        role: ['doctor', 'nurse', 'admin'][Math.floor(Math.random() * 3)],
        department: 'Various',
        workload: 'high',
        behavior: {
          loginFrequency: 'daily',
          sessionDuration: '4hours',
          actionsPerHour: 60 + Math.floor(Math.random() * 40), // 60-100 actions per hour
          preferredPages: ['dashboard', 'patients', 'appointments'],
          typingSpeed: 'fast',
          errorRate: 0.1 // Higher error rate under stress
        }
      });
    }
    
    return stressUsers;
  }
}

// Export for use in the browser console
window.UISimulation = UISimulation;

// Auto-start if running in browser
if (typeof window !== 'undefined') {
  console.log('🚀 UI Simulation Framework Loaded');
  console.log('To start simulation, run: new UISimulation().startSimulation()');
  console.log('To start stress test, run: new UISimulation().startStressTest()');
}

export default UISimulation;
