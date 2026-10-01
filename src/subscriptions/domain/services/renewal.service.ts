import { Actor } from '../../../shared/domain/actor';
import {
  expireSubscription,
  markPaymentFailed,
  renewSubscription,
} from '../entities/subscription';
import { SubscriptionPolicy } from '../policies/subscription.policy';
import { PaymentGateway, SubscriptionRepository } from '../ports';

export interface RenewalReport {
  examined: number;
  renewed: number;
  paymentFailed: number;
  expired: number;
  skipped: number;
}

export class RenewalService {
  constructor(
    private readonly subs: SubscriptionRepository,
    private readonly payments: PaymentGateway,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async runDue(actor: Actor, limit = 100): Promise<RenewalReport> {
    SubscriptionPolicy.assertCanRunRenewals(actor);

    const now = this.clock();
    const due = await this.subs.findDue(now, limit);
    const report: RenewalReport = {
      examined: due.length,
      renewed: 0,
      paymentFailed: 0,
      expired: 0,
      skipped: 0,
    };

    for (const sub of due) {
      if (!sub.autoRenew) {
        const applied = await this.subs.transition(
          sub,
          expireSubscription(sub),
        );
        applied ? report.expired++ : report.skipped++;
        continue;
      }

      const charge = await this.payments.charge(sub.userId, sub.priceCents);
      const next = charge.ok
        ? renewSubscription(sub, now)
        : markPaymentFailed(sub);
      const applied = await this.subs.transition(sub, next, {
        amountCents: sub.priceCents,
        succeeded: charge.ok,
        reason: charge.reason,
      });

      if (!applied) {
        report.skipped++;
      } else if (charge.ok) {
        report.renewed++;
      } else {
        report.paymentFailed++;
      }
    }

    return report;
  }
}
