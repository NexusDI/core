import { beforeEach, describe, expect, it, vi } from 'vitest';

const made: {
  init: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}[] = [];

vi.mock('pixi.js', () => ({
  WebGLRenderer: class {
    init = vi.fn(() => Promise.resolve());
    destroy = vi.fn();
    constructor() {
      made.push(this);
    }
  },
}));
vi.mock('pixi.js/filters', () => ({}));

import { createPixiHost } from './pixi-host.js';

const size = { width: 2048, height: 512 };
const canvas = () => ({}) as HTMLCanvasElement;

beforeEach(() => {
  made.length = 0;
});

describe('the Pixi host', () => {
  it('returns the renderer it made for a canvas when asked again for that canvas', async () => {
    const host = await createPixiHost();
    const one = canvas();
    const first = await host.start(one, size);
    const second = await host.start(one, size);
    expect(second).toBe(first);
    expect(made).toHaveLength(1);
    expect(made[0]?.init).toHaveBeenCalledOnce();
    expect(made[0]?.destroy).not.toHaveBeenCalled();
  });

  it('releases the renderer and makes another for a different canvas', async () => {
    const host = await createPixiHost();
    const first = await host.start(canvas(), size);
    const second = await host.start(canvas(), size);
    expect(second).not.toBe(first);
    expect(made).toHaveLength(2);
    expect(made[0]?.destroy).toHaveBeenCalledOnce();
  });

  it('destroys the renderer when the host disposes, and only then', async () => {
    const host = await createPixiHost();
    await host.start(canvas(), size);
    expect(made[0]?.destroy).not.toHaveBeenCalled();
    host[Symbol.dispose]();
    expect(made[0]?.destroy).toHaveBeenCalledOnce();
  });
});
