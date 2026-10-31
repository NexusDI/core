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

  constructor(private readonly layers: readonly IDeckLayer[]) {}

  async mount(renderer: WebGLRenderer, scene: DeckScene): Promise<void> {
    this.unmount();
    this.renderer = renderer;
    const stage = new Container();
    this.stage = stage;
    for (const layer of this.layers) {
      const slot = new Container();
      stage.addChild(slot);
      this.mounted.push(layer);
      await layer.mount({ renderer, slot, scene, render: () => this.render() });
    }
  }

  render(): void {
    if (this.renderer === undefined || this.stage === undefined) return;
    for (const layer of this.mounted) layer.prepare?.();
    this.renderer.render({ container: this.stage });
  }

  unmount(): void {
    for (const layer of this.mounted.reverse()) layer.unmount();
    this.mounted = [];
    this.stage?.destroy({ children: true });
    this.stage = undefined;
    this.renderer = undefined;
  }
}
