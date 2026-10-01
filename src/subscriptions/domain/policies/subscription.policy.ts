import { Actor } from '../../../shared/domain/actor';
import { DomainError } from '../../../shared/errors/domain-error';
import { Subscription } from '../entities/subscription';

export const SubscriptionPolicy = {
  assertCanManage(actor: Actor, sub: Subscription): void {
    if (actor.role !== 'admin' && sub.userId !== actor.id) {
      throw new DomainError('NOT_FOUND', 'Subscription not found');
    }
  },

  assertCanRunRenewals(actor: Actor): void {
    if (actor.role !== 'admin') {
      throw new DomainError(
        'FORBIDDEN',
        'Only administrators can run renewals',
      );
    }
  },

  assertCanViewUser(actor: Actor, userId: string): void {
    if (actor.role !== 'admin' && actor.id !== userId) {
      throw new DomainError(
        'FORBIDDEN',
        "Cannot view another user's subscriptions",
      );
    }
  },
};
