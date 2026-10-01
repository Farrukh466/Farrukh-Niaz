import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../shared/config/env';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AdminSubscriptionsController } from './controllers/admin-subscriptions.controller';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { PaymentGateway, SubscriptionRepository } from './domain/ports';
import { RenewalService } from './domain/services/renewal.service';
import { SubscriptionService } from './domain/services/subscription.service';
import { MockPaymentGateway } from './infrastructure/mock-payment.gateway';
import { PrismaSubscriptionRepository } from './repositories/prisma-subscription.repository';

export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

@Module({
  controllers: [SubscriptionsController, AdminSubscriptionsController],
  providers: [
    {
      provide: SUBSCRIPTION_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) =>
        new PrismaSubscriptionRepository(prisma),
    },
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new MockPaymentGateway(
          config.get('PAYMENT_FAILURE_RATE', { infer: true }),
        ),
    },
    {
      provide: SubscriptionService,
      inject: [SUBSCRIPTION_REPOSITORY],
      useFactory: (repo: SubscriptionRepository) =>
        new SubscriptionService(repo),
    },
    {
      provide: RenewalService,
      inject: [SUBSCRIPTION_REPOSITORY, PAYMENT_GATEWAY],
      useFactory: (repo: SubscriptionRepository, payments: PaymentGateway) =>
        new RenewalService(repo, payments),
    },
  ],
})
export class SubscriptionsModule {}
