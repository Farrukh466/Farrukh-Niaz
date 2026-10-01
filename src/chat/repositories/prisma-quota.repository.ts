import { PrismaService } from '../../shared/prisma/prisma.service';
import { QuotaReservation } from '../domain/entities/quota';
import { QuotaRepository } from '../domain/ports';

export class PrismaQuotaRepository implements QuotaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(
    userId: string,
    messageId: string,
    period: string,
    freeLimit: number,
  ): Promise<QuotaReservation | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const freeUsed = await tx.usageRecord.count({
        where: { userId, periodMonth: period, isFree: true },
      });

      if (freeUsed < freeLimit) {
        const usage = await tx.usageRecord.create({
          data: { userId, periodMonth: period, isFree: true, chatMessageId: messageId },
        });
        return { usageId: usage.id, messageId, source: { kind: 'free' } };
      }

      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Subscription"
        SET "usedMessages" = "usedMessages" + 1, "updatedAt" = now()
        WHERE id = (
          SELECT id FROM "Subscription"
          WHERE "userId" = ${userId}
            AND status = 'active'
            AND "startDate" <= now()
            AND "endDate" > now()
            AND ("maxMessages" IS NULL OR "usedMessages" < "maxMessages")
          ORDER BY "startDate" DESC, "createdAt" DESC
          LIMIT 1
          FOR UPDATE
        )
        RETURNING id`;

      if (rows.length === 0) {
        return null;
      }

      const subscriptionId = rows[0].id;
      const usage = await tx.usageRecord.create({
        data: { userId, subscriptionId, periodMonth: period, isFree: false, chatMessageId: messageId },
      });
      return { usageId: usage.id, messageId, source: { kind: 'subscription', subscriptionId } };
    });
  }

  async release(reservation: QuotaReservation): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.usageRecord.delete({ where: { id: reservation.usageId } });
      if (reservation.source.kind === 'subscription') {
        await tx.subscription.update({
          where: { id: reservation.source.subscriptionId },
          data: { usedMessages: { decrement: 1 } },
        });
      }
    });
  }
}