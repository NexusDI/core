import { afterEach, describe, expect, it, vi } from 'vitest';

import { CROPS } from './geometry';
import { DECK_PPM, RunMirror, cropRect } from './run-mirror';

afterEach(() => vi.restoreAllMocks());

/** A canvas whose 2D context records its draws. */
function canvas(width = 100, height = 50) {
  const draws: unknown[][] = [];
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  const context = {
    drawImage: (...args: unknown[]) => draws.push(args),
    clearRect: () => undefined,
  };
  element.getContext = (() => context) as unknown as typeof element.getContext;
  return { element, draws };
}

describe('the rectangle of a run on the deck canvas', () => {
  it('maps the metres of the crop at 25.6 px per metre from the frame origin', () => {
    const rect = cropRect('tactical', 0);
    const [from, to] = CROPS.tactical.runs[0] as readonly [number, number];
    expect(rect?.[0]).toBeCloseTo((from + 5) * DECK_PPM);
    expect(rect?.[2]).toBeCloseTo((to - from) * DECK_PPM);
    expect(rect?.[1]).toBeCloseTo(CROPS.tactical.y[0] * DECK_PPM);
  });

  it('names no rectangle for a run the section does not have', () => {
    expect(cropRect('meridian', 1)).toBeNull();
  });

  it('keeps every run inside the 2048 by 512 deck', () => {
    for (const [id, crop] of Object.entries(CROPS))
      for (let run = 0; run < crop.runs.length; run++) {
        const [x, y, w, h] = cropRect(id as keyof typeof CROPS, run) ?? [
          0, 0, 0, 0,
        ];
        expect(x, id).toBeGreaterThanOrEqual(0);
        expect(y, id).toBeGreaterThanOrEqual(0);
        expect(x + w, id).toBeLessThanOrEqual(2048);
        expect(y + h, id).toBeLessThanOrEqual(512);
      }
  });
});

describe('the run mirror', () => {
  it('paints nothing before a frame, and the crops of the shown section after it', () => {
    const mirror = new RunMirror();
    const first = canvas();
    const second = canvas();
    mirror.register(0, first.element);
    mirror.register(1, second.element);
    mirror.show('tactical');
    expect(first.draws).toEqual([]);
    const deck = canvas(2048, 512);
    const snapshot = canvas(2048, 512);
    vi.spyOn(document, 'createElement').mockImplementationOnce(
      () => snapshot.element,
    );
    mirror.frame(deck.element);
    expect(mirror.ready).toBe(true);
    expect(snapshot.draws).toHaveLength(1);
    expect(first.draws).toHaveLength(1);
    expect(second.draws).toHaveLength(1);
    expect(first.draws[0]?.slice(1, 5)).toEqual(cropRect('tactical', 0));
  });

  it('repaints from the snapshot when a section opens, with no new frame', () => {
    const mirror = new RunMirror();
    const run = canvas();
    mirror.register(0, run.element);
    const snapshot = canvas(2048, 512);
    vi.spyOn(document, 'createElement').mockImplementationOnce(
      () => snapshot.element,
    );
    mirror.frame(canvas(2048, 512).element);
    run.draws.length = 0;
    mirror.show('comms');
    expect(run.draws).toHaveLength(1);
    expect(run.draws[0]?.slice(1, 5)).toEqual(cropRect('comms', 0));
  });

  it('forgets a run that unmounts', () => {
    const mirror = new RunMirror();
    const run = canvas();
    mirror.register(0, run.element);
    mirror.register(0, null);
    const snapshot = canvas(2048, 512);
    vi.spyOn(document, 'createElement').mockImplementationOnce(
      () => snapshot.element,
    );
    mirror.frame(canvas(2048, 512).element);
    expect(run.draws).toEqual([]);
  });
});
