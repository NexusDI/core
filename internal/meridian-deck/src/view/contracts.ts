import type { Container, WebGLRenderer } from 'pixi.js';

import type { DeckScene } from '../state/contracts.js';

/** What the view reports about its context: the GPU took it away, or gave it back. */
export type DeckViewStatus = 'lost' | 'restored';

/**
 * The deck view as an app sees it. It holds no Pixi type, so the page's
 * controller types against this interface alone.
 */
export interface IDeckView {
  /**
   * Draws the lit scene on `canvas`. It resolves on the first frame the canvas
   * presents, and rejects when the renderer, a texture or a mask fails to load.
   */
  attach(canvas: HTMLCanvasElement): Promise<void>;
  /** Stops drawing and frees the renderer. A later `attach()` starts afresh. */
  detach(): void;
  /** Calls `listener` when the context is lost and when it comes back. Returns the way to stop. */
  onStatus(listener: (status: DeckViewStatus) => void): () => void;
}

/** The renderer on a canvas. Private to the view module. */
export interface IPixiHost {
  start(canvas: HTMLCanvasElement, size: FrameSize): Promise<WebGLRenderer>;
  stop(): void;
}

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

/** What a layer gets: its slot in the stage and the means to draw. */
export interface LayerContext {
  readonly renderer: WebGLRenderer;
  /** The layer adds its display objects here. Slots stack in layer order. */
  readonly slot: Container;
  readonly scene: DeckScene;
  /** Draws a frame now. */
  render(): void;
}

/** One layer of the view. */
export interface IDeckLayer {
  mount(context: LayerContext): Promise<void>;
  /** Called before each draw of the stage. */
  prepare?(): void;
  unmount(): void;
}

/** Stacks the layers into one stage and draws it. */
export interface IDeckCompositor {
  mount(renderer: WebGLRenderer, scene: DeckScene): Promise<void>;
  render(): void;
  unmount(): void;
}
