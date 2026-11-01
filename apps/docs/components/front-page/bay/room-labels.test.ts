import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROOM_LABELS, WIDE_CROP } from './geometry';
import {
  glyphBoxes,
  hintBox,
  layoutRoomLabels,
  overlap,
  roomRects,
  segmentHitsBox,
  standingNoteBox,
} from './room-labels';

const markup = readFileSync(
  join(import.meta.dirname, '..', 'meridian-schematic.svg'),
  'utf8',
);
const rects = roomRects(markup);

// The stage is 1344 px wide at a 1440 viewport and 96 px less under it.
const WIDTHS = [544, 640, 768, 900, 1024, 1184, 1344];

describe('the room rects', () => {
  it('read every room that a label names, whatever the order of the attributes', () => {
    for (const label of ROOM_LABELS)
      expect(rects.get(label.room), label.room).toBeDefined();
    const shuffled = roomRects(
      '<rect data-room="a" height="4" width="3" y="2" x="1"/>',
    );
    expect(shuffled.get('a')).toEqual([1, 2, 3, 4]);
  });

  it('skip a rect that lacks a number', () => {
    expect(roomRects('<rect data-room="a" x="1" y="2" width="3"/>').size).toBe(
      0,
    );
  });
});

describe.each(WIDTHS)('the room labels on a stage %i px wide', (stage) => {
  const ppm = stage / WIDE_CROP[2];
  const layout = layoutRoomLabels(rects, ppm);

  it('is either a clean set of plates or the captions', () => {
    if (layout.mode === 'captions') {
      expect(layout.labels).toEqual([]);
      return;
    }
    expect(layout.labels.map((entry) => entry.label.room).sort()).toEqual(
      ROOM_LABELS.map((label) => label.room).sort(),
    );
    const obstacles = [...glyphBoxes(ppm), hintBox(ppm), standingNoteBox(ppm)];
    for (const [i, a] of layout.labels.entries()) {
      expect(a.box.x, a.label.room).toBeGreaterThanOrEqual(WIDE_CROP[0]);
      expect(a.box.x + a.box.w, a.label.room).toBeLessThanOrEqual(
        WIDE_CROP[0] + WIDE_CROP[2] + 1e-9,
      );
      for (const b of layout.labels.slice(i + 1))
        expect(overlap(a.box, b.box), `${a.label.room} ${b.label.room}`).toBe(
          false,
        );
      for (const box of obstacles) {
        expect(overlap(a.box, box), `${a.label.room} plate`).toBe(false);
        if (a.leader)
          expect(
            segmentHitsBox(a.leader[0], a.leader[1], box),
            `${a.label.room} leader`,
          ).toBe(false);
      }
      for (const b of layout.labels)
        if (b !== a && a.leader)
          expect(
            segmentHitsBox(a.leader[0], a.leader[1], b.box),
            `${a.label.room} leader over ${b.label.room}`,
          ).toBe(false);
    }
  });

  it('keeps the plates at the wide widths of a desktop', () => {
    if (stage >= 1184) expect(layout.mode).toBe('callouts');
  });
});

it('reports captions, and no plate, when a room is missing', () => {
  const missing = new Map(rects);
  missing.delete('bridge');
  expect(layoutRoomLabels(missing, 1344 / WIDE_CROP[2]).mode).toBe('captions');
});
