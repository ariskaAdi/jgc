import { describe, expect, it } from 'vitest';
import { AIProviderError } from '../src/ai/AIProviderError';
import { GroqProvider } from '../src/ai/GroqProvider';
import { ImageData, InvalidImageError } from '../src/ai/ImageData';
import { ProviderRouter } from '../src/ai/ProviderRouter';
import { SilentLogger } from '../src/logger/Logger';
import { FakeImageProvider, FakeTextProvider } from './fakes';

const logger = new SilentLogger();
const image = ImageData.fromDataUrl('data:image/jpeg;base64,/9j/4AAQ');

const failing = (name: string, code: 'rate_limit' | 'timeout' = 'rate_limit') =>
  new FakeTextProvider(name, () => {
    throw new AIProviderError(name, code, 'gagal');
  });

describe('ProviderRouter (teks)', () => {
  it('memakai provider utama jika berhasil', async () => {
    const primary = new FakeTextProvider('primary', () => 'dari primary');
    const fallback = new FakeTextProvider('fallback', () => 'dari fallback');

    expect(await new ProviderRouter([primary, fallback], [], logger).complete('hai')).toBe('dari primary');
    expect(fallback.prompts).toHaveLength(0);
  });

  it('pindah ke fallback jika provider utama gagal', async () => {
    const fallback = new FakeTextProvider('fallback', () => 'dari fallback');
    expect(await new ProviderRouter([failing('primary'), fallback], [], logger).complete('hai')).toBe('dari fallback');
  });

  it('tidak memanggil fallback jika request sudah dibatalkan', async () => {
    const controller = new AbortController();
    const primary = new FakeTextProvider('primary', () => {
      controller.abort();
      throw new AIProviderError('primary', 'timeout', 'dibatalkan');
    });
    const fallback = new FakeTextProvider('fallback', () => 'tidak boleh dipanggil');

    await expect(
      new ProviderRouter([primary, fallback], [], logger).complete('hai', controller.signal),
    ).rejects.toMatchObject({ code: 'timeout' });
    expect(fallback.prompts).toHaveLength(0);
  });

  it('meneruskan error terakhir jika semua provider gagal', async () => {
    await expect(
      new ProviderRouter([failing('a', 'rate_limit'), failing('b', 'timeout')], [], logger).complete('hai'),
    ).rejects.toMatchObject({ provider: 'b', code: 'timeout' });
  });
});

describe('ProviderRouter (gambar)', () => {
  it('memakai cadangan gambar jika provider utama gagal', async () => {
    const primary = new FakeImageProvider(() => {
      throw new AIProviderError('gemini', 'rate_limit', 'habis');
    });
    const fallback = new FakeImageProvider(() => 'B. Jakarta');

    expect(await new ProviderRouter([], [primary, fallback], logger).completeWithImage('soal', image)).toBe('B. Jakarta');
    expect(fallback.images).toHaveLength(1);
  });

  it('urutan teks dan gambar terpisah', async () => {
    const text = new FakeTextProvider('text', () => 'teks');
    const img = new FakeImageProvider(() => 'gambar');
    const router = new ProviderRouter([text], [img], logger);

    expect(await router.complete('x')).toBe('teks');
    expect(await router.completeWithImage('x', image)).toBe('gambar');
  });
});

describe('ImageData', () => {
  it('membaca data URL gambar', () => {
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
  const settings = { apiKey: 'k', model: 'llama-teks', visionModel: 'qwen/qwen3.8-27b', timeoutMs: 1000 };

  /** fetch palsu yang mencatat body request dan membalas `content` */
  function fakeFetch(content: string, status = 200) {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return status === 200
        ? new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })
        : new Response(content, { status });
    }) as unknown as typeof fetch;
    return { fetchFn, bodies };
  }

  it('mengambil isi jawaban dari respons OpenAI-compatible', async () => {
    const { fetchFn, bodies } = fakeFetch('halo');
    expect(await new GroqProvider(settings, fetchFn).complete('hai')).toBe('halo');
    expect(bodies[0].model).toBe('llama-teks');
  });

  it('memetakan HTTP 429 ke rate_limit', async () => {
    const { fetchFn } = fakeFetch('too many', 429);
    await expect(new GroqProvider(settings, fetchFn).complete('hai')).rejects.toMatchObject({ code: 'rate_limit' });
  });

  it('mengirim gambar ke model vision dengan reasoning dimatikan', async () => {
    const { fetchFn, bodies } = fakeFetch('A. database');
    expect(await new GroqProvider(settings, fetchFn).completeWithImage('soal', image)).toBe('A. database');

    const body = bodies[0] as { model: string; reasoning_effort: string; messages: { content: unknown[] }[] };
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.reasoning_effort).toBe('none');
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'soal' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ' } },
    ]);
  });

  it('tidak mengirim reasoning_effort ke model yang tidak mendukungnya', async () => {
    const { fetchFn, bodies } = fakeFetch('halo');
    await new GroqProvider(settings, fetchFn).complete('hai');
    expect(bodies[0]).not.toHaveProperty('reasoning_effort');
  });

  it('membuang blok <think> jika model tetap mengirimnya', async () => {
    const { fetchFn } = fakeFetch('<think>hmm, opsi A...</think>\nA. database');
    expect(await new GroqProvider(settings, fetchFn).completeWithImage('soal', image)).toBe('A. database');
  });

  it('menolak gambar jika model vision dimatikan', async () => {
    const { fetchFn, bodies } = fakeFetch('x');
    const groq = new GroqProvider({ ...settings, visionModel: null }, fetchFn);

    expect(groq.supportsImages).toBe(false);
    await expect(groq.completeWithImage('soal', image)).rejects.toBeInstanceOf(AIProviderError);
    expect(bodies).toHaveLength(0);
  });
});
