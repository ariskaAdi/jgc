export type AIErrorCode = 'rate_limit' | 'timeout' | 'unavailable' | 'unknown';

/** Error dari provider AI, sudah dipetakan ke kategori yang dipahami layer HTTP. */
export class AIProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly code: AIErrorCode,
    message: string,
  ) {
    super(`${provider}: ${message}`);
    this.name = 'AIProviderError';
  }

  static fromStatus(provider: string, status: number, detail: string): AIProviderError {
    if (status === 429) return new AIProviderError(provider, 'rate_limit', `rate limit (${detail})`);
    if (status === 503) return new AIProviderError(provider, 'unavailable', `layanan tidak tersedia (${detail})`);
    return new AIProviderError(provider, 'unknown', `HTTP ${status}: ${detail}`);
  }

  static isTimeout(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return err.name === 'TimeoutError' || err.name === 'AbortError' || /aborted|timed? ?out/i.test(err.message);
  }
}
