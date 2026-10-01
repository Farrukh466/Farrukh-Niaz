import { Request } from 'express';

export type Role = 'user' | 'admin';

export interface AuthUser {
  id: string;
  externalId: string;
  email: string;
  role: Role;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };
