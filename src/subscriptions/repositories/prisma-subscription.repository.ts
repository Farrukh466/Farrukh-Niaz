import { Subscription as SubscriptionRow } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { Subscription } from '../domain/entities/subscription';
import { PaymentRecord, SubscriptionRepository } from '../domain/ports';

function toDomain(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.userId,
    tier: row.tier,
    billingCycle: row.billingCycle,
    maxMessages: row.maxMessages,
    usedMessages: row.usedMessages,
    priceCents: row.priceCents,
    status: row.status,
    autoRenew: row.autoRenew,
    startDate: row.startDate,
    endDate: row.endDate,
    renewalDate: row.renewalDate,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
  };
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(sub: Subscription, payment: PaymentRecord): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.subscription.create({
        data: {
          id: sub.id,
          userId: sub.userId,
          tier: sub.tier,
          billingCycle: sub.billingCycle,
          maxMessages: sub.maxMessages,
          usedMessages: sub.usedMessages,
          priceCents: sub.priceCents,
          status: sub.status,
          autoRenew: sub.autoRenew,
          startDate: sub.startDate,
          endDate: sub.endDate,
          renewalDate: sub.renewalDate,
          createdAt: sub.createdAt,
        },
      }),
      this.prisma.paymentAttempt.create({
        data: {
          userId: sub.userId,
          subscriptionId: sub.id,
          amountCents: payment.amountCents,
          succeeded: payment.succeeded,
          reason: payment.reason,
        },
      }),
    ]);
  }

  async findById(id: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listForUser(userId: string): Promise<Subscription[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findDue(now: Date, limit: number): Promise<Subscription[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { status: 'active', renewalDate: { lte: now } },
      orderBy: { renewalDate: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async transition(previous: Subscription, next: Subscription, payment?: PaymentRecord): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.subscription.updateMany({
        where: { id: previous.id, status: previous.status, renewalDate: previous.renewalDate },
        data: {
          status: next.status,
          autoRenew: next.autoRenew,
          usedMessages: next.usedMessages,
          maxMessages: next.maxMessages,
          priceCents: next.priceCents,
          startDate: next.startDate,
          endDate: next.endDate,
          renewalDate: next.renewalDate,
          cancelledAt: next.cancelledAt,
        },
      });
      if (result.count === 0) {
        return false;
      }
      if (payment) {
        await tx.paymentAttempt.create({
          data: {
            userId: previous.userId,
            subscriptionId: previous.id,
            amountCents: payment.amountCents,
            succeeded: payment.succeeded,
            reason: payment.reason,
          },
        });
      }
      return true;
    });
  }

  async countFreeUsage(userId: string, period: string): Promise<number> {
    return this.prisma.usageRecord.count({ where: { userId, periodMonth: period, isFree: true } });
  }
}