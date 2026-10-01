import { ChatMessage as ChatMessageRow } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ChatMessage } from '../domain/entities/chat-message';
import { ChatRepository } from '../domain/ports';

function toDomain(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    userId: row.userId,
    question: row.question,
    answer: row.answer,
    usage: {
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
    },
    metadata: {
      requestId: row.requestId,
      ipAddress: row.ipAddress ?? undefined,
      userAgent: row.userAgent ?? undefined,
    },
    createdAt: row.createdAt,
  };
}

export class PrismaChatRepository implements ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(message: ChatMessage): Promise<void> {
    await this.prisma.chatMessage.create({
      data: {
        id: message.id,
        userId: message.userId,
        question: message.question,
        answer: message.answer,
        promptTokens: message.usage.promptTokens,
        completionTokens: message.usage.completionTokens,
        totalTokens: message.usage.totalTokens,
        requestId: message.metadata.requestId,
        ipAddress: message.metadata.ipAddress,
        userAgent: message.metadata.userAgent,
        createdAt: message.createdAt,
      },
    });
  }

  async findById(id: string): Promise<ChatMessage | null> {
    const row = await this.prisma.chatMessage.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listForUser(userId: string, limit: number): Promise<ChatMessage[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toDomain);
  }
}