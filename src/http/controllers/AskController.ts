import type { Request, Response } from 'express';
import { ImageData } from '../../ai/ImageData';
import type { Logger } from '../../logger/Logger';
import { EssaySolver, type EssayOptions } from '../../solver/EssaySolver';
import type { QuestionService } from '../../solver/QuestionService';
import { HttpError } from '../HttpError';
import { SingleFlight } from '../middleware/SingleFlight';

/** Handler untuk POST /ask dan POST /ask-image. */
export class AskController {
  constructor(
    private readonly service: QuestionService,
    private readonly logger: Logger,
  ) {}

  /** Body: `{ question, length?, subject? }` → `{ answer, mode }` */
  readonly ask = async (req: Request, res: Response): Promise<void> => {
    const body = AskController.body(req);
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) throw HttpError.badRequest('field "question" wajib diisi');

    const options: EssayOptions = {};
    if (body.length !== undefined) {
      if (!EssaySolver.isLength(body.length)) throw HttpError.badRequest('field "length" harus short, medium, atau long');
      options.length = body.length;
    }
    if (typeof body.subject === 'string' && body.subject.trim()) options.subject = body.subject.trim();

    const start = Date.now();
    const result = await this.service.askText(question, options, SingleFlight.signalOf(res));
    this.logger.info('ask done', { mode: result.mode, len: question.length, duration_ms: Date.now() - start });
    res.json(result);
  };

  /** Body: `{ image: "data:image/...;base64,..." }` → `{ answer, mode: "image" }` */
  readonly askImage = async (req: Request, res: Response): Promise<void> => {
    const image = ImageData.fromDataUrl(AskController.body(req).image);

    const start = Date.now();
    const result = await this.service.askImage(image, SingleFlight.signalOf(res));
    this.logger.info('ask-image done', { image_len: image.base64.length, duration_ms: Date.now() - start });
    res.json(result);
  };

  private static body(req: Request): Record<string, unknown> {
    return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  }
}
