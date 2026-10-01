import { NextFunction, Request, Response } from 'express';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export function requireJson(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!BODY_METHODS.has(req.method)) {
    next();
    return;
  }
  const length = Number(req.headers['content-length'] ?? 0);
  const hasBody = length > 0 || req.headers['transfer-encoding'] !== undefined;
  const contentType = (req.headers['content-type'] ?? '').toLowerCase();

  if (hasBody && !contentType.startsWith('application/json')) {
    res.status(415).json({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/json',
      },
    });
    return;
  }
  next();
}
