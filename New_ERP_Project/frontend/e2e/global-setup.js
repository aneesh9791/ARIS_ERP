const { request } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const API   = 'http://localhost:3003';
const CREDS = { email: 'admin@aris.com', password: 'admin123' };
const TOKEN_FILE = path.join(__dirname, '.auth-token.json');

module.exports = async () => {
  const context = await request.newContext();
  const resp = await context.post(`${API}/api/auth/login`, {
    data: CREDS,
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await resp.json();
  if (!body.token) throw new Error('Global setup login failed: ' + JSON.stringify(body));
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: body.token }));
  await context.dispose();
};
