import { z } from 'zod';
import { sanitizeText } from '../../shared/http/sanitize';

export const AskQuestionSchema = z
  .object({
    question: z.string().transform(sanitizeText).pipe(z.string().min(1).max(2000)),
  })
  .strict();

export type AskQuestionDto = z.infer<typeof AskQuestionSchema>;

export const ListChatsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type ListChatsQuery = z.infer<typeof ListChatsQuerySchema>;