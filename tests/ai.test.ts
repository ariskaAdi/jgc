import { describe, expect, it } from 'vitest';
import { AIProviderError } from '../src/ai/AIProviderError';
import { GroqProvider } from '../src/ai/GroqProvider';
import { ImageData, InvalidImageError } from '../src/ai/ImageData';
import { ProviderRouter } from '../src/ai/ProviderRouter';
import { SilentLogger } from '../src/logger/Logger';
import { FakeTextProvider } from './fakes';

const logger = new SilentLogger();

describe('ProviderRouter', () => {
  it('memakai provider utama jika berhasil', async () => {
    const primary = new FakeTextProvider('primary', () => 'dari primary');
    const fallback = new FakeTextProvider('fallback', () => 'dari fallback');

    expect(await new ProviderRouter(primary, fallback, logger).complete('hai')).toBe('dari primary');
    expect(fallback.prompts).toHaveLength(0);
  });

  it('pindah ke fallback jika provider utama gagal', async () => {
    const primary = new FakeTextProvider('primary', () => {
      throw new AIProviderError('primary', 'rate_limit', 'kuota habis');
    });
    const fallback = new FakeTextProvider('fallback', () => 'dari fallback');

    expect(await new ProviderRouter(primary, fallback, logger).complete('hai')).toBe('dari fallback');
  });

  it('tidak memanggil fallback jika request sudah dibatalkan', async () => {
    const controller = new AbortController();
    const primary = new FakeTextProvider('primary', () => {
      controller.abort();
      throw new AIProviderError('primary', 'timeout', 'dibatalkan');
    });
    const fallback = new FakeTextProvider('fallback', () => 'tidak boleh dipanggil');

    await expect(new ProviderRouter(primary, fallback, logger).complete('hai', controller.signal)).rejects.toMatchObject({
      code: 'timeout',
    });
    expect(fallback.prompts).toHaveLength(0);
  });

  it('meneruskan error jika tidak ada fallback', async () => {
    const primary = new FakeTextProvider('primary', () => {
      throw new AIProviderError('primary', 'timeout', 'lambat');
    });

    await expect(new ProviderRouter(primary, null, logger).complete('hai')).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('ImageData', () => {
  it('membaca data URL gambar', () => {
    const image = ImageData.fromDataUrl('data:image/jpeg;base64,/9j/4AAQ');
    expect(image.mimeType).toBe('image/jpeg');
    expect(image.base64).toBe('/9j/4AAQ');
  });

  it('menolak input yang bukan gambar', () => {
    expect(() => ImageData.fromDataUrl('data:text/plain;base64,aGFp')).toThrow(InvalidImageError);
    expect(() => ImageData.fromDataUrl('bukan data url')).toThrow(InvalidImageError);
    expect(() => ImageData.fromDataUrl(undefined)).toThrow(InvalidImageError);
  });
});

describe('GroqProvider', () => {
  const settings = { apiKey: 'k', model: 'm', timeoutMs: 1000 };

  it('mengambil isi jawaban dari respons OpenAI-compatible', async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'halo' } }] }), { status: 200 })) as typeof fetch;
    expect(await new GroqProvider(settings, fetchFn).complete('hai')).toBe('halo');
  });

  it('memetakan HTTP 429 ke rate_limit', async () => {
    const fetchFn = (async () => new Response('too many', { status: 429 })) as typeof fetch;
    await expect(new GroqProvider(settings, fetchFn).complete('hai')).rejects.toMatchObject({ code: 'rate_limit' });
  });
});
