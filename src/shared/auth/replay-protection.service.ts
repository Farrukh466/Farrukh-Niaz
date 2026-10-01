import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { IncomingHttpHeaders } from 'node:http';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

function reject(code: string, message: string): UnauthorizedException {
  return new UnauthorizedException({ code, message });
}

@Injectable()
export class ReplayProtectionService {
  private readonly windowSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.windowSeconds = config.get('NONCE_WINDOW_SECONDS', { infer: true });
  }

  async consume(subject: string, headers: IncomingHttpHeaders, nowMs = Date.now()): Promise<void> {
    const nonce = single(headers['x-request-nonce']);
    const timestamp = single(headers['x-request-timestamp']);

    if (!nonce || !UUID_PATTERN.test(nonce)) {
      throw reject('INVALID_NONCE', 'X-Request-Nonce header must be a UUID');
    }
    const seconds = Number(timestamp);
    if (!timestamp || !Number.isInteger(seconds)) {
      throw reject('INVALID_TIMESTAMP', 'X-Request-Timestamp header must be unix seconds');
    }
    if (Math.abs(nowMs / 1000 - seconds) > this.windowSeconds) {
      throw reject('STALE_REQUEST', 'Request timestamp is outside the allowed window');
    }

    try {
      await this.prisma.requestNonce.create({ data: { nonce, userId: subject } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw reject('REPLAYED_REQUEST', 'This request nonce has already been used');
      }
      throw error;
    }

    if (Math.random() < 0.01) {
      void this.prune(nowMs);
    }
  }

  private async prune(nowMs: number): Promise<void> {
    const cutoff = new Date(nowMs - this.windowSeconds * 2000);
    await this.prisma.requestNonce.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => undefined);
  }
}