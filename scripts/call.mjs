import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [method = 'GET', path = '/auth/me', ...pairs] = process.argv.slice(2);
const token = readFileSync('.token', 'utf8').trim();

function parseValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

let body;
if (pairs.length > 0) {
  const obj = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      console.error(`Bad argument "${pair}" — use key=value`);
      process.exit(1);
    }
    obj[pair.slice(0, eq)] = parseValue(pair.slice(eq + 1));
  }
  body = JSON.stringify(obj);
}

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