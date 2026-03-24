module.exports = {
  apps: [{
    name: 'aris-backend',
    script: 'src/app.js',
    cwd: '/Volumes/DATA HD/ARIS_ERP/New_ERP_Project/backend',
    instances: 1,
    autorestart: true,          // auto-restart on crash
    watch: false,
    max_memory_restart: '500M', // restart if memory exceeds 500MB
    restart_delay: 2000,        // wait 2s before restarting after crash
    max_restarts: 10,           // stop trying after 10 crashes in a row
    env: {
      NODE_ENV: 'development',
    },
    error_file: '/tmp/aris-backend-error.log',
    out_file:   '/tmp/aris-backend-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
