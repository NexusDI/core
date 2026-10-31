import { all } from '@nexusdi/core';
import { Container, type WebGLRenderer } from 'pixi.js';

import type { DeckScene } from '../state/contracts.js';

import type { IDeckCompositor, IDeckLayer } from './contracts.js';
import { DECK_LAYERS } from './tokens.js';

/** Stacks the layers, in the order the module provides them, and draws the stage. */
export class LayerCompositor implements IDeckCompositor {
  static deps = [all(DECK_LAYERS)] as const;

  private renderer: WebGLRenderer | undefined;
  private stage: Container | undefined;
  private mounted: IDeckLayer[] = [];
  private readonly frames = new Set<() => void>();

  constructor(private readonly layers: readonly IDeckLayer[]) {}

  /**
   * Mounts each layer in turn. When `signal` aborts, the layer that was still
   * loading unmounts as it finishes (unless a newer mount has the stage), and
   * the mount rejects.
   */
  async mount(
    renderer: WebGLRenderer,
    scene: DeckScene,
    signal: AbortSignal,
  ): Promise<void> {
    this.teardown();
    this.renderer = renderer;
    const stage = new Container();
    this.stage = stage;
    for (const layer of this.layers) {
      signal.throwIfAborted();
      const slot = new Container();
      stage.addChild(slot);
      this.mounted.push(layer);
      try {
        await layer.mount({
          renderer,
          slot,
          scene,
          signal,
          render: () => this.render(),
        });
      } finally {
        // A layer that finished after the abort still holds what it built. When
        // no newer mount owns the stage, unmounting it frees that.
        if (signal.aborted && this.stage === undefined) layer.unmount();
      }
      signal.throwIfAborted();
    }
  }

  render(): void {
    if (this.renderer === undefined || this.stage === undefined) return;
    for (const layer of this.mounted) layer.prepare?.();
    this.renderer.render({ container: this.stage });
    for (const listener of [...this.frames]) listener();
  }

  onFrame(listener: () => void): () => void {
    this.frames.add(listener);
    return () => {
      this.frames.delete(listener);
    };
  }

  /** Frees the layers and the stage, and forgets the frame listeners: a view that attaches again registers its own. */
  unmount(): void {
    this.teardown();
    this.frames.clear();
  }

  private teardown(): void {
    for (const layer of this.mounted.reverse()) layer.unmount();
    this.mounted = [];
    this.stage?.destroy({ children: true });
    this.stage = undefined;
    this.renderer = undefined;
  }
}
