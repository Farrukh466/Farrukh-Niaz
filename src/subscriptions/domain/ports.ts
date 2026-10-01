import { Subscription } from './entities/subscription';

export interface PaymentRecord {
  amountCents: number;
  succeeded: boolean;
  reason?: string;
}

export interface SubscriptionRepository {
  create(sub: Subscription, payment: PaymentRecord): Promise<void>;
  findById(id: string): Promise<Subscription | null>;
  listForUser(userId: string): Promise<Subscription[]>;
  findDue(now: Date, limit: number): Promise<Subscription[]>;
  transition(previous: Subscription, next: Subscription, payment?: PaymentRecord): Promise<boolean>;
  countFreeUsage(userId: string, period: string): Promise<number>;
}

export interface ChargeResult {
  ok: boolean;
  reason?: string;
}

export interface PaymentGateway {
  charge(userId: string, amountCents: number): Promise<ChargeResult>;
}