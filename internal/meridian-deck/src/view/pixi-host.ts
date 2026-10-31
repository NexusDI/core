import { WebGLRenderer } from 'pixi.js';
// The filter system and its pipe. `manageImports: false` leaves out the
// extensions the view does not use, and the room clip is a filter.
import 'pixi.js/filters';
import { registerModulateBlend } from './modulate-blend.js';

import type { FrameSize, IPixiHost } from './contracts.js';

registerModulateBlend();

/** Holds the renderer of one canvas between `start()` and `release()`. */
class PixiHost implements IPixiHost, Disposable {
  private renderer: WebGLRenderer | undefined;
  private canvas: HTMLCanvasElement | undefined;
  private starting: Promise<WebGLRenderer> | undefined;

  start(canvas: HTMLCanvasElement, size: FrameSize): Promise<WebGLRenderer> {
    if (this.canvas === canvas && this.starting !== undefined) {
      return this.starting;
    }
    this.release();
    const renderer = new WebGLRenderer();
    this.renderer = renderer;
    this.canvas = canvas;
    const starting = renderer
      .init({
        canvas,
        width: size.width,
        height: size.height,
        resolution: 1,
        autoDensity: false,
        antialias: false,
        backgroundAlpha: 1,
        background: 0x000000,
        manageImports: false,
        // The light modulates what the base has drawn, which a blend filter reads from the back buffer.
        useBackBuffer: true,
      })
      .then(() => renderer);
    this.starting = starting;
    // A failed start leaves nothing to reuse, so the next start tries again.
    starting.catch(() => {
      if (this.renderer === renderer) this.release();
    });
    return starting;
  }

  release(): void {
    this.renderer?.destroy();
    this.renderer = undefined;
    this.canvas = undefined;
    this.starting = undefined;
  }

  [Symbol.dispose](): void {
    this.release();
  }
}

/**
 * The factory behind `PIXI_APP`. The renderer needs a canvas that only
 * `attach()` has, so the host starts it then; what the container builds is the
 * host, and its dispose destroys the renderer.
 */
export function createPixiHost(): Promise<IPixiHost & Disposable> {
  return Promise.resolve(new PixiHost());
}
