import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError, DomainErrorCode } from './domain-error';

const DOMAIN_STATUS: Record<DomainErrorCode, number> = {
  QUOTA_EXHAUSTED: HttpStatus.PAYMENT_REQUIRED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_STATE: HttpStatus.CONFLICT,
  CONFLICT: HttpStatus.CONFLICT,
};

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };

    if (exception instanceof DomainError) {
      status = DOMAIN_STATUS[exception.code];
      body = {
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const raw = exception.getResponse();
      if (typeof raw === 'object' && raw !== null && 'code' in raw) {
        const r = raw as Record<string, unknown>;
        body = {
          code: String(r.code),
          message: String(r.message ?? exception.message),
          details: r.details,
        };
      } else {
        body = {
          code: HttpStatus[status] ?? 'HTTP_ERROR',
          message: exception.message,
        };
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      error: {
        ...body,
        requestId: req.id,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
