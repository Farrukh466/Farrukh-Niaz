import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, Role } from './auth.types';
import { VerifiedClaims } from './token-verifier';

@Injectable()
export class UserSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(claims: VerifiedClaims): Promise<AuthUser> {
    if (!claims.email) {
      throw new UnauthorizedException({ code: 'MISSING_EMAIL_CLAIM', message: 'Token has no email claim' });
    }
    const role: Role = claims.roles.includes('admin') ? 'admin' : 'user';

    const row = await this.prisma.user.upsert({
      where: { externalId: claims.subject },
      create: { externalId: claims.subject, email: claims.email, role },
      update: { email: claims.email, role },
    });

    return { id: row.id, externalId: row.externalId, email: row.email, role };
  }
}