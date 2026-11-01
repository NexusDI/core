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
} from './room-labels';

const markup = readFileSync(
  join(import.meta.dirname, '..', 'meridian-schematic.svg'),
  'utf8',
);

// The stage is 1344 px wide at 1440 and about 1184 px at 1280.
describe.each([
  ['1440', 1344],
  ['1280', 1184],
])('the room labels at %s', (_name, stage) => {
  const ppm = stage / WIDE_CROP[2];
  const placed = layoutRoomLabels(roomRects(markup), ppm);

  it('places every label of the table', () => {
    expect(placed.map((entry) => entry.label.room).sort()).toEqual(
      ROOM_LABELS.map((label) => label.room).sort(),
    );
  });

  it('keeps every label inside the crop and off every other label', () => {
    for (const [i, a] of placed.entries()) {
      expect(a.box.x, a.label.room).toBeGreaterThanOrEqual(WIDE_CROP[0]);
      expect(a.box.x + a.box.w, a.label.room).toBeLessThanOrEqual(
        WIDE_CROP[0] + WIDE_CROP[2],
      );
      for (const b of placed.slice(i + 1))
        expect(overlap(a.box, b.box), `${a.label.room} ${b.label.room}`).toBe(
          false,
        );
    }
  });

  it('keeps every label and leader off every hit circle and off the idle hint', () => {
    const obstacles = [...glyphBoxes(ppm), hintBox(ppm)];
    for (const entry of placed)
      for (const box of obstacles) {
        expect(overlap(entry.box, box), entry.label.room).toBe(false);
        if (entry.leader)
          expect(
            segmentHitsBox(entry.leader[0], entry.leader[1], box),
            `${entry.label.room} leader`,
          ).toBe(false);
      }
  });

  it('keeps the leaders off the labels of other rooms', () => {
    for (const entry of placed)
      for (const other of placed)
        if (entry !== other && entry.leader)
          expect(
            segmentHitsBox(entry.leader[0], entry.leader[1], other.box),
            `${entry.label.room} leader over ${other.label.room}`,
          ).toBe(false);
  });
});
