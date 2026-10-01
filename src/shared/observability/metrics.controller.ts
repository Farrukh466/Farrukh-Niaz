import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { RateLimit } from '../http/rate-limit';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsRegistry } from './metrics.registry';

@RateLimit('admin')
@Controller('metrics')
@Roles('admin')
export class MetricsController {
  constructor(
    private readonly registry: MetricsRegistry,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async metrics() {
    const now = new Date();
    const [users, chatMessages, activeSubscriptions, failedPayments] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.chatMessage.count(),
        this.prisma.subscription.count({
          where: { status: 'active', endDate: { gt: now } },
        }),
        this.prisma.paymentAttempt.count({ where: { succeeded: false } }),
      ]);
    return {
      ...this.registry.snapshot(),
      business: { users, chatMessages, activeSubscriptions, failedPayments },
    };
  }
}
