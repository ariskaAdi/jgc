import type { ImageProvider } from '../ai/AIProvider';
import type { ImageData } from '../ai/ImageData';

/** Membaca soal dari screenshot lalu menjawabnya (multimodal). */
export class ImageSolver {
  static readonly PROMPT = `Kamu adalah asisten akademik. Lihat gambar soal berikut dan jawab dengan tepat.
Jika soal pilihan ganda, tulis HANYA huruf dan isi opsi yang benar, persis seperti di soal.
Contoh: A. database
Jangan beri penjelasan, alasan, atau kalimat lain untuk soal pilihan ganda.

Jika soal essay atau isian, berikan jawaban lengkap dan terstruktur.
Jika ada beberapa soal dalam gambar, jawab semua secara berurutan, satu soal per baris
untuk pilihan ganda, diawali nomor soal. Contoh:
1. A. database
2. C. primary key`;

  constructor(private readonly provider: ImageProvider) {}

  solve(image: ImageData, signal?: AbortSignal): Promise<string> {
    return this.provider.completeWithImage(ImageSolver.PROMPT, image, signal);
  }
}
