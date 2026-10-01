import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWTVerifyGetKey, jwtVerify } from 'jose';
import { Env } from '../config/env';

export const JWKS = Symbol('JWKS');
const CLAIM_NAMESPACE = 'https://chat-quota-api/';

export interface VerifiedClaims {
  subject: string;
  email: string | undefined;
  roles: string[];
}

export abstract class TokenVerifier {
  abstract verify(token: string): Promise<VerifiedClaims>;
}

@Injectable()
export class JoseTokenVerifier extends TokenVerifier {
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    @Inject(JWKS) private readonly keys: JWTVerifyGetKey,
    config: ConfigService<Env, true>,
  ) {
    super();
    this.issuer = config.get('AUTH_ISSUER_URL', { infer: true });
    this.audience = config.get('AUTH_AUDIENCE', { infer: true });
  }

  async verify(token: string): Promise<VerifiedClaims> {
    const { payload } = await jwtVerify(token, this.keys, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ['RS256'],
      clockTolerance: 5,
      requiredClaims: ['sub', 'exp', 'iat'],
    });

    const email = payload[`${CLAIM_NAMESPACE}email`];
    const roles = payload[`${CLAIM_NAMESPACE}roles`];

    return {
      subject: payload.sub as string,
      email: typeof email === 'string' ? email : undefined,
      roles: Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [],
    };
  }
}