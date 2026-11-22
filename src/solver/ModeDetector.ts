export type SolverMode = 'mcq' | 'essay';

/** Menebak apakah input berupa soal pilihan ganda atau esai. */
export class ModeDetector {
  /** Baris yang diawali opsi seperti "A.", "b)", "C )" */
  static readonly MCQ_OPTION = /^\s*[a-e][.)]\s+\S/im;

  detect(input: string): SolverMode {
    // Tanpa opsi A–E dianggap esai, termasuk input pendek (sama seperti versi Go)
    return ModeDetector.MCQ_OPTION.test(input) ? 'mcq' : 'essay';
  }
}
