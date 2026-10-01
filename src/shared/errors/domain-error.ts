export type DomainErrorCode =
  'QUOTA_EXHAUSTED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_STATE' | 'CONFLICT';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
