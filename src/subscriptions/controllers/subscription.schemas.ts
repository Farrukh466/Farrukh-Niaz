import { z } from 'zod';

export const CreateSubscriptionSchema = z
  .object({
    tier: z.enum(['basic', 'pro', 'enterprise']),
    billingCycle: z.enum(['monthly', 'yearly']),
    autoRenew: z.boolean().default(true),
  })
  .strict();

export type CreateSubscriptionDto = z.infer<typeof CreateSubscriptionSchema>;

export const UpdateSubscriptionSchema = z
  .object({
    autoRenew: z.boolean(),
  })
  .strict();

export type UpdateSubscriptionDto = z.infer<typeof UpdateSubscriptionSchema>;

export const AdminListQuerySchema = z
  .object({
    userId: z.string().uuid(),
  })
  .strict();

export type AdminListQuery = z.infer<typeof AdminListQuerySchema>;
