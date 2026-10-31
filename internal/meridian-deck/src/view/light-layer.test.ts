import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeckOptions, IDeckState } from '../state/contracts.js';
import { OPTIONS } from '../test-support.js';

import type { LayerContext } from './contracts.js';

const { Node } = vi.hoisted(() => {
  /** A display object that records what it is given. */
  class Node {
    children: Node[] = [];
    blendMode = 'normal';
    alpha = 1;
    visible = true;
    tint = 0xffffff;
    width = 0;
    height = 0;
    filters: unknown;
    filterArea: unknown;
    scale = { set: vi.fn() };
    position = { set: vi.fn() };
    anchor = { set: vi.fn() };
    addChild(...nodes: Node[]) {
      this.children.push(...nodes);
    }
    destroy = vi.fn();
  }
  return { Node };
});

vi.mock('pixi.js', () => ({
  Container: Node,
  Sprite: Node,
  Rectangle: class {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  },
  BufferImageSource: class {},
  Texture: Object.assign(
    class {
      destroy = vi.fn();
    },
    { WHITE: {} },
  ),
  RenderTexture: { create: () => ({ destroy: vi.fn() }) },
}));
vi.mock('./mask-source.js', () => ({
  loadMask: () =>
    Promise.resolve({ texture: { source: {} }, dispose: vi.fn() }),
}));
vi.mock('./room-clip.js', () => ({ createRoomClip: () => ({}) }));
vi.mock('./modulate-blend.js', () => ({ MODULATE_2X: 'modulate-2x' }));

import { LightLayer } from './light-layer.js';

const state: IDeckState = {
  snapshot: () => ({ rooms: {}, fixtures: {} }),
  subscribe: () => () => {},
};

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function contextOf(options: DeckOptions) {
  const slot = new Node();
  const context = {
    renderer: { render: vi.fn() },
    slot,
    scene: options.scene,
    signal: new AbortController().signal,
    render: vi.fn(),
  } as unknown as LayerContext;
  return { slot, context };
}

describe('LightLayer', () => {
  it('composites the light texture over the base with the 2x modulate blend', async () => {
    const { slot, context } = contextOf(OPTIONS);
    const layer = new LightLayer(state, OPTIONS);
    await layer.mount(context);
    const [light] = slot.children;
    expect(light?.blendMode).toBe('modulate-2x');
    layer.unmount();
  });

  it('clears the light texture to the neutral 0.5 grey that leaves the base as it is', async () => {
    const { context } = contextOf(OPTIONS);
    const layer = new LightLayer(state, OPTIONS);
    await layer.mount(context);
    layer.prepare();
    expect(context.renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({ clear: true, clearColor: 0x808080 }),
    );
    layer.unmount();
  });
});
