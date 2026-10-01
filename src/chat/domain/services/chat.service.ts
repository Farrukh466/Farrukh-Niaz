import { randomUUID } from 'node:crypto';
import { Actor } from '../../../shared/domain/actor';
import { DomainError } from '../../../shared/errors/domain-error';
import { ChatMessage, RequestMetadata } from '../entities/chat-message';
import {
  FREE_MESSAGES_PER_MONTH,
  QuotaSource,
  billingPeriod,
} from '../entities/quota';
import { ChatPolicy } from '../policies/chat.policy';
import {
  AiClient,
  AiCompletion,
  ChatRepository,
  QuotaRepository,
} from '../ports';

export interface AskResult {
  message: ChatMessage;
  source: QuotaSource;
}

export class ChatService {
  constructor(
    private readonly quota: QuotaRepository,
    private readonly chats: ChatRepository,
    private readonly ai: AiClient,
    private readonly newId: () => string = randomUUID,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async ask(
    actor: Actor,
    question: string,
    metadata: RequestMetadata,
  ): Promise<AskResult> {
    const now = this.clock();
    const period = billingPeriod(now);
    const messageId = this.newId();

    const reservation = await this.quota.reserve(
      actor.id,
      messageId,
      period,
      FREE_MESSAGES_PER_MONTH,
    );
    if (!reservation) {
      throw new DomainError(
        'QUOTA_EXHAUSTED',
        'No free messages or subscription quota remaining',
        {
          period,
          freeMessagesPerMonth: FREE_MESSAGES_PER_MONTH,
        },
      );
    }

    let completion: AiCompletion;
    try {
      completion = await this.ai.complete(question);
    } catch (error) {
      await this.quota.release(reservation);
      throw error;
    }

    const message: ChatMessage = {
      id: messageId,
      userId: actor.id,
      question,
      answer: completion.answer,
      usage: {
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.promptTokens + completion.completionTokens,
      },
      metadata,
      createdAt: now,
    };

    try {
      await this.chats.save(message);
    } catch (error) {
      await this.quota.release(reservation);
      throw error;
    }

    return { message, source: reservation.source };
  }

  async get(actor: Actor, id: string): Promise<ChatMessage> {
    const message = await this.chats.findById(id);
    if (!message) {
      throw new DomainError('NOT_FOUND', 'Chat message not found');
    }
    ChatPolicy.assertCanRead(actor, message);
    return message;
  }

  async listOwn(actor: Actor, limit: number): Promise<ChatMessage[]> {
    return this.chats.listForUser(actor.id, limit);
  }
}
