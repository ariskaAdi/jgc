/** Error yang langsung dipetakan ke status HTTP tertentu. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message: string): HttpError {
    return new HttpError(400, message);
  }

  static unauthorized(): HttpError {
    return new HttpError(401, 'unauthorized');
  }

  static notFound(): HttpError {
    return new HttpError(404, 'not found');
  }
}
