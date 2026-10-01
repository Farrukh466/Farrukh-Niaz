# Chat Quota Backend

A NestJS + PostgreSQL backend for an AI chat service with monthly free quotas, paid
subscription bundles, simulated billing and renewals. Authentication is delegated to
Auth0; the service only verifies tokens.

## Quick start

**Requirements:** Node.js 22, PostgreSQL 14+, an Auth0 tenant (free tier is enough).

```bash
npm install
cp .env.example .env            # then fill in the values below
npx prisma migrate deploy
npm run start:dev
```

Health check: `curl http://localhost:3000/health` → `{"status":"ok"}`

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_ISSUER_URL` | Auth0 tenant URL with trailing slash, e.g. `https://dev-xxxx.us.auth0.com/` |
| `AUTH_AUDIENCE` | Auth0 API identifier, e.g. `https://chat-quota-api` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `REQUEST_TIMEOUT_MS` | Global request timeout (default 10000) |
| `BODY_LIMIT` | Max JSON body size (default `10kb`) |
| `NONCE_WINDOW_SECONDS` | Allowed clock skew for signed requests (default 300) |
| `MOCK_AI_MIN_LATENCY_MS` / `MOCK_AI_MAX_LATENCY_MS` | Simulated AI latency range |
| `PAYMENT_FAILURE_RATE` | Probability a simulated renewal charge fails (default 0.2) |
| `TEST_CLIENT_ID` / `TEST_CLIENT_SECRET` | Only for the local helper scripts, never used by the server |

Configuration is validated with Zod at startup; the app refuses to start on a missing or malformed value.

### Auth0 setup

1. **APIs → Create API** — identifier `https://chat-quota-api`, RS256.
2. **Authentication → Database** (email/password) and **Social → Google** enabled.
3. **User Management → Roles** — create `admin`.
4. **Actions → Post Login** — add this Action so access tokens carry email and roles:
```js
   exports.onExecutePostLogin = async (event, api) => {
     const ns = 'https://chat-quota-api/';
     api.accessToken.setCustomClaim(ns + 'email', event.user.email);
     api.accessToken.setCustomClaim(ns + 'roles', (event.authorization && event.authorization.roles) || []);
   };
```
5. For local testing: an Application with the **Password** grant enabled, authorized for
   user-delegated access to the API, and tenant **Default Directory** set to
   `Username-Password-Authentication`.

### Calling the API locally

Every request needs a bearer token **plus** a one-time nonce and timestamp (see Security).
Two helper scripts handle that:

```bash
node --env-file=.env scripts/get-token.mjs user@example.com "password"   # saves .token
node scripts/call.mjs GET /auth/me
node scripts/call.mjs POST /chat question="What is DDD?"
node scripts/call.mjs POST /subscriptions tier=basic billingCycle=monthly autoRenew=true
node scripts/burst.mjs 5          # fires 5 concurrent chat requests
node scripts/flood.mjs /auth/me 35
node --env-file=.env scripts/db.mjs show
```

## API

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/health` | public | Liveness + database check |
| GET | `/auth/me` | user | The authenticated user (provisioned on first call) |
| POST | `/chat` | user | Ask a question; consumes quota |
| GET | `/chat?limit=` | user | Own chat history, newest first |
| GET | `/chat/:id` | owner or admin | One message |
| POST | `/subscriptions` | user | Buy a bundle `{ tier, billingCycle, autoRenew }` |
| GET | `/subscriptions` | user | Own subscriptions |
| GET | `/subscriptions/usage` | user | Free and bundle quota remaining this month |
| PATCH | `/subscriptions/:id` | owner or admin | Toggle `{ autoRenew }` |
| POST | `/subscriptions/:id/cancel` | owner or admin | Cancel |
| GET | `/admin/subscriptions?userId=` | admin | Any user's subscriptions |
| POST | `/admin/subscriptions/renewals/run` | admin | Process due renewals |
| GET | `/metrics` | admin | Request and business metrics |

All errors share one shape:

```json
{ "error": { "code": "QUOTA_EXHAUSTED", "message": "...", "details": {}, "requestId": "...", "path": "/chat", "timestamp": "..." } }
```

| Code | HTTP | Meaning |
|---|---|---|
| `MISSING_TOKEN`, `INVALID_TOKEN` | 401 | No token / bad signature, issuer, audience or expiry |
| `INVALID_NONCE`, `INVALID_TIMESTAMP`, `STALE_REQUEST`, `REPLAYED_REQUEST` | 401 | Replay protection |
| `FORBIDDEN` | 403 | Role or policy denied |
| `NOT_FOUND` | 404 | Missing, or owned by someone else |
| `VALIDATION_FAILED` | 400 | Body or query failed its schema |
| `QUOTA_EXHAUSTED` | 402 | No free messages and no bundle capacity |
| `INVALID_STATE`, `CONFLICT` | 409 | Illegal transition / concurrent modification |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Body is not JSON |
| `RATE_LIMITED` | 429 | With `Retry-After` header |

## Architecture

Domain-driven, layered per bounded context:

```
src/
  chat/
    domain/entities      ChatMessage, quota rules (FREE_MESSAGES_PER_MONTH, billing period)
    domain/services      ChatService — reserve quota, call AI, persist, refund on failure
    domain/policies      ChatPolicy — who may read a message
    domain/ports.ts      QuotaRepository, ChatRepository, AiClient interfaces
    repositories         Prisma implementations
    infrastructure       MockAiClient
    controllers          HTTP, Zod schemas
  subscriptions/
    domain/entities      Plan catalogue, Subscription + pure state transitions
    domain/services      SubscriptionService, RenewalService
    domain/policies      SubscriptionPolicy
    domain/ports.ts      SubscriptionRepository, PaymentGateway
    repositories         Prisma implementation (optimistic concurrency)
    infrastructure       MockPaymentGateway
    controllers          user and admin controllers
  shared/
    auth                 token verification, replay protection, access guard
    config errors http observability prisma domain
```

**The domain layer imports nothing from NestJS or Prisma.** Domain classes are plain
TypeScript that depend on port interfaces; each `*.module.ts` is the only place where a
Prisma or mock implementation is wired to a domain service (via factory providers).
Swapping Postgres, the AI provider or the payment provider changes one line.

### Key design decisions

**Atomic, concurrency-safe quota.** `POST /chat` runs in three phases:

1. *Reserve* — one transaction that locks the user row (`SELECT … FOR UPDATE`), counts this
   month's free usage, and either records a free message or atomically increments a bundle's
   `usedMessages` with a single `UPDATE … WHERE id = (SELECT … FOR UPDATE) RETURNING id`.
   Concurrent requests for the same user serialize on the row lock, so the free allowance and
   bundle capacity can never be oversold. Verified with `scripts/burst.mjs`: 5 simultaneous
   requests produce exactly 3 free messages.
2. *Call the AI* outside any transaction, so no database lock is held during the 300–1200 ms
   simulated latency.
3. *Persist* the message. If the AI call or the save fails, the reservation is refunded.

**Monthly reset without a scheduler.** Usage rows are keyed by `periodMonth` (`"2026-10"`).
A new month is a new key, so the free allowance resets on the 1st with no background job.

**"Bundle with the latest remaining quota"** is interpreted as the most recently started
active bundle that still has capacity (`ORDER BY startDate DESC`). Enterprise bundles are
unlimited (`maxMessages = NULL`).

**Plans.** Basic 10, Pro 100, Enterprise unlimited messages per month at $9.99 / $49.99 /
$199.99. Yearly gives 12× the messages for 10× the monthly price. Month arithmetic clamps
(Jan 31 + 1 month = Feb 28/29).

**Renewals** run through an admin endpoint (a cron or queue would call the same service in
production). Each due subscription is charged through the mock gateway; a failure marks it
`inactive`, success resets usage and moves the dates one cycle. Subscriptions with auto-renew
off simply expire. Every attempt is recorded in `PaymentAttempt`.

**Optimistic concurrency on subscription changes.** State transitions use
`updateMany({ where: { id, status, renewalDate } })`; if another request changed the row
first, zero rows match and the operation reports a conflict instead of overwriting. Two
concurrent renewal runs cannot renew the same subscription twice.

**Cancellation** sets `status = cancelled`, turns off auto-renew and ends the current cycle
immediately. Usage and payment history are never deleted.

## Security model

| Requirement | Implementation |
|---|---|
| External identity provider | Auth0 (email/password + Google). No passwords stored. |
| Server-side token verification | `jose.jwtVerify` against Auth0's JWKS: signature, `iss`, `aud`, `exp`; RS256 only, so algorithm-downgrade tokens are rejected |
| Token alone is not sufficient | Every request must carry `X-Request-Nonce` (UUID) and `X-Request-Timestamp`. The timestamp must be within ±5 min; the nonce is inserted into a primary-keyed table, so a replayed request is rejected even under concurrency |
| Role-based access | Roles come from the verified token. Enforced twice: `@Roles('admin')` on controllers **and** domain policies (`SubscriptionPolicy.assertCanRunRenewals`), so removing a decorator does not open a hole |
| Ownership | Policies return `NOT_FOUND` for other users' resources, so IDs cannot be probed |
| No open endpoints | The access guard is global (`APP_GUARD`); routes are protected by default. The only `@Public()` route is `/health`, a deliberate exception for load balancers that reveals nothing but `ok` and is still IP rate-limited |
| Validation & mass assignment | Zod schemas with `.strict()` on every body and query; unknown fields such as `role` are rejected |
| Injection | Prisma parameterises all queries, including the raw quota SQL (tagged templates) |
| XSS | Input text is normalised and stripped of HTML tags and control characters; responses are JSON only |
| Rate limiting | Per IP (checked before token verification) and per user, with separate limits for auth, chat, subscription and admin routes; `429` with `Retry-After` |
| Transport & headers | Helmet (CSP, HSTS, `nosniff`, frame options), CORS restricted to `CORS_ORIGINS`, 10 kb body limit, JSON-only content type, global request timeout |
| Logging | Structured JSON (pino) with request ID, user ID and response time; `Authorization` header redacted |
| Secrets | Environment variables only; `.env` and `.token` are git-ignored |

| Route group | Per IP / min | Per user / min |
|---|---|---|
| auth | 20 | 30 |
| chat | 60 | 10 |
| subscriptions | 60 | 20 |
| admin | 30 | 10 |
| default | 100 | 60 |

Because the per-IP check runs first, a single client hits the IP limit before the user limit
on auth routes (observed: 20 × 200, then 429).

## Testing

```bash
npm test            # unit: domain logic
npm run test:e2e    # integration: protected endpoints
npm run test:cov
```

- **Quota:** 3 free → subscription → `QUOTA_EXHAUSTED`; token usage recorded; refund when the
  AI call or the save fails; monthly period rollover.
- **Subscription lifecycle:** plan pricing, month-end clamping, open, cancel, double-cancel
  rejected, renew resets usage.
- **Renewals:** success, payment failure → inactive, auto-renew off → expired, concurrent
  run skipped, non-admin rejected at the policy level.
- **Rate limiter:** limit, block with retry hint, window reset, per-key isolation.
- **Protected endpoints (e2e):** the identity provider is **mocked, not bypassed** — the test
  generates an RSA key pair, signs real JWTs and supplies the public key as the JWKS, so the
  production verification code runs unchanged. Covers missing, wrong-audience,
  wrong-issuer, expired and forged tokens; missing nonce, stale timestamp, replay; role
  enforcement; public route; per-user rate limiting.

Unit tests target the domain layer; auth, replay protection and rate limiting are covered by
the e2e suite, which unit coverage does not count.

## Limitations and what I would do next

- **Rate limiter and metrics are in memory** — correct for one instance; use Redis for
  horizontal scaling.
- **Renewals are triggered manually** — production would run `RenewalService` from a
  scheduler or queue, and pass an idempotency key to the payment provider so a retried
  charge is never billed twice.
- **Stronger proof of possession** — nonce + timestamp blocks replay, but a stolen token can
  still mint fresh nonces. DPoP (sender-constrained tokens, supported by Auth0) would bind
  the token to a client key.
- **Renewal vs. in-flight chat** — a renewal resets `usedMessages` to 0; a chat reserved in
  the same instant could be absorbed by the reset. Locking the user row inside the renewal
  transaction would close this.
- **Account linking** — a Google login and a password login with the same email are two
  Auth0 users; the unique email constraint would reject the second until accounts are linked.

