import type { Logger } from '../logger/Logger';
import type { ImageProvider, TextProvider } from './AIProvider';
import type { ImageData } from './ImageData';

/**
 * Mencoba provider satu per satu sesuai urutan; provider berikutnya hanya dipanggil
 * jika yang sebelumnya gagal. Urutan untuk teks dan gambar bisa berbeda.
 */
export class ProviderRouter implements TextProvider, ImageProvider {
  readonly name = 'router';

  constructor(
    private readonly textChain: readonly TextProvider[],
    private readonly imageChain: readonly ImageProvider[],
    private readonly logger: Logger,
  ) {}

  complete(prompt: string, signal?: AbortSignal): Promise<string> {
    return this.run('text', this.textChain, (p) => p.complete(prompt, signal), signal);
  }

  completeWithImage(prompt: string, image: ImageData, signal?: AbortSignal): Promise<string> {
    return this.run('image', this.imageChain, (p) => p.completeWithImage(prompt, image, signal), signal);
  }

  private async run<P extends { readonly name: string }>(
    kind: string,
    chain: readonly P[],
    call: (provider: P) => Promise<string>,
    signal?: AbortSignal,
  ): Promise<string> {
    const start = Date.now();
    let lastError: unknown = new Error(`tidak ada provider untuk ${kind}`);

    for (const [i, provider] of chain.entries()) {
      try {
        const result = await call(provider);
        this.logger.info(i === 0 ? 'ai request completed' : 'ai request completed via fallback', {
          kind,
          provider: provider.name,
          duration_ms: Date.now() - start,
        });
        return result;
      } catch (err) {
        lastError = err;
        // Request sudah dibatalkan (waktu habis / client pergi): jangan buang kuota provider berikutnya
        if (signal?.aborted) break;
        const next = chain[i + 1];
        if (next) {
          this.logger.warn('provider failed, switching to fallback', { kind, provider: provider.name, next: next.name, error: err });
        }
      }
    }

    this.logger.error('all providers failed', { kind, error: lastError, duration_ms: Date.now() - start });
    throw lastError;
  }
}
