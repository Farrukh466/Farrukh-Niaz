import { Actor } from '../../../shared/domain/actor';
import { DomainError } from '../../../shared/errors/domain-error';
import { ChatMessage } from '../entities/chat-message';

export const ChatPolicy = {
  assertCanRead(actor: Actor, message: ChatMessage): void {
    if (actor.role !== 'admin' && message.userId !== actor.id) {
      throw new DomainError('NOT_FOUND', 'Chat message not found');
    }
  },
};