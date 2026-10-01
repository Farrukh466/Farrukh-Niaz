import { ChargeResult, PaymentGateway } from '../domain/ports';

export class MockPaymentGateway implements PaymentGateway {
  constructor(
    private readonly failureRate: number,
    private readonly random: () => number = Math.random,
  ) {}

  async charge(_userId: string, _amountCents: number): Promise<ChargeResult> {
    if (this.random() < this.failureRate) {
      return { ok: false, reason: 'card_declined' };
    }
    return { ok: true };
  }
}