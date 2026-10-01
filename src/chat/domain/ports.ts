import { ChatMessage } from './entities/chat-message';
import { QuotaReservation } from './entities/quota';

export interface QuotaRepository {
  reserve(userId: string, messageId: string, period: string, freeLimit: number): Promise<QuotaReservation | null>;
  release(reservation: QuotaReservation): Promise<void>;
}

export interface ChatRepository {
  save(message: ChatMessage): Promise<void>;
  findById(id: string): Promise<ChatMessage | null>;
  listForUser(userId: string, limit: number): Promise<ChatMessage[]>;
}

export interface AiCompletion {
  answer: string;
  promptTokens: number;
  completionTokens: number;
}

export interface AiClient {
  complete(question: string): Promise<AiCompletion>;
}