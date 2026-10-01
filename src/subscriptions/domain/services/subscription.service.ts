import { randomUUID } from 'node:crypto';
import {
  FREE_MESSAGES_PER_MONTH,
  billingPeriod,
} from '../../../chat/domain/entities/quota';
import { Actor } from '../../../shared/domain/actor';
import { DomainError } from '../../../shared/errors/domain-error';
import { BillingCycle, Tier } from '../entities/plan';
import {
  Subscription,
  cancelSubscription,
  openSubscription,
  remainingMessages,
  withAutoRenew,
} from '../entities/subscription';
import { SubscriptionPolicy } from '../policies/subscription.policy';
import { SubscriptionRepository } from '../ports';

export interface CreateSubscriptionInput {
  tier: Tier;
  billingCycle: BillingCycle;
  autoRenew: boolean;
}

export interface UsageSummary {
  period: string;
  free: { limit: number; used: number; remaining: number };
  subscriptions: Array<{
    id: string;
    tier: Tier;
    remaining: number | null;
    endDate: Date;
  }>;
}

export class SubscriptionService {
  constructor(
    private readonly subs: SubscriptionRepository,
    private readonly newId: () => string = randomUUID,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(
    actor: Actor,
    input: CreateSubscriptionInput,
  ): Promise<Subscription> {
    const sub = openSubscription(
      this.newId(),
      actor.id,
      input.tier,
      input.billingCycle,
      input.autoRenew,
      this.clock(),
    );
    await this.subs.create(sub, {
      amountCents: sub.priceCents,
      succeeded: true,
    });
    return sub;
  }

  async listFor(actor: Actor, userId: string): Promise<Subscription[]> {
    SubscriptionPolicy.assertCanViewUser(actor, userId);
    return this.subs.listForUser(userId);
  }

  async cancel(actor: Actor, id: string): Promise<Subscription> {
    const current = await this.load(actor, id);
    const next = cancelSubscription(current, this.clock());
    await this.commit(current, next);
    return next;
  }

  async setAutoRenew(
    actor: Actor,
    id: string,
    autoRenew: boolean,
  ): Promise<Subscription> {
    const current = await this.load(actor, id);
    const next = withAutoRenew(current, autoRenew);
    await this.commit(current, next);
    return next;
  }

  async usage(actor: Actor): Promise<UsageSummary> {
    const now = this.clock();
    const period = billingPeriod(now);
    const used = await this.subs.countFreeUsage(actor.id, period);
    const active = (await this.subs.listForUser(actor.id)).filter(
      (s) => s.status === 'active' && s.startDate <= now && s.endDate > now,
    );
    return {
      period,
      free: {
        limit: FREE_MESSAGES_PER_MONTH,
        used,
        remaining: Math.max(0, FREE_MESSAGES_PER_MONTH - used),
      },
      subscriptions: active.map((s) => ({
        id: s.id,
        tier: s.tier,
        remaining: remainingMessages(s),
        endDate: s.endDate,
      })),
    };
  }

  private async load(actor: Actor, id: string): Promise<Subscription> {
    const sub = await this.subs.findById(id);
    if (!sub) {
      throw new DomainError('NOT_FOUND', 'Subscription not found');
    }
    SubscriptionPolicy.assertCanManage(actor, sub);
    return sub;
  }

  private async commit(
    current: Subscription,
    next: Subscription,
  ): Promise<void> {
    const applied = await this.subs.transition(current, next);
    if (!applied) {
      throw new DomainError(
        'CONFLICT',
        'Subscription changed concurrently; retry the request',
      );
    }
  }
}
