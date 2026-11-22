import type { ProviderSettings } from '../config/Config';
import { AIProviderError } from './AIProviderError';
import { withTimeout, type TextProvider } from './AIProvider';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

/** Groq lewat endpoint yang kompatibel dengan OpenAI. Hanya teks. */
export class GroqProvider implements TextProvider {
  readonly name = 'groq';
  private static readonly ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    private readonly settings: ProviderSettings,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchFn(GroqProvider.ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.settings.model,
          messages: [{ role: 'user', content: prompt }],
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
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new AIProviderError(this.name, 'unknown', 'respons kosong dari Groq');
    return content;
  }
}
