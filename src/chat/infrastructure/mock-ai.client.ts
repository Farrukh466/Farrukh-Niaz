import { AiClient, AiCompletion } from '../domain/ports';

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class MockAiClient implements AiClient {
  constructor(
    private readonly minLatencyMs: number,
    private readonly maxLatencyMs: number,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async complete(question: string): Promise<AiCompletion> {
    const span = Math.max(0, this.maxLatencyMs - this.minLatencyMs);
    await this.sleep(this.minLatencyMs + Math.floor(Math.random() * (span + 1)));

    const answer = `This is a mocked AI response to your question: "${question.slice(0, 200)}"`;
    return {
      answer,
      promptTokens: estimateTokens(question),
      completionTokens: estimateTokens(answer),
    };
  }
}