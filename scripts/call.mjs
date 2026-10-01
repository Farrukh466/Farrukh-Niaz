import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [method = 'GET', path = '/auth/me', body] = process.argv.slice(2);
const token = readFileSync('.token', 'utf8').trim();

const headers = {
  Authorization: `Bearer ${token}`,
  'X-Request-Nonce': process.env.NONCE ?? randomUUID(),
  'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
};
if (body) headers['Content-Type'] = 'application/json';

const res = await fetch(`http://localhost:3000${path}`, { method, headers, body });
const text = await res.text();
console.log(res.status);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}