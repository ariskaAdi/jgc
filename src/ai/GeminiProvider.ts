import { ApiError, GoogleGenAI, type GenerateContentParameters } from '@google/genai';
import type { ProviderSettings } from '../config/Config';
import { AIProviderError } from './AIProviderError';
import { withTimeout, type ImageProvider, type TextProvider } from './AIProvider';
import type { ImageData } from './ImageData';

/** Gemini via SDK resmi @google/genai. Dipakai untuk teks dan gambar. */
export class GeminiProvider implements TextProvider, ImageProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(
    private readonly settings: ProviderSettings,
    client?: GoogleGenAI,
  ) {
    this.client =
      client ??
      new GoogleGenAI({
        apiKey: settings.apiKey,
        // Satu request = satu panggilan. Jangan retry otomatis karena tiap retry memakai kuota.
        httpOptions: { retryOptions: { attempts: 1 } },
      });
  }

  complete(prompt: string, signal?: AbortSignal): Promise<string> {
    return this.generate({
      model: this.settings.model,
      contents: prompt,
      config: { abortSignal: withTimeout(signal, this.settings.timeoutMs) },
    });
  }

  completeWithImage(prompt: string, image: ImageData, signal?: AbortSignal): Promise<string> {
    return this.generate({
      model: this.settings.model,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }],
        },
      ],
      config: {
        abortSignal: withTimeout(signal, this.settings.timeoutMs),
        // Matikan "thinking" untuk soal gambar agar respons lebih cepat (sama seperti versi Go)
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  }

  private async generate(params: GenerateContentParameters): Promise<string> {
    let text: string | undefined;
    try {
      const response = await this.client.models.generateContent(params);
      text = response.text;
    } catch (err) {
      throw this.mapError(err);
    }
    if (!text) throw new AIProviderError(this.name, 'unknown', 'respons kosong dari Gemini');
    return text;
  }

  private mapError(err: unknown): AIProviderError {
    if (err instanceof AIProviderError) return err;
    if (AIProviderError.isTimeout(err)) {
      return new AIProviderError(this.name, 'timeout', 'dibatalkan atau melewati batas waktu');
    }
    if (err instanceof ApiError) return AIProviderError.fromStatus(this.name, err.status, err.message);
    const message = err instanceof Error ? err.message : String(err);
    if (/RESOURCE_EXHAUSTED/.test(message)) return new AIProviderError(this.name, 'rate_limit', message);
    if (/UNAVAILABLE/.test(message)) return new AIProviderError(this.name, 'unavailable', message);
    return new AIProviderError(this.name, 'unknown', message);
  }
}
