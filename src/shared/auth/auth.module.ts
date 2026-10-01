import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { createRemoteJWKSet } from 'jose';
import { Env } from '../config/env';
import { FixedWindowRateLimiter } from '../http/rate-limit';
import { AccessGuard } from './access.guard';
import { AuthController } from './auth.controller';
import { ReplayProtectionService } from './replay-protection.service';
import { JWKS, JoseTokenVerifier, TokenVerifier } from './token-verifier';
import { UserSyncService } from './user-sync.service';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: JWKS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createRemoteJWKSet(new URL('.well-known/jwks.json', config.get('AUTH_ISSUER_URL', { infer: true }))),
    },
    { provide: TokenVerifier, useClass: JoseTokenVerifier },
    { provide: FixedWindowRateLimiter, useValue: new FixedWindowRateLimiter() },
    ReplayProtectionService,
    UserSyncService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AuthModule {}