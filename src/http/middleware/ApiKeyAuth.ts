import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../HttpError';

/** Mewajibkan header X-API-Key yang cocok dengan API_KEY. */
export class ApiKeyAuth {
  private readonly expected: Buffer;

  constructor(apiKey: string) {
    this.expected = ApiKeyAuth.digest(apiKey);
  }

  readonly handle = (req: Request, _res: Response, next: NextFunction): void => {
    const provided = req.header('x-api-key') ?? '';
    // Bandingkan hash agar panjangnya sama dan waktu perbandingan konstan
    if (!timingSafeEqual(ApiKeyAuth.digest(provided), this.expected)) {
      next(HttpError.unauthorized());
      return;
    }
    next();
  };

  private static digest(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }
}
