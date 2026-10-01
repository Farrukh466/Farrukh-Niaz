import { DomainError } from '../../../shared/errors/domain-error';
import { billingPeriod } from '../entities/quota';
import { QuotaReservation } from '../entities/quota';
import { ChatMessage } from '../entities/chat-message';
import { AiClient, ChatRepository, QuotaRepository } from '../ports';
import { ChatService } from './chat.service';

class FakeQuota implements QuotaRepository {
  freeUsed = 0;
  bundle: { id: string; remaining: number } | null = null;
  released: QuotaReservation[] = [];

  async reserve(_userId: string, messageId: string, _period: string, freeLimit: number) {
    if (this.freeUsed < freeLimit) {
      this.freeUsed += 1;
      return { usageId: `usage-${messageId}`, messageId, source: { kind: 'free' as const } };
    }
    if (this.bundle && this.bundle.remaining > 0) {
      this.bundle.remaining -= 1;
      return {
        usageId: `usage-${messageId}`,
        messageId,
        source: { kind: 'subscription' as const, subscriptionId: this.bundle.id },
      };
    }
    return null;
  }

  async release(reservation: QuotaReservation) {
    this.released.push(reservation);
    if (reservation.source.kind === 'free') {
      this.freeUsed -= 1;
    } else if (this.bundle) {
      this.bundle.remaining += 1;
    }
  }
}

class FakeChats implements ChatRepository {
  saved: ChatMessage[] = [];
  async save(message: ChatMessage) {
    this.saved.push(message);
  }
  async findById(id: string) {
    return this.saved.find((m) => m.id === id) ?? null;
  }
  async listForUser(userId: string, limit: number) {
    return this.saved.filter((m) => m.userId === userId).slice(0, limit);
  }
}

const okAi: AiClient = {
  complete: async (q) => ({ answer: `answer to ${q}`, promptTokens: 3, completionTokens: 5 }),
};

const user = { id: 'user-1', role: 'user' as const };
const otherUser = { id: 'user-2', role: 'user' as const };
const admin = { id: 'admin-1', role: 'admin' as const };
const meta = { requestId: 'req-1' };

function setup(ai: AiClient = okAi) {
  const quota = new FakeQuota();
  const chats = new FakeChats();
  let n = 0;
  const service = new ChatService(quota, chats, ai, () => `msg-${++n}`);
  return { quota, chats, service };
}

describe('ChatService quota', () => {
  it('uses 3 free messages, then the subscription, then refuses with QUOTA_EXHAUSTED', async () => {
    const { quota, service } = setup();
    quota.bundle = { id: 'sub-1', remaining: 1 };

    const sources: string[] = [];
    for (let i = 0; i < 4; i++) {
      sources.push((await service.ask(user, `q${i}`, meta)).source.kind);
    }
    expect(sources).toEqual(['free', 'free', 'free', 'subscription']);

    await expect(service.ask(user, 'one too many', meta)).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
  });

  it('records token usage on the saved message', async () => {
    const { chats, service } = setup();
    await service.ask(user, 'hello', meta);
    expect(chats.saved[0].usage).toEqual({ promptTokens: 3, completionTokens: 5, totalTokens: 8 });
  });

  it('refunds the reserved quota when the AI call fails', async () => {
    const failingAi: AiClient = { complete: async () => Promise.reject(new Error('AI down')) };
    const { quota, chats, service } = setup(failingAi);

    await expect(service.ask(user, 'hello', meta)).rejects.toThrow('AI down');
    expect(quota.released).toHaveLength(1);
    expect(quota.freeUsed).toBe(0);
    expect(chats.saved).toHaveLength(0);
  });

  it('refunds the reserved quota when saving the message fails', async () => {
    const { quota, chats, service } = setup();
    chats.save = async () => Promise.reject(new Error('db down'));

    await expect(service.ask(user, 'hello', meta)).rejects.toThrow('db down');
    expect(quota.freeUsed).toBe(0);
  });

  it('starts a new free allowance each calendar month', () => {
    expect(billingPeriod(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10');
    expect(billingPeriod(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11');
  });
});

describe('ChatService access policy', () => {
  it('hides another user\'s message as NOT_FOUND but lets an admin read it', async () => {
    const { service } = setup();
    const { message } = await service.ask(user, 'private', meta);

    await expect(service.get(otherUser, message.id)).rejects.toBeInstanceOf(DomainError);
    await expect(service.get(otherUser, message.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.get(admin, message.id)).resolves.toMatchObject({ id: message.id });
  });
});