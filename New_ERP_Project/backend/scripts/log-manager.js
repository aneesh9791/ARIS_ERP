#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { logger, cleanupLogs } = require('../src/config/logger');

const logsDir = path.join(__dirname, '../logs');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function showHelp() {
  console.log(colorize('ARIS ERP Log Management Tool', 'bright'));
  console.log('');
  console.log('Usage: node scripts/log-manager.js [command] [options]');
  console.log('');
  console.log('Commands:');
  console.log('  status              Show log file status and sizes');
  console.log('  view [file]         View a specific log file');
  console.log('  tail [file] [n]     Show last n lines of a log file (default: 50)');
  console.log('  search [term] [file] Search for term in log files');
  console.log('  cleanup             Clean up old log files');
  console.log('  rotate              Force log rotation');
  console.log('  error               Show only error logs');
  console.log('  access              Show access logs');
  console.log('  combined            Show combined logs');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/log-manager.js status');
  console.log('  node scripts/log-manager.js view error.log');
  console.log('  node scripts/log-manager.js tail combined.log 100');
  console.log('  node scripts/log-manager.js search "database"');
  console.log('  node scripts/log-manager.js error');
}

function showStatus() {
  console.log(colorize('📊 Log Files Status', 'bright'));
  console.log('');
  
  if (!fs.existsSync(logsDir)) {
    console.log(colorize('❌ Logs directory does not exist', 'red'));
    return;
  }
  
  const files = fs.readdirSync(logsDir);
  const logFiles = files.filter(file => file.endsWith('.log'));
  
  if (logFiles.length === 0) {
    console.log(colorize('📭 No log files found', 'yellow'));
    return;
  }
  
  let totalSize = 0;
  
  console.log(colorize('File Name', 'cyan').padEnd(25) + 
             colorize('Size', 'magenta').padEnd(12) + 
             colorize('Modified', 'green'));
  console.log('─'.repeat(60));
  
  logFiles.forEach(file => {
    const filePath = path.join(logsDir, file);
    const stats = fs.statSync(filePath);
    const size = (stats.size / 1024).toFixed(2) + ' KB';
    const modified = stats.mtime.toLocaleString();
    
    totalSize += stats.size;
    
    console.log(file.padEnd(25) + size.padEnd(12) + modified);
  });
  
  console.log('─'.repeat(60));
  console.log(colorize('Total:', 'bright') + ' '.repeat(17) + 
             (totalSize / 1024).toFixed(2) + ' KB');
}

function viewLogFile(filename, lines = null) {
  const filePath = path.join(logsDir, filename);
  
  if (!fs.existsSync(filePath)) {
    console.log(colorize(`❌ Log file not found: ${filename}`, 'red'));
    return;
  }
  
  console.log(colorize(`📄 Viewing: ${filename}`, 'bright'));
  console.log('─'.repeat(80));
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const logLines = content.split('\n').filter(line => line.trim());
    
    if (lines) {
      const tailLines = logLines.slice(-lines);
      tailLines.forEach(line => {
        console.log(formatLogLine(line));
      });
    } else {
      logLines.forEach(line => {
        console.log(formatLogLine(line));
      });
    }
  } catch (error) {
    console.log(colorize(`❌ Error reading file: ${error.message}`, 'red'));
  }
}

function formatLogLine(line) {
  try {
    // Try to parse as JSON
    const logEntry = JSON.parse(line);
    const timestamp = logEntry.timestamp || logEntry.time || '';
    const level = logEntry.level || logEntry.severity || 'info';
    const message = logEntry.message || '';
    const category = logEntry.category || '';
    
    let coloredLine = '';
    
    // Color code by level
    switch (level.toLowerCase()) {
      case 'error':
        coloredLine += colorize('[ERROR]', 'red');
        break;
      case 'warn':
      case 'warning':
        coloredLine += colorize('[WARN]', 'yellow');
        break;
      case 'info':
        coloredLine += colorize('[INFO]', 'green');
        break;
      case 'debug':
        coloredLine += colorize('[DEBUG]', 'cyan');
        break;
      case 'http':
        coloredLine += colorize('[HTTP]', 'magenta');
        break;
      default:
        coloredLine += colorize(`[${level.toUpperCase()}]`, 'blue');
    }
    
    if (timestamp) coloredLine += ` ${colorize(timestamp, 'blue')}`;
    if (category) coloredLine += ` ${colorize(`[${category}]`, 'cyan')}`;
    if (message) coloredLine += ` ${message}`;
    
    return coloredLine;
  } catch (error) {
    // Not JSON, return as-is
    return line;
  }
}

function tailLogFile(filename, lines = 50) {
  viewLogFile(filename, lines);
}

function searchLogs(term, filename = null) {
  console.log(colorize(`🔍 Searching for: "${term}"`, 'bright'));
  console.log('─'.repeat(80));
  
  const files = filename ? [filename] : fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
  let matches = 0;
  
  files.forEach(file => {
    const filePath = path.join(logsDir, file);
    if (!fs.existsSync(filePath)) return;
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      let fileMatches = 0;
      lines.forEach(line => {
        if (line.toLowerCase().includes(term.toLowerCase())) {
          console.log(colorize(`📁 ${file}:`, 'cyan'));
          console.log(formatLogLine(line));
          console.log('');
          fileMatches++;
          matches++;
        }
      });
      
      if (fileMatches > 0) {
        console.log(colorize(`Found ${fileMatches} matches in ${file}`, 'green'));
        console.log('─'.repeat(80));
      }
    } catch (error) {
      console.log(colorize(`❌ Error reading ${file}: ${error.message}`, 'red'));
    }
  });
  
  console.log(colorize(`\n🎯 Total matches: ${matches}`, 'bright'));
}

function showErrorLogs() {
  viewLogFile('error.log');
}

function showAccessLogs() {
  viewLogFile('access.log');
}

function showCombinedLogs() {
  viewLogFile('combined.log');
}

function performCleanup() {
  console.log(colorize('🧹 Cleaning up old log files...', 'yellow'));
  cleanupLogs();
  console.log(colorize('✅ Cleanup completed', 'green'));
}

// Main execution
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'status':
    showStatus();
    break;
  case 'view':
    if (!args[0]) {
      console.log(colorize('❌ Please specify a log file', 'red'));
      showHelp();
      process.exit(1);
    }
    viewLogFile(args[0]);
    break;
  case 'tail':
    if (!args[0]) {
      console.log(colorize('❌ Please specify a log file', 'red'));
      showHelp();
      process.exit(1);
    }
    const lines = parseInt(args[1]) || 50;
    tailLogFile(args[0], lines);
    break;
  case 'search':
    if (!args[0]) {
      console.log(colorize('❌ Please specify a search term', 'red'));
      showHelp();
      process.exit(1);
    }
    searchLogs(args[0], args[1]);
    break;
  case 'cleanup':
    performCleanup();
    break;
  case 'error':
    showErrorLogs();
    break;
  case 'access':
    showAccessLogs();
    break;
  case 'combined':
    showCombinedLogs();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    console.log(colorize('❌ Unknown command', 'red'));
    showHelp();
    process.exit(1);
}
