import type { DeckOptions } from '../state/contracts.js';
import { DECK_OPTIONS } from '../state/tokens.js';

import type { IDeckCompositor, IPixiHost } from './contracts.js';
import type { DeckViewStatus, IDeckView } from './deck-view-contract.js';
import { DECK_COMPOSITOR, PIXI_APP } from './tokens.js';

/**
 * Resolves after the browser has painted the frame that `render()` queued: the
 * first callback runs before that paint, and the second after it.
 */
function presented(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** What the app calls: it attaches the renderer to a canvas and reports the context. */
export class DeckViewController implements IDeckView, Disposable {
  static deps = [PIXI_APP, DECK_COMPOSITOR, DECK_OPTIONS] as const;

  private readonly listeners = new Set<(status: DeckViewStatus) => void>();
  private abort: AbortController | undefined;
  private unlisten: (() => void) | undefined;

  constructor(
    private readonly host: IPixiHost,
    private readonly compositor: IDeckCompositor,
    private readonly options: DeckOptions,
  ) {}

  async attach(canvas: HTMLCanvasElement): Promise<void> {
    this.detach();
    const abort = new AbortController();
    this.abort = abort;
    const { signal } = abort;
    const { scene } = this.options;
    try {
      // The host keeps the renderer of a canvas, so a second attach on it
      // (the retry of TL25) starts from a live context.
      const renderer = await this.host.start(canvas, scene.legend.size);
      signal.throwIfAborted();
      await this.compositor.mount(renderer, scene, signal);
      signal.throwIfAborted();
      this.listen(canvas);
      this.compositor.render();
      await presented();
      signal.throwIfAborted();
    } catch (error) {
      if (!signal.aborted) this.detach();
      throw error;
    }
  }

  detach(): void {
    this.abort?.abort();
    this.abort = undefined;
    this.unlisten?.();
    this.unlisten = undefined;
    this.compositor.unmount();
  }

  onFrame(listener: () => void): () => void {
    return this.compositor.onFrame(listener);
  }

  onStatus(listener: (status: DeckViewStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The host destroys the renderer in its own dispose. */
  [Symbol.dispose](): void {
    this.detach();
    this.listeners.clear();
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
