import type { GroqSettings } from '../config/Config';
import { AIProviderError } from './AIProviderError';
import { withTimeout, type ImageProvider, type TextProvider } from './AIProvider';
import type { ImageData } from './ImageData';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

type ChatContent = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

/** Groq lewat endpoint yang kompatibel dengan OpenAI. Teks, dan gambar jika model vision diisi. */
export class GroqProvider implements TextProvider, ImageProvider {
  readonly name = 'groq';
  private static readonly ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

  /**
   * Parameter tambahan per model untuk mematikan "thinking" agar jawaban cepat dan
   * tidak berisi blok <think>. `reasoning_effort: "none"` hanya didukung model ini.
   */
  private static readonly NO_REASONING: Record<string, Record<string, unknown>> = {
    'qwen/qwen3.8-27b': { reasoning_effort: 'none' },
  };

  constructor(
    private readonly settings: GroqSettings,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  get supportsImages(): boolean {
    return this.settings.visionModel !== null;
  }

  complete(prompt: string, signal?: AbortSignal): Promise<string> {
    return this.chat(this.settings.model, prompt, signal);
  }

  completeWithImage(prompt: string, image: ImageData, signal?: AbortSignal): Promise<string> {
    const model = this.settings.visionModel;
    if (!model) return Promise.reject(new AIProviderError(this.name, 'unknown', 'model vision Groq tidak diaktifkan'));

    return this.chat(
      model,
      [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
      ],
      signal,
    );
  }

  private async chat(model: string, content: ChatContent, signal?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchFn(GroqProvider.ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content }],
          ...GroqProvider.NO_REASONING[model],
        }),
        signal: withTimeout(signal, this.settings.timeoutMs),
      });
    } catch (err) {
      if (AIProviderError.isTimeout(err)) {
        throw new AIProviderError(this.name, 'timeout', 'dibatalkan atau melewati batas waktu');
      }
      throw new AIProviderError(this.name, 'unavailable', err instanceof Error ? err.message : String(err));
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw AIProviderError.fromStatus(this.name, response.status, detail);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    // Jaga-jaga jika model tetap mengirim proses berpikirnya di dalam jawaban
    const answer = data.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!answer) throw new AIProviderError(this.name, 'unknown', 'respons kosong dari Groq');
    return answer;
  }
}
