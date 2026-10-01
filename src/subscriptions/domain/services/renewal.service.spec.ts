import { MockPaymentGateway } from '../../infrastructure/mock-payment.gateway';
import { Subscription, openSubscription } from '../entities/subscription';
import { PaymentRecord, SubscriptionRepository } from '../ports';
import { RenewalService } from './renewal.service';

const admin = { id: 'admin-1', role: 'admin' as const };
const user = { id: 'user-1', role: 'user' as const };
const now = new Date('2026-11-01T10:00:00Z');

class FakeRepo implements SubscriptionRepository {
  transitions: Array<{ next: Subscription; payment?: PaymentRecord }> = [];
  applies = true;

  constructor(private readonly due: Subscription[]) {}

  async create() {}
  async findById() {
    return null;
  }
  async listForUser() {
    return [];
  }
  async findDue() {
    return this.due;
  }
  async transition(
    _previous: Subscription,
    next: Subscription,
    payment?: PaymentRecord,
  ) {
    if (this.applies) {
      this.transitions.push({ next, payment });
    }
    return this.applies;
  }
  async countFreeUsage() {
    return 0;
  }
}

function dueSub(autoRenew: boolean): Subscription {
  const sub = openSubscription(
    'sub-1',
    'user-1',
    'basic',
    'monthly',
    autoRenew,
    new Date('2026-10-01T10:00:00Z'),
  );
  return { ...sub, usedMessages: 7 };
}

describe('RenewalService', () => {
  it('renews when payment succeeds', async () => {
    const repo = new FakeRepo([dueSub(true)]);
    const service = new RenewalService(
      repo,
      new MockPaymentGateway(0.2, () => 0.99),
      () => now,
    );

    const report = await service.runDue(admin);

    expect(report).toMatchObject({ examined: 1, renewed: 1, paymentFailed: 0 });
    expect(repo.transitions[0].next).toMatchObject({
      status: 'active',
      usedMessages: 0,
    });
    expect(repo.transitions[0].payment).toMatchObject({
      succeeded: true,
      amountCents: 999,
    });
  });

  it('marks the subscription inactive when payment fails', async () => {
    const repo = new FakeRepo([dueSub(true)]);
    const service = new RenewalService(
      repo,
      new MockPaymentGateway(0.2, () => 0),
      () => now,
    );

    const report = await service.runDue(admin);

    expect(report).toMatchObject({ renewed: 0, paymentFailed: 1 });
    expect(repo.transitions[0].next.status).toBe('inactive');
    expect(repo.transitions[0].payment).toMatchObject({
      succeeded: false,
      reason: 'card_declined',
    });
  });

  it('expires without charging when auto-renew is off', async () => {
    const repo = new FakeRepo([dueSub(false)]);
    const charge = jest.fn();
    const service = new RenewalService(repo, { charge }, () => now);

    const report = await service.runDue(admin);

    expect(report).toMatchObject({ expired: 1, renewed: 0 });
    expect(charge).not.toHaveBeenCalled();
    expect(repo.transitions[0].next.status).toBe('inactive');
  });

  it('skips a subscription changed by a concurrent run', async () => {
    const repo = new FakeRepo([dueSub(true)]);
    repo.applies = false;
    const service = new RenewalService(
      repo,
      new MockPaymentGateway(0, () => 0.99),
      () => now,
    );

    expect(await service.runDue(admin)).toMatchObject({
      skipped: 1,
      renewed: 0,
    });
  });

  it('refuses non-admins at the policy level', async () => {
    const service = new RenewalService(
      new FakeRepo([]),
      new MockPaymentGateway(0),
      () => now,
    );
    await expect(service.runDue(user)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
