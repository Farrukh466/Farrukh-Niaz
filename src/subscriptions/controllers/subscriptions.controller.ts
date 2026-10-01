import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthUser } from '../../shared/auth/auth.types';
import { CurrentUser } from '../../shared/auth/decorators';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { SubscriptionService } from '../domain/services/subscription.service';
import { presentSubscription } from './subscription.presenter';
import {
  CreateSubscriptionDto,
  CreateSubscriptionSchema,
  UpdateSubscriptionDto,
  UpdateSubscriptionSchema,
} from './subscription.schemas';
import { RateLimit } from '../../shared/http/rate-limit';

@RateLimit('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateSubscriptionSchema))
    body: CreateSubscriptionDto,
  ) {
    return presentSubscription(await this.subscriptions.create(user, body));
  }

  @Get()
  async listMine(@CurrentUser() user: AuthUser) {
    const subs = await this.subscriptions.listFor(user, user.id);
    return subs.map(presentSubscription);
  }

  @Get('usage')
  async usage(@CurrentUser() user: AuthUser) {
    const summary = await this.subscriptions.usage(user);
    return {
      ...summary,
      subscriptions: summary.subscriptions.map((s) => ({
        ...s,
        endDate: s.endDate.toISOString(),
      })),
    };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateSubscriptionSchema))
    body: UpdateSubscriptionDto,
  ) {
    return presentSubscription(
      await this.subscriptions.setAutoRenew(user, id, body.autoRenew),
    );
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return presentSubscription(await this.subscriptions.cancel(user, id));
  }
}
