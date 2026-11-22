export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ProviderSettings {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
}

export interface GroqSettings extends ProviderSettings {
  /** Model untuk soal gambar; null = Groq tidak dipakai sebagai cadangan screenshot */
  readonly visionModel: string | null;
}

export interface GeminiSettings {
  /** Urutan rotasi: GEMINI_API_KEY, lalu GEMINI_API_KEY1, GEMINI_API_KEY2, ... */
  readonly apiKeys: readonly string[];
  readonly model: string;
  readonly timeoutMs: number;
}

type Env = Record<string, string | undefined>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Semua konfigurasi aplikasi, dibaca dari environment variable. */
export class Config {
  constructor(
    readonly gemini: GeminiSettings,
    /** null = fallback Groq dimatikan */
    readonly groq: GroqSettings | null,
    readonly apiKey: string,
    readonly logLevel: LogLevel,
    readonly port: number,
    /** Lama maksimal satu request memegang lock sebelum dibatalkan */
    readonly requestHoldMs: number,
  ) {}

  static fromEnv(env: Env = process.env): Config {
    const geminiKeys = Config.geminiKeys(env);
    const missing: string[] = [];
    if (geminiKeys.length === 0) missing.push('GEMINI_API_KEY (atau GEMINI_API_KEY1, GEMINI_API_KEY2, ...)');
    if (!env.API_KEY) missing.push('API_KEY');
    if (missing.length > 0) {
      throw new ConfigError(`Environment variable wajib belum diisi: ${missing.join(', ')}`);
    }

    const gemini: GeminiSettings = {
      apiKeys: geminiKeys,
      model: env.GEMINI_MODEL || 'gemini-2.5-flash',
      timeoutMs: Config.int(env.GEMINI_TIMEOUT_SECONDS, 20) * 1000,
    };

    const visionModel = env.GROQ_VISION_MODEL?.trim() || 'qwen/qwen3.8-27b';
    const groq: GroqSettings | null = env.GROQ_API_KEY
      ? {
          apiKey: env.GROQ_API_KEY,
          model: env.GROQ_MODEL || 'llama-3.1-8b-instant',
          visionModel: visionModel.toLowerCase() === 'off' ? null : visionModel,
          timeoutMs: Config.int(env.GROQ_TIMEOUT_SECONDS, 10) * 1000,
        }
      : null;

    return new Config(
      gemini,
      groq,
      env.API_KEY!,
      Config.logLevel(env.LOG_LEVEL),
      Config.int(env.PORT, 8080),
      Config.int(env.REQUEST_HOLD_SECONDS, 30) * 1000,
    );
  }

  /** GEMINI_API_KEY lalu GEMINI_API_KEY<n> urut angka; kosong & duplikat dibuang. */
  private static geminiKeys(env: Env): string[] {
    const numbered = Object.keys(env)
      .map((name) => ({ name, n: /^GEMINI_API_KEY(\d+)$/.exec(name)?.[1] }))
      .filter((k): k is { name: string; n: string } => k.n !== undefined)
      .sort((a, b) => Number(a.n) - Number(b.n))
      .map((k) => env[k.name]);

    const keys = [env.GEMINI_API_KEY, ...numbered]
      .map((k) => k?.trim())
      .filter((k): k is string => Boolean(k));
    return [...new Set(keys)];
  }

  private static int(value: string | undefined, fallback: number): number {
    const n = Number.parseInt(value ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private static logLevel(value: string | undefined): LogLevel {
    const v = (value ?? '').toLowerCase();
    return v === 'debug' || v === 'warn' || v === 'error' ? v : 'info';
  }
}
