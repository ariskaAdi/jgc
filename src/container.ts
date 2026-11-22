import type { Express } from 'express';
import { GeminiKeyPool } from './ai/GeminiKeyPool';
import { GeminiProvider } from './ai/GeminiProvider';
import { GroqProvider } from './ai/GroqProvider';
import { ProviderRouter } from './ai/ProviderRouter';
import type { Config } from './config/Config';
import { App } from './http/App';
import { RequestGate } from './http/RequestGate';
import { Logger } from './logger/Logger';
import { EssaySolver } from './solver/EssaySolver';
import { ImageSolver } from './solver/ImageSolver';
import { McqSolver } from './solver/McqSolver';
import { ModeDetector } from './solver/ModeDetector';
import { QuestionService } from './solver/QuestionService';

/** Composition root: satu-satunya tempat objek dibuat dan dihubungkan. */
export function createApp(config: Config): Express {
  const logger = new Logger(config.logLevel);

  // Satu GeminiProvider per API key, dipakai bergiliran saat kuota habis
  const { apiKeys, model, timeoutMs } = config.gemini;
  const gemini = new GeminiKeyPool(
    apiKeys.map((apiKey) => new GeminiProvider({ apiKey, model, timeoutMs })),
    logger,
  );
  logger.info('gemini keys loaded', { count: apiKeys.length });

  const groq = config.groq ? new GroqProvider(config.groq) : null;
  const textProvider = new ProviderRouter(gemini, groq, logger);

  const service = new QuestionService(
    new ModeDetector(),
    new McqSolver(textProvider),
    new EssaySolver(textProvider),
    new ImageSolver(gemini),
  );

  const gate = new RequestGate(config.requestHoldMs);

  return new App({ service, apiKey: config.apiKey, logger, gate }).build();
}
