import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import {
  FixedWindowRateLimiter,
  RATE_LIMITS,
  RATE_LIMIT_KEY,
  RateLimitGroup,
  RateLimitRule,
} from '../http/rate-limit';
import { AuthenticatedRequest, Role } from './auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import { ReplayProtectionService } from './replay-protection.service';
import { TokenVerifier, VerifiedClaims } from './token-verifier';
import { UserSyncService } from './user-sync.service';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly replay: ReplayProtectionService,
    private readonly users: UserSyncService,
    private readonly limiter: FixedWindowRateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const res = http.getResponse<Response>();

    const group = this.reflector.getAllAndOverride<RateLimitGroup | undefined>(RATE_LIMIT_KEY, targets) ?? 'default';
    const limits = RATE_LIMITS[group];
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    this.enforce(`ip:${group}:${ip}`, limits.perIp, res);

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const claims = await this.verify(req.headers.authorization);
    await this.replay.consume(claims.subject, req.headers);
    req.user = await this.users.sync(claims);

    this.enforce(`user:${group}:${req.user.id}`, limits.perUser, res);

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (required && !required.includes(req.user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient role for this resource' });
    }
    return true;
  }

  private enforce(key: string, rule: RateLimitRule, res: Response): void {
    const decision = this.limiter.hit(key, rule);
    res.setHeader('X-RateLimit-Limit', String(rule.limit));
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests, slow down',
          details: { retryAfterSeconds: decision.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async verify(header: string | undefined): Promise<VerifiedClaims> {
    const [scheme, token] = (header ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException({ code: 'MISSING_TOKEN', message: 'Bearer access token required' });
    }
    try {
      return await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Access token is invalid or expired' });
    }
  }
}