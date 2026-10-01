import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../shared/config/env';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ChatController } from './controllers/chat.controller';
import { ChatService } from './domain/services/chat.service';
import { AiClient, ChatRepository, QuotaRepository } from './domain/ports';
import { MockAiClient } from './infrastructure/mock-ai.client';
import { PrismaChatRepository } from './repositories/prisma-chat.repository';
import { PrismaQuotaRepository } from './repositories/prisma-quota.repository';

export const QUOTA_REPOSITORY = Symbol('QUOTA_REPOSITORY');
export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');
export const AI_CLIENT = Symbol('AI_CLIENT');

@Module({
  controllers: [ChatController],
  providers: [
    {
      provide: QUOTA_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaQuotaRepository(prisma),
    },
    {
      provide: CHAT_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaChatRepository(prisma),
    },
    {
      provide: AI_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new MockAiClient(
          config.get('MOCK_AI_MIN_LATENCY_MS', { infer: true }),
          config.get('MOCK_AI_MAX_LATENCY_MS', { infer: true }),
        ),
    },
    {
      provide: ChatService,
      inject: [QUOTA_REPOSITORY, CHAT_REPOSITORY, AI_CLIENT],
      useFactory: (quota: QuotaRepository, chats: ChatRepository, ai: AiClient) =>
        new ChatService(quota, chats, ai),
    },
  ],
})
export class ChatModule {}