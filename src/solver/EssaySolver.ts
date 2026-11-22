import type { TextProvider } from '../ai/AIProvider';

export type EssayLength = 'short' | 'medium' | 'long';

export interface EssayOptions {
  length?: EssayLength;
  /** Mata pelajaran, misalnya "matematika" atau "biologi" */
  subject?: string;
}

/** Menjawab soal esai/uraian. */
export class EssaySolver {
  static readonly PROMPT = `Kamu adalah asisten akademik. Tugasmu membantu menjawab soal essay/uraian.
Berikan jawaban yang terstruktur, jelas, dan sesuai level pendidikan.
Gunakan bahasa Indonesia yang baik dan benar.`;

  private static readonly LENGTH_HINT: Record<EssayLength, string> = {
    short: 'Berikan jawaban singkat 2-3 kalimat.',
    medium: 'Berikan jawaban 1-2 paragraf yang cukup detail.',
    long: 'Berikan jawaban panjang dan mendalam dengan beberapa paragraf.',
  };

  constructor(private readonly provider: TextProvider) {}

  static isLength(value: unknown): value is EssayLength {
    return value === 'short' || value === 'medium' || value === 'long';
  }

  solve(input: string, options: EssayOptions = {}, signal?: AbortSignal): Promise<string> {
    const hint = EssaySolver.LENGTH_HINT[options.length ?? 'medium'];
    const subjectLine = options.subject ? `\nMata pelajaran: ${options.subject}.` : '';
    return this.provider.complete(`${EssaySolver.PROMPT}${subjectLine}\n${hint}\n\nSoal:\n${input}`, signal);
  }
}
