import type { Container, WebGLRenderer } from 'pixi.js';

import type { DeckScene } from '../state/contracts.js';

/**
 * The renderer on a canvas. Private to the view module. `start()` keeps the
 * renderer it made for a canvas, so a second `start()` on that canvas returns
 * it. A host destroys the renderer when its container disposes, and `release()`
 * does so at once.
 */
export interface IPixiHost {
  start(canvas: HTMLCanvasElement, size: FrameSize): Promise<WebGLRenderer>;
  release(): void;
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
  /** Aborts when the view detaches, so a layer that is still loading stops and frees what it made. */
  readonly signal: AbortSignal;
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
  mount(
    renderer: WebGLRenderer,
    scene: DeckScene,
    signal: AbortSignal,
  ): Promise<void>;
  render(): void;
  unmount(): void;
}
