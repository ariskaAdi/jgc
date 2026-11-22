import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../HttpError';
import type { RequestGate } from '../RequestGate';

/** Middleware yang memasang RequestGate: tolak request jika masih ada yang diproses. */
export class SingleFlight {
  constructor(private readonly gate: RequestGate) {}

  readonly handle = (_req: Request, res: Response, next: NextFunction): void => {
    const lease = this.gate.tryAcquire();
    if (!lease) {
      res.setHeader('Retry-After', String(this.gate.retryAfterSeconds()));
      next(new HttpError(429, 'request sebelumnya masih diproses, tunggu sampai selesai'));
      return;
    }

    // 'close' terpanggil saat respons selesai dikirim ATAU client memutus koneksi.
    // Keduanya melepas lock; kalau client pergi, panggilan AI ikut dibatalkan.
    res.on('close', lease.release);
    res.locals.signal = lease.signal;
    next();
  };

  static signalOf(res: Response): AbortSignal | undefined {
    return res.locals.signal as AbortSignal | undefined;
  }
}
