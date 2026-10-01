import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const claims = await this.verify(req.headers.authorization);
    await this.replay.consume(claims.subject, req.headers);
    req.user = await this.users.sync(claims);

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (required && !required.includes(req.user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient role for this resource' });
    }
    return true;
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