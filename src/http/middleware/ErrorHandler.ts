import type { NextFunction, Request, Response } from 'express';
import { AIProviderError, type AIErrorCode } from '../../ai/AIProviderError';
import { InvalidImageError } from '../../ai/ImageData';
import type { Logger } from '../../logger/Logger';
import { HttpError } from '../HttpError';
import { SingleFlight } from './SingleFlight';

/** Mengubah semua error menjadi respons JSON `{ "error": "..." }` dengan status yang sesuai. */
export class ErrorHandler {
  private static readonly AI_ERRORS: Record<AIErrorCode, { status: number; message: string }> = {
    rate_limit: { status: 429, message: 'kuota AI habis, coba lagi nanti' },
    timeout: { status: 504, message: 'AI tidak merespons tepat waktu' },
    unavailable: { status: 503, message: 'layanan AI sedang tidak tersedia' },
    unknown: { status: 502, message: 'gagal memproses soal' },
  };

  constructor(private readonly logger: Logger) {}

  readonly handle = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    // Lock request habis waktunya → panggilan AI dibatalkan, apa pun error yang muncul darinya
    const { status, message } = SingleFlight.signalOf(res)?.aborted
      ? { status: 504, message: 'waktu proses habis, silakan coba lagi' }
      : this.resolve(err);
    if (status >= 500) {
      this.logger.error('request failed', { path: req.path, status, error: err });
    }
    res.status(status).json({ error: message });
  };

  private resolve(err: unknown): { status: number; message: string } {
    if (err instanceof HttpError) return { status: err.status, message: err.message };
    if (err instanceof InvalidImageError) return { status: 400, message: err.message };
    if (err instanceof AIProviderError) return ErrorHandler.AI_ERRORS[err.code];

    // Error bawaan express.json(): JSON rusak atau body terlalu besar
    const type = (err as { type?: string } | null)?.type;
    if (type === 'entity.parse.failed') return { status: 400, message: 'body JSON tidak valid' };
    if (type === 'entity.too.large') return { status: 413, message: 'ukuran request terlalu besar (maks 4 MB)' };

    return { status: 500, message: 'internal server error' };
  }
}
