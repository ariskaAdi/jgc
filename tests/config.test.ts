import { describe, expect, it } from 'vitest';
import { Config, ConfigError } from '../src/config/Config';

describe('Config.fromEnv', () => {
  it('gagal jika env wajib kosong', () => {
    expect(() => Config.fromEnv({})).toThrow(ConfigError);
    expect(() => Config.fromEnv({ GEMINI_API_KEY: 'g' })).toThrow(/API_KEY/);
  });

  it('memakai nilai default', () => {
    const config = Config.fromEnv({ GEMINI_API_KEY: 'g', API_KEY: 'k' });
    expect(config.gemini).toEqual({ apiKeys: ['g'], model: 'gemini-2.5-flash', timeoutMs: 20_000 });
    expect(config.groq).toBeNull();
    expect(config.logLevel).toBe('info');
    expect(config.requestHoldMs).toBe(30_000);
  });

  it('membaca GEMINI_API_KEY1..N sesuai urutan angka', () => {
    const config = Config.fromEnv({
      API_KEY: 'k',
      GEMINI_API_KEY10: 'k10',
      GEMINI_API_KEY2: 'k2',
      GEMINI_API_KEY1: 'k1',
      GEMINI_API_KEY3: '',
    });
    expect(config.gemini.apiKeys).toEqual(['k1', 'k2', 'k10']);
  });

  it('GEMINI_API_KEY dipakai lebih dulu dan key duplikat dibuang', () => {
    const config = Config.fromEnv({ API_KEY: 'k', GEMINI_API_KEY: 'a', GEMINI_API_KEY1: 'b', GEMINI_API_KEY2: 'a' });
    expect(config.gemini.apiKeys).toEqual(['a', 'b']);
  });

  it('cukup GEMINI_API_KEY1 tanpa GEMINI_API_KEY', () => {
    expect(() => Config.fromEnv({ API_KEY: 'k', GEMINI_API_KEY1: 'x' })).not.toThrow();
  });

  it('mengaktifkan Groq jika GROQ_API_KEY diisi', () => {
    const config = Config.fromEnv({ GEMINI_API_KEY: 'g', API_KEY: 'k', GROQ_API_KEY: 'q', GROQ_TIMEOUT_SECONDS: '10' });
    expect(config.groq).toEqual({ apiKey: 'q', model: 'llama-3.1-8b-instant', timeoutMs: 10_000 });
  });
});
