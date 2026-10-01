import { DomainError } from '../../../shared/errors/domain-error';
import { BillingCycle, Tier, addCycle, planFor } from './plan';

export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled';

export interface Subscription {
  id: string;
  userId: string;
  tier: Tier;
  billingCycle: BillingCycle;
  maxMessages: number | null;
  usedMessages: number;
  priceCents: number;
  status: SubscriptionStatus;
  autoRenew: boolean;
  startDate: Date;
  endDate: Date;
  renewalDate: Date;
  cancelledAt: Date | null;
  createdAt: Date;
}

export function remainingMessages(sub: Subscription): number | null {
  return sub.maxMessages === null
    ? null
    : Math.max(0, sub.maxMessages - sub.usedMessages);
}

export function openSubscription(
  id: string,
  userId: string,
  tier: Tier,
  billingCycle: BillingCycle,
  autoRenew: boolean,
  now: Date,
): Subscription {
  const plan = planFor(tier, billingCycle);
  const end = addCycle(now, billingCycle);
  return {
    id,
    userId,
    tier,
    billingCycle,
    maxMessages: plan.maxMessages,
    usedMessages: 0,
    priceCents: plan.priceCents,
    status: 'active',
    autoRenew,
    startDate: now,
    endDate: end,
    renewalDate: end,
    cancelledAt: null,
    createdAt: now,
  };
}

export function cancelSubscription(sub: Subscription, now: Date): Subscription {
  if (sub.status !== 'active') {
    throw new DomainError(
      'INVALID_STATE',
      `Cannot cancel a ${sub.status} subscription`,
    );
  }
  const end = sub.endDate < now ? sub.endDate : now;
  return {
    ...sub,
    status: 'cancelled',
    autoRenew: false,
    cancelledAt: now,
    endDate: end,
    renewalDate: end,
  };
}

export function withAutoRenew(
  sub: Subscription,
  autoRenew: boolean,
): Subscription {
  if (sub.status !== 'active') {
    throw new DomainError(
      'INVALID_STATE',
      `Cannot change auto-renew on a ${sub.status} subscription`,
    );
  }
  return { ...sub, autoRenew };
}

export function renewSubscription(sub: Subscription, now: Date): Subscription {
  const end = addCycle(now, sub.billingCycle);
  const plan = planFor(sub.tier, sub.billingCycle);
  return {
    ...sub,
    status: 'active',
    usedMessages: 0,
    maxMessages: plan.maxMessages,
    priceCents: plan.priceCents,
    startDate: now,
    endDate: end,
    renewalDate: end,
  };
}

export function markPaymentFailed(sub: Subscription): Subscription {
  return { ...sub, status: 'inactive' };
}

export function expireSubscription(sub: Subscription): Subscription {
  return { ...sub, status: 'inactive' };
}
