import { describe, expect, it } from 'vitest';
import { AIProviderError } from '../src/ai/AIProviderError';
import type { ImageProvider, TextProvider } from '../src/ai/AIProvider';
import { GeminiKeyPool } from '../src/ai/GeminiKeyPool';
import { SilentLogger } from '../src/logger/Logger';

/** Key palsu: `behaviour` menentukan hasil tiap panggilan. */
class FakeKey implements TextProvider, ImageProvider {
  readonly name = 'gemini';
  calls = 0;

  constructor(private readonly behaviour: () => string) {}

  async complete(): Promise<string> {
    this.calls++;
    return this.behaviour();
  }

  async completeWithImage(): Promise<string> {
    this.calls++;
    return this.behaviour();
  }
}

const ok = (answer: string) => () => answer;
const perMinute = () => () => {
  throw new AIProviderError('gemini', 'rate_limit', 'rate limit (quotaId: GenerateRequestsPerMinutePerProjectPerModel-FreeTier)');
};
const perDay = () => () => {
  throw new AIProviderError('gemini', 'rate_limit', 'rate limit (quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier)');
};

function pool(keys: FakeKey[], clock = { now: 0 }) {
  return new GeminiKeyPool(keys, new SilentLogger(), () => clock.now);
}

describe('GeminiKeyPool', () => {
  it('memakai key pertama selama berhasil', async () => {
    const keys = [new FakeKey(ok('k1')), new FakeKey(ok('k2'))];
    const p = pool(keys);

    expect(await p.complete('x')).toBe('k1');
    expect(await p.complete('x')).toBe('k1');
    expect(keys[1].calls).toBe(0);
  });

  it('pindah ke key berikutnya saat kuota habis, lalu tetap di key itu', async () => {
    const keys = [new FakeKey(perDay()), new FakeKey(perDay()), new FakeKey(ok('k3'))];
    const p = pool(keys);

    expect(await p.complete('x')).toBe('k3');
    expect(await p.complete('x')).toBe('k3');
    // Key yang habis tidak dicoba ulang di request kedua
    expect(keys[0].calls).toBe(1);
    expect(keys[1].calls).toBe(1);
  });

  it('rotasi juga berlaku untuk soal gambar', async () => {
    const keys = [new FakeKey(perMinute()), new FakeKey(ok('k2'))];
    expect(await pool(keys).completeWithImage('x', {} as never)).toBe('k2');
  });

  it('tidak pindah key untuk error selain rate limit', async () => {
    const keys = [
      new FakeKey(() => {
        throw new AIProviderError('gemini', 'timeout', 'lambat');
      }),
      new FakeKey(ok('k2')),
    ];

    await expect(pool(keys).complete('x')).rejects.toMatchObject({ code: 'timeout' });
    expect(keys[1].calls).toBe(0);
  });

  it('melempar rate_limit jika semua key habis', async () => {
    const keys = [new FakeKey(perDay()), new FakeKey(perDay())];
    const p = pool(keys);

    await expect(p.complete('x')).rejects.toMatchObject({ code: 'rate_limit' });
    // Request berikutnya langsung ditolak tanpa memanggil API
    await expect(p.complete('x')).rejects.toMatchObject({ code: 'rate_limit' });
    expect(keys[0].calls + keys[1].calls).toBe(2);
  });

  it('key dengan kuota per menit habis dipakai lagi setelah 60 detik', async () => {
    let first = true;
    const keys = [
      new FakeKey(() => {
        if (first) {
          first = false;
          return perMinute()();
        }
        return 'k1 lagi';
      }),
      new FakeKey(perDay()),
    ];
    const clock = { now: 0 };
    const p = pool(keys, clock);

    await expect(p.complete('x')).rejects.toMatchObject({ code: 'rate_limit' });
    clock.now = 59_000;
    await expect(p.complete('x')).rejects.toMatchObject({ code: 'rate_limit' });
    clock.now = 60_000;
    expect(await p.complete('x')).toBe('k1 lagi');
  });

  it('key dengan kuota harian habis istirahat sampai tengah malam Pacific', async () => {
    // 2026-11-22 10:00 PST (UTC-8) = 18:00 UTC → reset 2026-11-23 00:00 PST = 08:00 UTC
    const start = Date.UTC(2026, 10, 22, 18, 0, 0);
    expect(GeminiKeyPool.nextPacificMidnight(start)).toBe(Date.UTC(2026, 10, 23, 8, 0, 0));

    // Saat daylight saving (PDT, UTC-7): 2026-07-01 23:30 PDT → reset 2026-07-02 07:00 UTC
    expect(GeminiKeyPool.nextPacificMidnight(Date.UTC(2026, 6, 2, 6, 30, 0))).toBe(Date.UTC(2026, 6, 2, 7, 0, 0));
  });
});
