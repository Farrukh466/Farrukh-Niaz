import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const count = Number(process.argv[2] ?? 5);
const token = readFileSync('.token', 'utf8').trim();

const send = (i) =>
  fetch('http://localhost:3000/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Request-Nonce': randomUUID(),
      'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body: JSON.stringify({ question: `Parallel question ${i}` }),
  }).then(async (res) => ({ status: res.status, body: await res.json() }));

const results = await Promise.all(Array.from({ length: count }, (_, i) => send(i)));
for (const r of results) {
  console.log(r.status, r.body.quota?.kind ?? r.body.error?.code);
}