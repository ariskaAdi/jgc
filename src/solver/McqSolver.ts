import type { TextProvider } from '../ai/AIProvider';

/** Menjawab satu atau beberapa soal pilihan ganda dalam SATU panggilan AI. */
export class McqSolver {
  static readonly PROMPT = `Kamu adalah asisten akademik. Tugasmu menjawab soal pilihan ganda.
Tulis HANYA huruf dan isi opsi yang benar, persis seperti di soal. Contoh: A. database
Jangan beri penjelasan, alasan, atau kalimat lain.

Jika ada beberapa soal, tulis satu baris per soal sesuai urutan, diawali nomor soal.
Contoh:
1. A. database
2. C. primary key`;

  constructor(private readonly provider: TextProvider) {}

  // Sengaja tidak memecah soal menjadi beberapa panggilan: teks yang disorot dari
  // halaman web sering berisi banyak blok berpola opsi, dan tiap pecahan memakai kuota.
  solve(input: string, signal?: AbortSignal): Promise<string> {
    return this.provider.complete(`${McqSolver.PROMPT}\n\nSoal:\n${input}`, signal);
  }
}
