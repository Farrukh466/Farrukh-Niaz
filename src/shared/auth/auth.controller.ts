import { Controller, Get } from '@nestjs/common';
import { AuthUser } from './auth.types';
import { CurrentUser } from './decorators';
import { RateLimit } from '../http/rate-limit';

@RateLimit('auth')
@Controller('auth')
export class AuthController {
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}