export const FREE_MESSAGES_PER_MONTH = 3;

export function billingPeriod(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export type QuotaSource =
  { kind: 'free' } | { kind: 'subscription'; subscriptionId: string };

export interface QuotaReservation {
  usageId: string;
  messageId: string;
  source: QuotaSource;
}
