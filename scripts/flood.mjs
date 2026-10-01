import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? '/auth/me';
const count = Number(process.argv[3] ?? 35);
const token = readFileSync('.token', 'utf8').trim();

const tally = {};
for (let i = 0; i < count; i++) {
  const res = await fetch(`http://localhost:3000${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Request-Nonce': randomUUID(),
      'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
    },
  });
  tally[res.status] = (tally[res.status] ?? 0) + 1;
  if (res.status === 429 && !tally.firstRetryAfter) {
    tally.firstRetryAfter = res.headers.get('retry-after');
  }
}
console.log(tally);