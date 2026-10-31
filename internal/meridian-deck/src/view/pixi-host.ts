import { WebGLRenderer } from 'pixi.js';
// The filter system and its pipe. `manageImports: false` leaves out the
// extensions the view does not use, and the room clip is a filter.
import 'pixi.js/filters';

import type { FrameSize, IPixiHost } from './contracts.js';

/** Holds the renderer between `start()` and `stop()`. */
class PixiHost implements IPixiHost, Disposable {
  private current: WebGLRenderer | undefined;

  async start(
    canvas: HTMLCanvasElement,
    size: FrameSize,
  ): Promise<WebGLRenderer> {
    this.stop();
    const renderer = new WebGLRenderer();
    this.current = renderer;
    await renderer.init({
      canvas,
      width: size.width,
      height: size.height,
      resolution: 1,
      autoDensity: false,
      antialias: false,
      backgroundAlpha: 1,
      background: 0x000000,
      manageImports: false,
    });
    if (this.current !== renderer) {
      renderer.destroy();
      throw new Error('The deck view was detached before it started.');
    }
    return renderer;
  }

  stop(): void {
    this.current?.destroy();
    this.current = undefined;
  }

  [Symbol.dispose](): void {
    this.stop();
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
