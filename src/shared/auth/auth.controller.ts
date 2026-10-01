import { Controller, Get } from '@nestjs/common';
import { AuthUser } from './auth.types';
import { CurrentUser } from './decorators';

@Controller('auth')
export class AuthController {
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}