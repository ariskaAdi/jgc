import type { Logger } from '../logger/Logger';
import { AIProviderError } from './AIProviderError';
import type { ImageProvider, TextProvider } from './AIProvider';
import type { ImageData } from './ImageData';

type GeminiClient = TextProvider & ImageProvider;

/**
 * Beberapa API key Gemini yang dipakai bergiliran.
 *
 * - Key yang terakhir berhasil terus dipakai sampai kuotanya habis (429), lalu pindah ke key berikutnya.
 * - Key yang kena 429 diistirahatkan: sampai reset harian (tengah malam Pacific) jika kuota harian habis,
 *   atau 60 detik jika yang habis kuota per menit. Jadi key yang habis tidak dicoba ulang tiap request.
 * - Hanya 429 yang memicu rotasi. Timeout atau error lain langsung diteruskan agar
 *   satu soal tidak menghabiskan panggilan ke semua key.
 *
 * Catatan: kuota Gemini dihitung per project, bukan per key. Rotasi hanya menambah
 * kuota jika key-key ini berasal dari project yang berbeda.
 */
export class GeminiKeyPool implements TextProvider, ImageProvider {
  readonly name = 'gemini';
  private static readonly PER_MINUTE_COOLDOWN_MS = 60_000;

  /** Index key yang dipakai lebih dulu (key terakhir yang berhasil) */
  private current = 0;
  /** Index key → waktu (ms) key boleh dipakai lagi */
  private readonly cooldownUntil = new Map<number, number>();

  constructor(
    private readonly clients: readonly GeminiClient[],
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {
    if (clients.length === 0) throw new Error('GeminiKeyPool butuh minimal satu key');
  }

  complete(prompt: string, signal?: AbortSignal): Promise<string> {
    return this.run((client) => client.complete(prompt, signal), signal);
  }

  completeWithImage(prompt: string, image: ImageData, signal?: AbortSignal): Promise<string> {
    return this.run((client) => client.completeWithImage(prompt, image, signal), signal);
  }

  private async run(call: (client: GeminiClient) => Promise<string>, signal?: AbortSignal): Promise<string> {
    let lastRateLimit: AIProviderError | null = null;

    for (let step = 0; step < this.clients.length; step++) {
      const index = (this.current + step) % this.clients.length;
      if (this.isCoolingDown(index)) continue;
      if (signal?.aborted) break;

      try {
        const result = await call(this.clients[index]);
        if (index !== this.current) {
          this.logger.info('gemini key switched', { key: index + 1 });
          this.current = index;
        }
        return result;
      } catch (err) {
        if (!(err instanceof AIProviderError) || err.code !== 'rate_limit') throw err;
        lastRateLimit = err;
        const until = this.cooldownEnd(err);
        this.cooldownUntil.set(index, until);
        this.logger.warn('gemini key rate limited, trying next key', {
          key: index + 1,
          until: new Date(until).toISOString(),
        });
      }
    }

    throw lastRateLimit ?? new AIProviderError(this.name, 'rate_limit', 'kuota semua API key Gemini sedang habis');
  }

  private isCoolingDown(index: number): boolean {
    const until = this.cooldownUntil.get(index);
    if (until === undefined) return false;
    if (this.now() >= until) {
      this.cooldownUntil.delete(index);
      return false;
    }
    return true;
  }

  /** Pesan 429 Gemini menyebut quotaId, misalnya "GenerateRequestsPerDayPerProjectPerModel-FreeTier". */
  private cooldownEnd(err: AIProviderError): number {
    return /PerDay/i.test(err.message)
      ? GeminiKeyPool.nextPacificMidnight(this.now())
      : this.now() + GeminiKeyPool.PER_MINUTE_COOLDOWN_MS;
  }

  /** Waktu reset kuota harian Gemini: tengah malam berikutnya di zona America/Los_Angeles. */
  static nextPacificMidnight(nowMs: number): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hourCycle: 'h23',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(new Date(nowMs));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

    const msIntoDay = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 + (nowMs % 1000);
    // Pada hari pergantian DST hasilnya bisa meleset satu jam; tidak masalah untuk cooldown.
    return nowMs - msIntoDay + 24 * 60 * 60 * 1000;
  }
}
