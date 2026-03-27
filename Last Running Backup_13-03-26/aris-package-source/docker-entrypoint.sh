#!/usr/bin/env bash
set -Eeuo pipefail

echo "==> ARIS: validating environment"
required=(DATABASE_URL SESSION_SECRET PORT NODE_ENV)
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "==> ARIS ERROR: missing env var: $key"
    exit 1
  fi
done

echo "==> ARIS: waiting for database"
for i in {1..30}; do
  if node -e "const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL, ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false}); p.query('select 1').then(()=>{console.log('ok'); p.end(); process.exit(0)}).catch(()=>{p.end(); process.exit(1)})" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

ROW_COUNT=$(node -e "const { Pool } = require('pg'); const p = new Pool({connectionString:process.env.DATABASE_URL, ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false}); p.query('SELECT COUNT(*) AS n FROM users').then(r=>{console.log(r.rows[0].n); return p.end()}).catch(async()=>{console.log('0'); try{await p.end()}catch(e){}})")
if [[ "$ROW_COUNT" == "0" ]]; then
  echo "==> ARIS: running seed.js"
  node /app/seed.js
else
  echo "==> ARIS: seed skipped; users found: $ROW_COUNT"
fi

echo "==> ARIS: starting server"
exec node /app/server.js
