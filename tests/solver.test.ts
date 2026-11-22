import { describe, expect, it } from 'vitest';
import { EssaySolver } from '../src/solver/EssaySolver';
import { McqSolver } from '../src/solver/McqSolver';
import { ModeDetector } from '../src/solver/ModeDetector';
import { FakeTextProvider } from './fakes';

describe('ModeDetector', () => {
  const detector = new ModeDetector();

  it('mendeteksi pilihan ganda dari opsi A–E', () => {
    expect(detector.detect('Ibukota Indonesia adalah\nA. Bandung\nB. Jakarta\nC. Surabaya')).toBe('mcq');
    expect(detector.detect('Pilih yang benar:\na) satu\nb) dua')).toBe('mcq');
  });

  it('menganggap teks tanpa opsi sebagai esai', () => {
    expect(detector.detect('Jelaskan proses fotosintesis')).toBe('essay');
    expect(detector.detect('Apa itu gravitasi?')).toBe('essay');
  });

  it('tidak salah membaca kalimat biasa yang diawali huruf', () => {
    expect(detector.detect('A pada kalimat ini bukan opsi')).toBe('essay');
  });
});

describe('McqSolver', () => {
  it('beberapa soal tetap dijawab dengan SATU panggilan AI', async () => {
    const provider = new FakeTextProvider('fake', () => '1. Jawaban: A\n\n2. Jawaban: B');
    const input = 'Soal satu\nA. x\nB. y\n\nSoal dua\nA. p\nB. q\n\nSoal tiga\na) m\nb) n';

    const answer = await new McqSolver(provider).solve(input);

    expect(provider.prompts).toHaveLength(1);
    expect(provider.prompts[0]).toContain(input);
    expect(answer).toBe('1. Jawaban: A\n\n2. Jawaban: B');
  });
});

describe('EssaySolver', () => {
  it('memasukkan panjang jawaban dan mata pelajaran ke prompt', async () => {
    const provider = new FakeTextProvider('fake');
    await new EssaySolver(provider).solve('Jelaskan limit', { length: 'short', subject: 'matematika' });

    expect(provider.prompts[0]).toContain('Mata pelajaran: matematika.');
    expect(provider.prompts[0]).toContain('jawaban singkat 2-3 kalimat');
    expect(provider.prompts[0]).toContain('Soal:\nJelaskan limit');
  });
});
