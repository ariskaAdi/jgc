import type { ImageData } from '../ai/ImageData';
import type { EssayOptions } from './EssaySolver';
import { EssaySolver } from './EssaySolver';
import { ImageSolver } from './ImageSolver';
import { McqSolver } from './McqSolver';
import { ModeDetector, type SolverMode } from './ModeDetector';

export interface Answer {
  answer: string;
  mode: SolverMode | 'image';
}

/** Titik masuk logika bisnis: pilih solver yang tepat untuk tiap pertanyaan. */
export class QuestionService {
  constructor(
    private readonly detector: ModeDetector,
    private readonly mcq: McqSolver,
    private readonly essay: EssaySolver,
    private readonly image: ImageSolver,
  ) {}

  async askText(question: string, options: EssayOptions = {}, signal?: AbortSignal): Promise<Answer> {
    const mode = this.detector.detect(question);
    const answer =
      mode === 'mcq' ? await this.mcq.solve(question, signal) : await this.essay.solve(question, options, signal);
    return { answer, mode };
  }

  async askImage(image: ImageData, signal?: AbortSignal): Promise<Answer> {
    return { answer: await this.image.solve(image, signal), mode: 'image' };
  }
}
