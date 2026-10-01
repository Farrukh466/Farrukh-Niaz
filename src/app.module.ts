import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { validateEnv } from './shared/config/env';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './shared/auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ObservabilityModule } from './shared/observability/observability.module';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req, res) => {
          const incoming = req.headers['x-request-id'];
          const id =
            typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
              ? incoming
              : randomUUID();
          res.setHeader('X-Request-Id', id);
          return id;
        },
        customProps: (req: IncomingMessage & { user?: { id: string } }) => ({
          userId: req.user?.id,
        }),
        redact: ['req.headers.authorization'],
      },
    }),
    PrismaModule,
    AuthModule,
    ChatModule,
    SubscriptionsModule,
    ObservabilityModule,
  ],
})
export class AppModule {}
