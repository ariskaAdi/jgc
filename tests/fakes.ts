import type { ImageProvider, TextProvider } from '../src/ai/AIProvider';
import type { ImageData } from '../src/ai/ImageData';

type Reply = (prompt: string, signal?: AbortSignal) => string | Promise<string>;

/** Provider palsu yang mencatat prompt dan menjawab sesuai fungsi `reply`. */
export class FakeTextProvider implements TextProvider {
  readonly prompts: string[] = [];

  constructor(
    readonly name: string,
    private readonly reply: Reply = () => 'ok',
  ) {}

  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    this.prompts.push(prompt);
    return this.reply(prompt, signal);
  }
}

export class FakeImageProvider implements ImageProvider {
  readonly name = 'fake-image';
  readonly images: ImageData[] = [];

  constructor(private readonly reply: () => string | Promise<string> = () => 'jawaban gambar') {}

  async completeWithImage(_prompt: string, image: ImageData): Promise<string> {
    this.images.push(image);
    return this.reply();
  }
}

/** Promise yang bisa diselesaikan dari luar, untuk menahan provider palsu. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Menunggu sampai signal di-abort, lalu melempar error seperti fetch sungguhan. */
export function untilAborted(signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
}
