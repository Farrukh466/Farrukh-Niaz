export type Tier = 'basic' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

interface MonthlyPlan {
  messages: number | null;
  priceCents: number;
}

const MONTHLY_PLANS: Record<Tier, MonthlyPlan> = {
  basic: { messages: 10, priceCents: 999 },
  pro: { messages: 100, priceCents: 4999 },
  enterprise: { messages: null, priceCents: 19999 },
};

export interface PlanTerms {
  maxMessages: number | null;
  priceCents: number;
}

export function planFor(tier: Tier, cycle: BillingCycle): PlanTerms {
  const base = MONTHLY_PLANS[tier];
  const yearly = cycle === 'yearly';
  return {
    maxMessages:
      base.messages === null ? null : base.messages * (yearly ? 12 : 1),
    priceCents: yearly ? base.priceCents * 10 : base.priceCents,
  };
}

export function addCycle(from: Date, cycle: BillingCycle): Date {
  const months = cycle === 'yearly' ? 12 : 1;
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(from.getUTCDate(), lastDayOfTarget);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}
