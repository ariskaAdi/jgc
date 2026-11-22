import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AIProviderError } from '../src/ai/AIProviderError';
import { App } from '../src/http/App';
import { RequestGate } from '../src/http/RequestGate';
import { SilentLogger } from '../src/logger/Logger';
import { EssaySolver } from '../src/solver/EssaySolver';
import { ImageSolver } from '../src/solver/ImageSolver';
import { McqSolver } from '../src/solver/McqSolver';
import { ModeDetector } from '../src/solver/ModeDetector';
import { QuestionService } from '../src/solver/QuestionService';
import { deferred, FakeImageProvider, FakeTextProvider, untilAborted } from './fakes';

const API_KEY = 'rahasia';

function buildApp(
  text = new FakeTextProvider('fake', () => 'jawaban'),
  image = new FakeImageProvider(),
  gate = new RequestGate(30_000),
) {
  const service = new QuestionService(
    new ModeDetector(),
    new McqSolver(text),
    new EssaySolver(text),
    new ImageSolver(image),
  );
  return new App({ service, apiKey: API_KEY, logger: new SilentLogger(), gate }).build();
}

function ask(app: ReturnType<typeof buildApp>, question = 'Apa itu AI?') {
  return request(app).post('/ask').set('X-API-Key', API_KEY).send({ question });
}

describe('lock satu request (single flight)', () => {
  it('menolak request kedua selama request pertama masih diproses', async () => {
    const hold = deferred<string>();
    const provider = new FakeTextProvider('fake', () => hold.promise);
    const app = buildApp(provider);

    const first = ask(app).then((res) => res); // mulai request pertama
    await vi.waitFor(() => expect(provider.prompts).toHaveLength(1));

    const second = await ask(app);
    expect(second.status).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
    expect(provider.prompts).toHaveLength(1); // request kedua tidak memanggil AI

    hold.resolve('jawaban pertama');
    expect((await first).body.answer).toBe('jawaban pertama');

    // Setelah selesai, request berikutnya boleh jalan lagi
    expect((await ask(app)).status).toBe(200);
  });

  it('lock juga berlaku antara /ask dan /ask-image', async () => {
    const hold = deferred<string>();
    const provider = new FakeTextProvider('fake', () => hold.promise);
    const app = buildApp(provider);

    const first = ask(app).then((res) => res);
    await vi.waitFor(() => expect(provider.prompts).toHaveLength(1));

    const image = await request(app)
      .post('/ask-image')
      .set('X-API-Key', API_KEY)
      .send({ image: 'data:image/jpeg;base64,/9j/4AAQ' });
    expect(image.status).toBe(429);

    hold.resolve('ok');
    await first;
  });

  it('membatalkan panggilan AI dan melepas lock saat waktu tahan habis', async () => {
    let calls = 0;
    const provider = new FakeTextProvider('fake', (_p, signal) => (++calls === 1 ? untilAborted(signal) : 'cepat'));
    const app = buildApp(provider, undefined, new RequestGate(50));

    const slow = await ask(app);
    expect(slow.status).toBe(504);

    const next = await ask(app);
    expect(next.status).toBe(200);
    expect(next.body.answer).toBe('cepat');
  });

  it('request tanpa API key tidak memegang lock', async () => {
    const hold = deferred<string>();
    const provider = new FakeTextProvider('fake', () => hold.promise);
    const app = buildApp(provider);

    expect((await request(app).post('/ask').send({ question: 'x' })).status).toBe(401);
    const first = ask(app).then((res) => res);
    await vi.waitFor(() => expect(provider.prompts).toHaveLength(1));
    hold.resolve('ok');
    expect((await first).status).toBe(200);
  });
});

describe('GET /health', () => {
  it('bisa diakses tanpa API key', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('POST /ask', () => {
  it('menolak request tanpa API key yang benar', async () => {
    expect((await request(buildApp()).post('/ask').send({ question: 'x' })).status).toBe(401);
    expect((await request(buildApp()).post('/ask').set('X-API-Key', 'salah').send({ question: 'x' })).status).toBe(401);
  });

  it('menolak pertanyaan kosong', async () => {
    const res = await request(buildApp()).post('/ask').set('X-API-Key', API_KEY).send({ question: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('question');
  });

  it('menolak JSON rusak', async () => {
    const res = await request(buildApp())
      .post('/ask')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send('{rusak');
    expect(res.status).toBe(400);
  });

  it('menjawab soal pilihan ganda dengan mode mcq', async () => {
    const res = await request(buildApp())
      .post('/ask')
      .set('X-API-Key', API_KEY)
      .send({ question: 'Ibukota Indonesia?\nA. Bandung\nB. Jakarta' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ answer: 'jawaban', mode: 'mcq' });
  });

  it('menjawab soal esai dengan mode essay', async () => {
    const res = await request(buildApp()).post('/ask').set('X-API-Key', API_KEY).send({ question: 'Jelaskan fotosintesis' });
    expect(res.body.mode).toBe('essay');
  });

  it('memetakan kuota AI habis ke HTTP 429', async () => {
    const failing = new FakeTextProvider('fake', () => {
      throw new AIProviderError('gemini', 'rate_limit', 'habis');
    });
    const res = await request(buildApp(failing)).post('/ask').set('X-API-Key', API_KEY).send({ question: 'Apa itu AI?' });
    expect(res.status).toBe(429);
    expect(res.body.error).toBeTruthy();
  });
});

describe('POST /ask-image', () => {
  it('menjawab dari gambar', async () => {
    const image = new FakeImageProvider(() => 'Jawaban: B');
    const res = await request(buildApp(undefined, image))
      .post('/ask-image')
      .set('X-API-Key', API_KEY)
      .send({ image: 'data:image/jpeg;base64,/9j/4AAQ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ answer: 'Jawaban: B', mode: 'image' });
    expect(image.images[0].mimeType).toBe('image/jpeg');
  });

  it('menolak data URL yang tidak valid', async () => {
    const res = await request(buildApp()).post('/ask-image').set('X-API-Key', API_KEY).send({ image: 'bukan gambar' });
    expect(res.status).toBe(400);
  });
});

describe('route lain', () => {
  it('mengembalikan 404 JSON', async () => {
    const res = await request(buildApp()).get('/tidak-ada');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });
});
