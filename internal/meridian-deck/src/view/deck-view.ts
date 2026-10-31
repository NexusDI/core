import type { DeckOptions } from '../state/contracts.js';
import { DECK_OPTIONS } from '../state/tokens.js';

import type {
  DeckViewStatus,
  IDeckCompositor,
  IDeckView,
  IPixiHost,
} from './contracts.js';
import { DECK_COMPOSITOR, PIXI_APP } from './tokens.js';

/** Resolves after the browser has drawn the frame that `render()` queued. */
function presented(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** What the app calls: it attaches the renderer to a canvas and reports the context. */
export class DeckViewController implements IDeckView, Disposable {
  static deps = [PIXI_APP, DECK_COMPOSITOR, DECK_OPTIONS] as const;

  private readonly listeners = new Set<(status: DeckViewStatus) => void>();
  private generation = 0;
  private unlisten: (() => void) | undefined;

  constructor(
    private readonly host: IPixiHost,
    private readonly compositor: IDeckCompositor,
    private readonly options: DeckOptions,
  ) {}

  async attach(canvas: HTMLCanvasElement): Promise<void> {
    this.detach();
    const generation = this.generation;
    const { scene } = this.options;
    try {
      const renderer = await this.host.start(canvas, scene.legend.size);
      this.assertCurrent(generation);
      await this.compositor.mount(renderer, scene);
      this.assertCurrent(generation);
      this.listen(canvas);
      this.compositor.render();
      await presented();
      this.assertCurrent(generation);
    } catch (error) {
      if (generation === this.generation) this.detach();
      throw error;
    }
  }

  detach(): void {
    this.generation += 1;
    this.unlisten?.();
    this.unlisten = undefined;
    this.compositor.unmount();
    this.host.stop();
  }

  onStatus(listener: (status: DeckViewStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  [Symbol.dispose](): void {
    this.detach();
    this.listeners.clear();
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation) {
      throw new Error('The deck view was detached before it presented.');
    }
  }

  /** Pixi restores its own context. The view reports both turns and redraws on the way back. */
  private listen(canvas: HTMLCanvasElement): void {
    const lost = (event: Event) => {
      event.preventDefault();
      this.report('lost');
    };
    const restored = () => {
      this.compositor.render();
      this.report('restored');
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    this.unlisten = () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }

  private report(status: DeckViewStatus): void {
    for (const listener of [...this.listeners]) listener(status);
  }
}
