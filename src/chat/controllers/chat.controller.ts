import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AuthUser, AuthenticatedRequest } from '../../shared/auth/auth.types';
import { CurrentUser } from '../../shared/auth/decorators';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { ChatMessage } from '../domain/entities/chat-message';
import { QuotaSource } from '../domain/entities/quota';
import { ChatService } from '../domain/services/chat.service';
import {
  AskQuestionDto,
  AskQuestionSchema,
  ListChatsQuery,
  ListChatsQuerySchema,
} from './chat.schemas';
import { RateLimit } from '../../shared/http/rate-limit';

function toResponse(message: ChatMessage, source?: QuotaSource) {
  return {
    id: message.id,
    question: message.question,
    answer: message.answer,
    tokens: message.usage,
    createdAt: message.createdAt.toISOString(),
    ...(source ? { quota: source } : {}),
  };
}

@RateLimit('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @HttpCode(201)
  async ask(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(AskQuestionSchema)) body: AskQuestionDto,
    @Req() req: AuthenticatedRequest & { id?: unknown },
  ) {
    const { message, source } = await this.chat.ask(user, body.question, {
      requestId: String(req.id ?? ''),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 256),
    });
    return toResponse(message, source);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ListChatsQuerySchema)) query: ListChatsQuery,
  ) {
    const messages = await this.chat.listOwn(user, query.limit);
    return messages.map((m) => toResponse(m));
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return toResponse(await this.chat.get(user, id));
  }
}
