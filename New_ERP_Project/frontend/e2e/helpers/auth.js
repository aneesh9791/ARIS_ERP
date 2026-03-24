/**
 * Sets a mock auth token in localStorage so pages that check for a token
 * treat the browser as authenticated.
 */
async function mockAuth(page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-session-token-12345');
    localStorage.setItem('user', JSON.stringify({
      id: '1',
      username: 'admin',
      email: 'admin@aris.com',
      role: 'ADMIN',
    }));
  });
}

module.exports = { mockAuth };
