import express, { type Express } from 'express';
import type { Logger } from '../logger/Logger';
import type { QuestionService } from '../solver/QuestionService';
import { AskController } from './controllers/AskController';
import { HttpError } from './HttpError';
import { ApiKeyAuth } from './middleware/ApiKeyAuth';
import { Cors } from './middleware/Cors';
import { ErrorHandler } from './middleware/ErrorHandler';
import { SingleFlight } from './middleware/SingleFlight';
import type { RequestGate } from './RequestGate';

export interface AppDependencies {
  service: QuestionService;
  apiKey: string;
  logger: Logger;
  /** Lock bersama untuk /ask dan /ask-image */
  gate: RequestGate;
}

/** Merakit aplikasi Express: middleware, route, dan error handler. */
export class App {
  // Batas body Vercel Functions 4.5 MB; screenshot dari extension sudah dikompres jauh di bawah ini
  private static readonly BODY_LIMIT = '4mb';

  constructor(private readonly deps: AppDependencies) {}

  build(): Express {
    const app = express();
    const auth = new ApiKeyAuth(this.deps.apiKey);
    const ask = new AskController(this.deps.service, this.deps.logger);
    // Satu request AI dalam satu waktu; dipasang setelah auth agar request tanpa key tidak memegang lock
    const singleFlight = new SingleFlight(this.deps.gate);

    app.disable('x-powered-by');
    app.use(new Cors().handle);
    app.use(express.json({ limit: App.BODY_LIMIT }));

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
    app.post('/ask', auth.handle, singleFlight.handle, ask.ask);
    app.post('/ask-image', auth.handle, singleFlight.handle, ask.askImage);

    app.use((_req, _res, next) => next(HttpError.notFound()));
    app.use(new ErrorHandler(this.deps.logger).handle);

    return app;
  }
}
