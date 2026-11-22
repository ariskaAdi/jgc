import type { Logger } from '../logger/Logger';
import type { TextProvider } from './AIProvider';

/** Coba provider utama dulu; kalau gagal, pindah ke fallback (jika ada). */
export class ProviderRouter implements TextProvider {
  readonly name = 'router';

  constructor(
    private readonly primary: TextProvider,
    private readonly fallback: TextProvider | null,
    private readonly logger: Logger,
  ) {}

  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    const start = Date.now();
    try {
      const result = await this.primary.complete(prompt, signal);
      this.logger.info('ai request completed', { provider: this.primary.name, duration_ms: Date.now() - start });
      return result;
    } catch (primaryError) {
      // Request sudah dibatalkan (waktu habis / client pergi): jangan buang kuota fallback
      if (!this.fallback || signal?.aborted) throw primaryError;
      this.logger.warn('primary provider failed, switching to fallback', {
        provider: this.primary.name,
        error: primaryError,
      });
    }

    try {
      const result = await this.fallback.complete(prompt, signal);
      this.logger.info('ai request completed via fallback', {
        provider: this.fallback.name,
        duration_ms: Date.now() - start,
      });
      return result;
    } catch (fallbackError) {
      this.logger.error('fallback provider also failed', {
        provider: this.fallback.name,
        error: fallbackError,
        duration_ms: Date.now() - start,
      });
      throw fallbackError;
    }
  }
}
