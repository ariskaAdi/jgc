import type { ImageData } from './ImageData';

/** Provider yang bisa menjawab prompt teks. */
export interface TextProvider {
  readonly name: string;
  /** `signal` membatalkan panggilan, misalnya saat batas waktu request habis. */
  complete(prompt: string, signal?: AbortSignal): Promise<string>;
}

/** Provider yang bisa menjawab prompt + gambar (multimodal). */
export interface ImageProvider {
  readonly name: string;
  completeWithImage(prompt: string, image: ImageData, signal?: AbortSignal): Promise<string>;
}

/** Gabungkan signal pembatalan dari request dengan timeout milik provider. */
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
