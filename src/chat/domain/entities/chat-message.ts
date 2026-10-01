export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface RequestMetadata {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  question: string;
  answer: string;
  usage: TokenUsage;
  metadata: RequestMetadata;
  createdAt: Date;
}
