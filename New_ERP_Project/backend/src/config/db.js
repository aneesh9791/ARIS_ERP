const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Date objects.
// Without this, pg converts DATE → JS Date at midnight UTC, which .toISOString()
// shifts one day back for IST (UTC+5:30): '2026-03-23' → 2026-03-22T18:30:00Z → '2026-03-22'.
types.setTypeParser(1082, val => val);          // DATE only; leave TIMESTAMP as-is

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 60000,          // 60s idle before releasing (was 30s)
  connectionTimeoutMillis: 10000,    // 10s to acquire a connection (was 2s — too tight)
  keepAlive: true,                   // TCP keepalive to prevent OS dropping idle connections
  keepAliveInitialDelayMillis: 10000,
});
pool.on('error', (err) => require('./logger').error('Unexpected DB pool error', err));
module.exports = pool;
