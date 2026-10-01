import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import {
  JWK,
  KeyLike,
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { AuthModule } from '../src/shared/auth/auth.module';
import { AuthUser } from '../src/shared/auth/auth.types';
import { CurrentUser, Public, Roles } from '../src/shared/auth/decorators';
import { JWKS } from '../src/shared/auth/token-verifier';
import { AllExceptionsFilter } from '../src/shared/errors/all-exceptions.filter';
import {
  FixedWindowRateLimiter,
  RateLimit,
} from '../src/shared/http/rate-limit';
import { PrismaModule } from '../src/shared/prisma/prisma.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';

const ISSUER = 'https://test-tenant.example.com/';
const AUDIENCE = 'https://chat-quota-api';
const NS = 'https://chat-quota-api/';

@Controller('probe')
class ProbeController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Roles('admin')
  @Get('admin')
  admin() {
    return { ok: true };
  }

  @RateLimit('chat')
  @Get('limited')
  limited() {
    return { ok: true };
  }

  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }
}

function createFakePrisma() {
  const nonces = new Set<string>();
  const users = new Map<
    string,
    { id: string; externalId: string; email: string; role: string }
  >();
  return {
    requestNonce: {
      create: async ({ data }: { data: { nonce: string } }) => {
        if (nonces.has(data.nonce)) {
          throw new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        nonces.add(data.nonce);
        return data;
      },
      deleteMany: async () => ({ count: 0 }),
    },
    user: {
      upsert: async ({ where, create, update }: any) => {
        const existing = users.get(where.externalId);
        const row = existing
          ? { ...existing, ...update }
          : { id: randomUUID(), ...create };
        users.set(where.externalId, row);
        return row;
      },
    },
  };
}

describe('Protected endpoints (mocked identity provider)', () => {
  let signingKey: KeyLike;
  let attackerKey: KeyLike;
  let jwks: ReturnType<typeof createLocalJWKSet>;
  let app: INestApplication;

  beforeAll(async () => {
    process.env.AUTH_ISSUER_URL = ISSUER;
    process.env.AUTH_AUDIENCE = AUDIENCE;
    process.env.NONCE_WINDOW_SECONDS = '300';
    const real = await generateKeyPair('RS256');
    const attacker = await generateKeyPair('RS256');
    signingKey = real.privateKey;
    attackerKey = attacker.privateKey;
    const publicJwk: JWK = {
      ...(await exportJWK(real.publicKey)),
      kid: 'test-key',
      alg: 'RS256',
    };
    jwks = createLocalJWKSet({ keys: [publicJwk] });
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              AUTH_ISSUER_URL: ISSUER,
              AUTH_AUDIENCE: AUDIENCE,
              NONCE_WINDOW_SECONDS: 300,
            }),
          ],
        }),
        PrismaModule,
        AuthModule,
      ],
      controllers: [ProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma())
      .overrideProvider(JWKS)
      .useValue(jwks)
      .overrideProvider(FixedWindowRateLimiter)
      .useValue(new FixedWindowRateLimiter())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  interface MintOptions {
    roles?: string[];
    issuer?: string;
    audience?: string;
    key?: KeyLike;
    expiresAt?: number;
  }

  function mint(options: MintOptions = {}): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return new SignJWT({
      [`${NS}email`]: 'tester@example.com',
      [`${NS}roles`]: options.roles ?? [],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('auth0|tester')
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? AUDIENCE)
      .setIssuedAt(nowSeconds - 10)
      .setExpirationTime(options.expiresAt ?? nowSeconds + 300)
      .sign(options.key ?? signingKey);
  }

  function signed(
    token: string,
    nonce: string = randomUUID(),
    timestamp = Math.floor(Date.now() / 1000),
  ) {
    return {
      Authorization: `Bearer ${token}`,
      'X-Request-Nonce': nonce,
      'X-Request-Timestamp': String(timestamp),
    };
  }

  it('rejects requests without a token', async () => {
    const res = await request(app.getHttpServer()).get('/probe/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });

  it('accepts a valid token and provisions the user', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/me')
      .set(signed(await mint()));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      externalId: 'auth0|tester',
      email: 'tester@example.com',
      role: 'user',
    });
  });

  it.each([
    ['wrong audience', { audience: 'https://someone-else' }],
    ['wrong issuer', { issuer: 'https://evil.example.com/' }],
    ['expired', { expiresAt: Math.floor(Date.now() / 1000) - 60 }],
  ])('rejects a token with %s', async (_label, options) => {
    const res = await request(app.getHttpServer())
      .get('/probe/me')
      .set(signed(await mint(options)));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token signed by a key the provider does not publish', async () => {
    const forged = await mint({ key: attackerKey });
    const res = await request(app.getHttpServer())
      .get('/probe/me')
      .set(signed(forged));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a valid token without a nonce', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/me')
      .set({ Authorization: `Bearer ${await mint()}` });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_NONCE');
  });

  it('rejects a stale timestamp', async () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const res = await request(app.getHttpServer())
      .get('/probe/me')
      .set(signed(await mint(), randomUUID(), stale));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('STALE_REQUEST');
  });

  it('rejects a replayed request', async () => {
    const token = await mint();
    const nonce = randomUUID();
    const first = await request(app.getHttpServer())
      .get('/probe/me')
      .set(signed(token, nonce));
    const replay = await request(app.getHttpServer())
      .get('/probe/me')
      .set(signed(token, nonce));
    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REPLAYED_REQUEST');
  });

  it('enforces roles at the controller level', async () => {
    const asUser = await request(app.getHttpServer())
      .get('/probe/admin')
      .set(signed(await mint()));
    const asAdmin = await request(app.getHttpServer())
      .get('/probe/admin')
      .set(signed(await mint({ roles: ['admin'] })));
    expect(asUser.status).toBe(403);
    expect(asAdmin.status).toBe(200);
  });

  it('serves explicitly public routes without a token', async () => {
    const res = await request(app.getHttpServer()).get('/probe/open');
    expect(res.status).toBe(200);
  });

  it('rate limits per user and returns Retry-After', async () => {
    const token = await mint();
    const statuses: number[] = [];
    let retryAfter: string | undefined;
    for (let i = 0; i < 11; i++) {
      const res = await request(app.getHttpServer())
        .get('/probe/limited')
        .set(signed(token));
      statuses.push(res.status);
      if (res.status === 429) retryAfter = res.headers['retry-after'];
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses[10]).toBe(429);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});
