import type { NextFunction, Request, Response } from 'express';

/**
 * CORS terbuka seperti versi Go. Extension memanggil API dari background script,
 * jadi ini hanya jaga-jaga; endpoint tetap dilindungi API key.
 */
export class Cors {
  readonly handle = (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
