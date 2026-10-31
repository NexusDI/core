import type { WebGLRenderer } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPTIONS } from '../test-support.js';

import type { FrameSize, IDeckCompositor, IPixiHost } from './contracts.js';
import { DeckViewController } from './deck-view.js';

/** A canvas that records its listeners. */
function fakeCanvas() {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const canvas = {
    addEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.get(type)?.delete(listener);
    },
  } as unknown as HTMLCanvasElement;
  const fire = (type: string) => {
    for (const listener of listeners.get(type) ?? [])
      listener({ preventDefault() {} } as Event);
  };
  return {
    canvas,
    fire,
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

function setup(options: { slowStart?: boolean } = {}) {
  const renderer = {} as WebGLRenderer;
  let release!: () => void;
  const start = vi.fn((_canvas: HTMLCanvasElement, _size: FrameSize) =>
    options.slowStart
      ? new Promise<WebGLRenderer>((resolve) => {
          release = () => resolve(renderer);
        })
      : Promise.resolve(renderer),
  );
  const host: IPixiHost = { start, release: vi.fn() };
  const compositor: IDeckCompositor = {
    mount: vi.fn(() => Promise.resolve()),
    render: vi.fn(),
    onFrame: vi.fn(() => () => {}),
    unmount: vi.fn(),
  };
  const view = new DeckViewController(host, compositor, OPTIONS);
  return { view, host, compositor, start, finishStart: () => release() };
}

const frames = vi.fn();

beforeEach(() => {
  frames.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames();
    return setTimeout(() => callback(0), 0);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DeckViewController', () => {
  it('resolves attach after two frames, with the scene drawn once', async () => {
    const { view, compositor } = setup();
    const { canvas } = fakeCanvas();
    await view.attach(canvas);
    expect(compositor.mount).toHaveBeenCalledOnce();
    expect(compositor.render).toHaveBeenCalledOnce();
    // One frame is not enough: the first runs before the paint, the second after it.
    expect(frames).toHaveBeenCalledTimes(2);
  });

  it('attaches again on the same canvas after a detach, and keeps the renderer', async () => {
    const { view, host, compositor, start } = setup();
    const { canvas, count } = fakeCanvas();
    await view.attach(canvas);
    view.detach();
    expect(count('webglcontextlost')).toBe(0);
    await view.attach(canvas);
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls.map((call) => call[0])).toEqual([canvas, canvas]);
    expect(compositor.mount).toHaveBeenCalledTimes(2);
    expect(host.release).not.toHaveBeenCalled();
    expect(count('webglcontextlost')).toBe(1);
  });

  it('rejects an attach that a detach overtakes, and mounts nothing', async () => {
    const { view, compositor, finishStart } = setup({ slowStart: true });
    const { canvas } = fakeCanvas();
    const attaching = view.attach(canvas);
    view.detach();
    finishStart();
    await expect(attaching).rejects.toThrow();
    expect(compositor.mount).not.toHaveBeenCalled();
  });

  it('hands the abort signal of the attach to the compositor, and aborts it on detach', async () => {
    const { view, compositor } = setup();
    const { canvas } = fakeCanvas();
    await view.attach(canvas);
    const signal = vi.mocked(compositor.mount).mock.calls[0]?.[2];
    expect(signal?.aborted).toBe(false);
    view.detach();
    expect(signal?.aborted).toBe(true);
  });

  it('reports a lost and a restored context, and redraws on the way back', async () => {
    const { view, compositor } = setup();
    const { canvas, fire } = fakeCanvas();
    const heard: string[] = [];
    view.onStatus((status) => heard.push(status));
    await view.attach(canvas);
    fire('webglcontextlost');
    fire('webglcontextrestored');
    expect(heard).toEqual(['lost', 'restored']);
    expect(compositor.render).toHaveBeenCalledTimes(2);
  });

  it('hands onFrame to the compositor and returns its way to stop', () => {
    const { view, compositor } = setup();
    const stop = vi.fn();
    vi.mocked(compositor.onFrame).mockReturnValueOnce(stop);
    const listener = vi.fn();
    expect(view.onFrame(listener)).toBe(stop);
    expect(compositor.onFrame).toHaveBeenCalledWith(listener);
  });

  it('frees the layers when a mount fails, and rejects with its error', async () => {
    const { view, compositor } = setup();
    vi.mocked(compositor.mount).mockRejectedValueOnce(new Error('mask 404'));
    await expect(view.attach(fakeCanvas().canvas)).rejects.toThrow('mask 404');
    expect(compositor.unmount).toHaveBeenCalled();
  });
});
