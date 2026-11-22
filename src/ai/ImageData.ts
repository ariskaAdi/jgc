export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImageError';
  }
}

/** Gambar dari data URL ("data:image/jpeg;base64,...") yang sudah divalidasi. */
export class ImageData {
  private static readonly PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

  private constructor(
    readonly mimeType: string,
    readonly base64: string,
  ) {}

  static fromDataUrl(dataUrl: unknown): ImageData {
    if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
      throw new InvalidImageError('field "image" wajib berisi data URL gambar');
    }
    const match = ImageData.PATTERN.exec(dataUrl);
    if (!match) {
      throw new InvalidImageError('format gambar tidak valid, harus data URL base64 (data:image/...;base64,...)');
    }
    return new ImageData(match[1].toLowerCase(), match[2].replace(/\s/g, ''));
  }
}
