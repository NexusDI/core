import type { WebGLRenderer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { OPTIONS } from '../test-support.js';

import { LayerCompositor } from './compositor.js';
import type { IDeckLayer, LayerContext } from './contracts.js';

const renderer = { render: vi.fn() } as unknown as WebGLRenderer;

/** A layer whose mount waits until the test lets it finish. */
function slowLayer(name: string, log: string[]) {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const layer: IDeckLayer = {
    async mount() {
      log.push(`${name}:start`);
      await gate;
      log.push(`${name}:built`);
    },
    prepare: () => log.push(`${name}:prepare`),
    unmount: () => log.push(`${name}:unmount`),
  };
  return { layer, finish };
}

describe('LayerCompositor', () => {
  it('mounts the layers in order and prepares each before it draws', async () => {
    const log: string[] = [];
    const contexts: LayerContext[] = [];
    const layers = ['base', 'light'].map((name): IDeckLayer => ({
      mount: (context) => {
        contexts.push(context);
        log.push(`${name}:mount`);
        return Promise.resolve();
      },
      prepare: () => log.push(`${name}:prepare`),
      unmount: () => log.push(`${name}:unmount`),
    }));
    const compositor = new LayerCompositor(layers);
    await compositor.mount(
      renderer,
      OPTIONS.scene,
      new AbortController().signal,
    );
    compositor.render();
    expect(log).toEqual([
      'base:mount',
      'light:mount',
      'base:prepare',
      'light:prepare',
    ]);
    expect(contexts[0]?.slot).not.toBe(contexts[1]?.slot);
    compositor.unmount();
    expect(log.slice(-2)).toEqual(['light:unmount', 'base:unmount']);
  });

  it('tells its frame listeners after each draw, only while mounted, and stops on request', async () => {
    const order: string[] = [];
    const draw = vi.fn(() => order.push('draw'));
    const drawing = { render: draw } as unknown as WebGLRenderer;
    const layer: IDeckLayer = {
      mount: () => Promise.resolve(),
      unmount: () => {},
    };
    const compositor = new LayerCompositor([layer]);
    const heard = vi.fn(() => order.push('frame'));
    const stop = compositor.onFrame(heard);
    compositor.render();
    expect(heard).not.toHaveBeenCalled();
    await compositor.mount(
      drawing,
      OPTIONS.scene,
      new AbortController().signal,
    );
    compositor.render();
    expect(order).toEqual(['draw', 'frame']);
    stop();
    compositor.render();
    expect(heard).toHaveBeenCalledOnce();
    // A listener registered before unmount does not hear a later mount.
    compositor.onFrame(heard);
    compositor.unmount();
    await compositor.mount(
      drawing,
      OPTIONS.scene,
      new AbortController().signal,
    );
    compositor.render();
    expect(heard).toHaveBeenCalledOnce();
  });

  it('unmounts a layer that finishes after the abort, and mounts no later layer', async () => {
    const log: string[] = [];
    const first = slowLayer('first', log);
    const second = slowLayer('second', log);
    const compositor = new LayerCompositor([first.layer, second.layer]);
    const abort = new AbortController();
    const mounting = compositor.mount(renderer, OPTIONS.scene, abort.signal);
    const settled = expect(mounting).rejects.toThrow();
    await Promise.resolve();
    // The view detaches: the compositor unmounts what it has, then the layer finishes.
    abort.abort();
    compositor.unmount();
    first.finish();
    await settled;
    expect(log).toEqual([
      'first:start',
      'first:unmount',
      'first:built',
      'first:unmount',
    ]);
    expect(log.some((entry) => entry.startsWith('second'))).toBe(false);
  });

  it('leaves a newer mount alone when an older layer finishes late', async () => {
    const log: string[] = [];
    const old = slowLayer('old', log);
    const compositor = new LayerCompositor([old.layer]);
    const abort = new AbortController();
    const mounting = compositor.mount(renderer, OPTIONS.scene, abort.signal);
    const settled = expect(mounting).rejects.toThrow();
    await Promise.resolve();
    abort.abort();
    compositor.unmount();
    const fresh = new AbortController();
    const again = compositor.mount(renderer, OPTIONS.scene, fresh.signal);
    old.finish();
    await settled;
    // The old layer's late finish must not unmount the newer mount's stage.
    expect(log.filter((entry) => entry === 'old:unmount')).toHaveLength(1);
    compositor.unmount();
    await again.catch(() => undefined);
  });
});
