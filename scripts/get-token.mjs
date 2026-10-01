import { writeFileSync } from 'node:fs';

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: node --env-file=.env scripts/get-token.mjs <email> <password>');
  process.exit(1);
}

const { AUTH_ISSUER_URL, AUTH_AUDIENCE, TEST_CLIENT_ID, TEST_CLIENT_SECRET } = process.env;

const res = await fetch(new URL('oauth/token', AUTH_ISSUER_URL), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'password',
    username,
    password,
    audience: AUTH_AUDIENCE,
    client_id: TEST_CLIENT_ID,
    client_secret: TEST_CLIENT_SECRET,
    scope: 'openid',
  }),
});

const data = await res.json();
if (!res.ok) {
  console.error(data);
  process.exit(1);
}
writeFileSync('.token', data.access_token);
console.log(`Token for ${username} saved to .token`);