import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../shared/auth/auth.types';
import { CurrentUser, Roles } from '../../shared/auth/decorators';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RenewalService } from '../domain/services/renewal.service';
import { SubscriptionService } from '../domain/services/subscription.service';
import { presentSubscription } from './subscription.presenter';
import { AdminListQuery, AdminListQuerySchema } from './subscription.schemas';
import { RateLimit } from '../../shared/http/rate-limit';

@RateLimit('admin')
@Controller('admin/subscriptions')
@Roles('admin')
export class AdminSubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly renewals: RenewalService,
  ) {}

  @Get()
  async listForUser(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(AdminListQuerySchema)) query: AdminListQuery,
  ) {
    const subs = await this.subscriptions.listFor(user, query.userId);
    return subs.map(presentSubscription);
  }

  @Post('renewals/run')
  @HttpCode(200)
  async runRenewals(@CurrentUser() user: AuthUser) {
    return this.renewals.runDue(user);
  }
}