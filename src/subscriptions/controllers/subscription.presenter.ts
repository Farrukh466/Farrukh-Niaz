import { Subscription, remainingMessages } from '../domain/entities/subscription';

export function presentSubscription(sub: Subscription) {
  return {
    id: sub.id,
    tier: sub.tier,
    billingCycle: sub.billingCycle,
    status: sub.status,
    autoRenew: sub.autoRenew,
    priceCents: sub.priceCents,
    maxMessages: sub.maxMessages,
    usedMessages: sub.usedMessages,
    remainingMessages: remainingMessages(sub),
    startDate: sub.startDate.toISOString(),
    endDate: sub.endDate.toISOString(),
    renewalDate: sub.renewalDate.toISOString(),
    cancelledAt: sub.cancelledAt ? sub.cancelledAt.toISOString() : null,
  };
}