/** What the view reports about its context: the GPU took it away, or gave it back. */
export type DeckViewStatus = 'lost' | 'restored';

/**
 * The deck view as an app sees it. It holds no Pixi type, so the page's
 * controller types against this interface alone, and the declaration file the
 * package publishes for it names no Pixi module.
 */
export interface IDeckView {
  /**
   * Draws the lit scene on `canvas`. It resolves once the canvas has painted
   * its first frame, and rejects when the renderer, a texture or a mask fails
   * to load, or when `detach()` is called first.
   */
  attach(canvas: HTMLCanvasElement): Promise<void>;
  /**
   * Stops drawing and frees the layers' textures. The renderer stays with the
   * view, so an `attach()` on the same canvas starts again at once; it goes
   * when the view's container disposes.
   */
  detach(): void;
  /**
   * Calls `listener` after each frame the scene renders, and only while it
   * renders, so a still scene is silent. The canvas holds that frame inside
   * the callback: a `drawImage()` of it there copies the lit scene, with no
   * `preserveDrawingBuffer` on the context (the buffer clears when the browser
   * presents the frame, after the callback has run). A copy made later in the
   * task or in another one reads a blank canvas. Returns the way to stop.
   */
  onFrame(listener: () => void): () => void;
  /** Calls `listener` when the context is lost and when it comes back. Returns the way to stop. */
  onStatus(listener: (status: DeckViewStatus) => void): () => void;
}
