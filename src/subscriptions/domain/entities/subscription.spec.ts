import { addCycle, planFor } from './plan';
import {
  cancelSubscription,
  openSubscription,
  remainingMessages,
  renewSubscription,
  withAutoRenew,
} from './subscription';

const now = new Date('2026-10-01T10:00:00Z');

describe('plans', () => {
  it('prices and sizes each tier', () => {
    expect(planFor('basic', 'monthly')).toEqual({
      maxMessages: 10,
      priceCents: 999,
    });
    expect(planFor('pro', 'monthly')).toEqual({
      maxMessages: 100,
      priceCents: 4999,
    });
    expect(planFor('enterprise', 'monthly')).toEqual({
      maxMessages: null,
      priceCents: 19999,
    });
  });

  it('gives yearly plans 12x messages for 10x the price', () => {
    expect(planFor('basic', 'yearly')).toEqual({
      maxMessages: 120,
      priceCents: 9990,
    });
  });

  it('clamps month-end dates instead of overflowing', () => {
    expect(
      addCycle(new Date('2027-01-31T00:00:00Z'), 'monthly').toISOString(),
    ).toBe('2027-02-28T00:00:00.000Z');
    expect(
      addCycle(new Date('2028-01-31T00:00:00Z'), 'monthly').toISOString(),
    ).toBe('2028-02-29T00:00:00.000Z');
    expect(
      addCycle(new Date('2026-10-01T00:00:00Z'), 'yearly').toISOString(),
    ).toBe('2027-10-01T00:00:00.000Z');
  });
});

describe('subscription lifecycle', () => {
  const open = () =>
    openSubscription('sub-1', 'user-1', 'basic', 'monthly', true, now);

  it('opens active with one cycle of dates', () => {
    const sub = open();
    expect(sub.status).toBe('active');
    expect(sub.usedMessages).toBe(0);
    expect(sub.endDate.toISOString()).toBe('2026-11-01T10:00:00.000Z');
    expect(sub.renewalDate).toEqual(sub.endDate);
  });

  it('treats enterprise as unlimited', () => {
    const sub = openSubscription(
      'sub-2',
      'user-1',
      'enterprise',
      'monthly',
      true,
      now,
    );
    expect(remainingMessages(sub)).toBeNull();
  });

  it('cancels: stops renewal, ends the cycle now, keeps usage', () => {
    const used = { ...open(), usedMessages: 4 };
    const later = new Date('2026-10-10T00:00:00Z');
    const cancelled = cancelSubscription(used, later);

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.autoRenew).toBe(false);
    expect(cancelled.endDate).toEqual(later);
    expect(cancelled.cancelledAt).toEqual(later);
    expect(cancelled.usedMessages).toBe(4);
  });

  it('refuses to cancel twice or edit a cancelled subscription', () => {
    const cancelled = cancelSubscription(open(), now);
    expect(() => cancelSubscription(cancelled, now)).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE' }),
    );
    expect(() => withAutoRenew(cancelled, true)).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE' }),
    );
  });

  it('renews: resets usage and moves dates forward one cycle', () => {
    const used = { ...open(), usedMessages: 10 };
    const renewalTime = new Date('2026-11-01T10:00:00Z');
    const renewed = renewSubscription(used, renewalTime);

    expect(renewed.status).toBe('active');
    expect(renewed.usedMessages).toBe(0);
    expect(renewed.startDate).toEqual(renewalTime);
    expect(renewed.endDate.toISOString()).toBe('2026-12-01T10:00:00.000Z');
  });
});
