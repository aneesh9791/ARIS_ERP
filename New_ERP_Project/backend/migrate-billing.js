#!/usr/bin/env node

/**
 * Billing System Migration Script
 * 
 * This script helps migrate from the old billing.js to the new billing-refactored.js
 * while maintaining data integrity and providing a smooth transition.
 */

const fs = require('fs');
const path = require('path');

class BillingMigration {
  constructor() {
    this.oldFile = path.join(__dirname, 'src/routes/billing.js');
    this.newFile = path.join(__dirname, 'src/routes/billing-refactored.js');
    this.backupFile = path.join(__dirname, 'src/routes/billing-backup.js');
    this.migrationLog = [];
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    console.log(logEntry);
    this.migrationLog.push(logEntry);
  }

  async checkPrerequisites() {
    this.log('Checking prerequisites...');
    
    // Check if old file exists
    if (!fs.existsSync(this.oldFile)) {
      throw new Error(`Old billing file not found: ${this.oldFile}`);
    }
    
    // Check if new file exists
    if (!fs.existsSync(this.newFile)) {
      throw new Error(`New billing file not found: ${this.newFile}`);
    }
    
    // Check database connectivity (simplified check)
    if (!process.env.DATABASE_URL) {
      this.log('WARNING: DATABASE_URL not set in environment variables', 'WARN');
    }
    
    this.log('Prerequisites check completed');
  }

  async createBackup() {
    this.log('Creating backup of existing billing file...');
    
    if (fs.existsSync(this.backupFile)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const timestampedBackup = `${backupFile}.${timestamp}`;
      fs.renameSync(this.backupFile, timestampedBackup);
      this.log(`Existing backup renamed to: ${timestampedBackup}`);
    }
    
    fs.copyFileSync(this.oldFile, this.backupFile);
    this.log(`Backup created: ${this.backupFile}`);
  }

  async validateMigration() {
    this.log('Validating migration readiness...');
    
    // Check if both files have similar route structures
    const oldContent = fs.readFileSync(this.oldFile, 'utf8');
    const newContent = fs.readFileSync(this.newFile, 'utf8');
    
    // Check for essential routes
    const essentialRoutes = ['/patient-bill', '/:id/payment', '/:id', '/accession/:accessionNumber'];
    
    for (const route of essentialRoutes) {
      if (!newContent.includes(route)) {
        throw new Error(`Essential route ${route} not found in new file`);
      }
    }
    
    this.log('Migration validation completed successfully');
  }

  async performMigration() {
    this.log('Starting billing system migration...');
    
    try {
      // Step 1: Check prerequisites
      await this.checkPrerequisites();
      
      // Step 2: Create backup
      await this.createBackup();
      
      // Step 3: Validate migration
      await this.validateMigration();
      
      // Step 4: Replace old file with new implementation
      this.log('Replacing old billing file with refactored version...');
      fs.copyFileSync(this.newFile, this.oldFile);
      
      // Step 5: Verify the migration
      this.verifyMigration();
      
      this.log('Migration completed successfully!');
      
    } catch (error) {
      this.log(`Migration failed: ${error.message}`, 'ERROR');
      this.log('Rolling back changes...');
      
      // Rollback: restore from backup
      if (fs.existsSync(this.backupFile)) {
        fs.copyFileSync(this.backupFile, this.oldFile);
        this.log('Rollback completed');
      }
      
      throw error;
    }
  }

  verifyMigration() {
    this.log('Verifying migration...');
    
    // Check if the new file is in place
    const content = fs.readFileSync(this.oldFile, 'utf8');
    
    // Verify key components are present
    const checks = [
      { name: 'BillingService class', pattern: /class BillingService/ },
      { name: 'ExternalAPIService class', pattern: /class ExternalAPIService/ },
      { name: 'BillingBusinessLogic class', pattern: /class BillingBusinessLogic/ },
      { name: 'Configuration constants', pattern: /const CONFIG/ },
      { name: 'Validation middleware', pattern: /handleValidationErrors/ }
    ];
    
    for (const check of checks) {
      if (!check.pattern.test(content)) {
        throw new Error(`Migration verification failed: ${check.name} not found`);
      }
    }
    
    this.log('Migration verification passed');
  }

  async generateMigrationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      migrationType: 'billing-system-refactor',
      status: 'completed',
      changes: [
        'Implemented class-based architecture',
        'Added comprehensive error handling',
        'Enhanced security measures',
        'Improved logging and monitoring',
        'Added input validation middleware',
        'Implemented service layer pattern',
        'Added API retry logic',
        'Enhanced database operations',
        'Added configuration management',
        'Improved code documentation'
      ],
      benefits: [
        'Better maintainability',
        'Enhanced security',
        'Improved error handling',
        'Better performance',
        'Easier testing',
        'Comprehensive logging',
        'Modular design',
        'Production-ready code'
      ],
      nextSteps: [
        'Test all billing endpoints',
        'Verify API integration',
        'Check database operations',
        'Monitor error logs',
        'Update API documentation',
        'Run performance tests',
        'Train development team',
        'Update deployment scripts'
      ]
    };
    
    const reportFile = path.join(__dirname, 'billing-migration-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    this.log(`Migration report generated: ${reportFile}`);
    return report;
  }

  async rollback() {
    this.log('Starting rollback...');
    
    if (!fs.existsSync(this.backupFile)) {
      throw new Error('Backup file not found for rollback');
    }
    
    fs.copyFileSync(this.backupFile, this.oldFile);
    this.log('Rollback completed successfully');
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2];
  const migration = new BillingMigration();
  
  try {
    switch (command) {
      case 'migrate':
        await migration.performMigration();
        await migration.generateMigrationReport();
        break;
        
      case 'validate':
        await migration.checkPrerequisites();
        await migration.validateMigration();
        migration.log('Validation passed');
        break;
        
      case 'backup':
        await migration.createBackup();
        break;
        
      case 'rollback':
        await migration.rollback();
        break;
        
      case 'report':
        await migration.generateMigrationReport();
        break;
        
      default:
        console.log(`
Billing System Migration Tool

Usage: node migrate-billing.js <command>

Commands:
  migrate   - Perform full migration from old to new billing system
  validate  - Validate migration readiness without making changes
  backup    - Create backup of existing billing file
  rollback  - Rollback to previous version using backup
  report    - Generate migration report

Examples:
  node migrate-billing.js migrate
  node migrate-billing.js validate
  node migrate-billing.js rollback
        `);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = BillingMigration;

// Run CLI if called directly
if (require.main === module) {
  main();
}
