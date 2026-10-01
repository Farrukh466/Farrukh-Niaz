import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { Env } from './shared/config/env';
import { AllExceptionsFilter } from './shared/errors/all-exceptions.filter';
import { TimeoutInterceptor } from './shared/http/timeout.interceptor';
import { requireJson } from './shared/http/require-json.middleware';
import { MetricsRegistry } from './shared/observability/metrics.registry';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.use(app.get(MetricsRegistry).middleware());

  app.use(helmet());
  app.use(requireJson);
  app.use(json({ limit: config.get('BODY_LIMIT', { infer: true }), strict: true }));

  app.enableCors({
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((o) => o.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Nonce', 'X-Request-Timestamp', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    credentials: false,
    maxAge: 600,
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TimeoutInterceptor(config.get('REQUEST_TIMEOUT_MS', { infer: true })));
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();