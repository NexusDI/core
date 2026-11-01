import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONDUITS,
  HATCHES,
  SYSTEMS,
} from '@nexusdi/meridian/scenes/front-page';
import { describe, expect, it } from 'vitest';

import { PLACEMENT } from '../placement';
import {
  ALL_ROOMS,
  CONDUIT_IDS,
  CROPS,
  FRAME,
  HATCH_IDS,
  HIT_PX,
  PARTS_IN_HULL_ORDER,
  ROOM_LABELS,
  SECTIONS,
  SYSTEM_IDS,
  cutPath,
  partsInRun,
  runScale,
  type Part,
  type SectionId,
} from './geometry';

const distance = (left: Part, right: Part) =>
  Math.hypot(left.at[0] - right.at[0], left.at[1] - right.at[1]);

describe('the ship parts', () => {
  it('names every conduit, system and hatch of the scene, and the chart server link', () => {
    expect([...CONDUIT_IDS]).toEqual([...CONDUITS]);
    expect([...SYSTEM_IDS]).toEqual([...SYSTEMS]);
    expect([...HATCH_IDS]).toEqual([...HATCHES]);
    const keys = PARTS_IN_HULL_ORDER.map((part) => `${part.kind}:${part.key}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(
      CONDUITS.length + SYSTEMS.length + HATCHES.length + 1,
    );
  });

  it('lists the parts in hull order, bow to stern', () => {
    const xs = PARTS_IN_HULL_ORDER.map((part) => part.at[0]);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('gives every conduit a route that ends the arrow at its exporter', () => {
    for (const part of PARTS_IN_HULL_ORDER.filter(
      (p) => p.kind === 'conduit',
    )) {
      expect(part.path?.length, part.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('lists the rooms of the cutaway that the placement names', () => {
    const rooms = new Set<string>(ALL_ROOMS);
    for (const section of Object.values(PLACEMENT.hullSections))
      for (const room of section) expect(rooms.has(room), room).toBe(true);
  });

  it('puts each part in the section of its module', () => {
    const moduleOf = new Map(SECTIONS.map((s) => [s.id, s.module]));
    for (const part of PARTS_IN_HULL_ORDER) {
      if (part.kind === 'conduit' || part.kind === 'chart-server') continue;
      // A section opens on the part's own module, except the meridian
      // section, which holds the bridge's conduits and the diagnostics panel.
      expect(moduleOf.get(part.section), part.id).toBe(part.module);
    }
  });
});

describe('the registered frame', () => {
  const markup = readFileSync(
    join(import.meta.dirname, '..', 'meridian-schematic.svg'),
    'utf8',
  );
  const rooms = [
    ...markup.matchAll(
      /<rect[^>]*x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" data-room="([^"]+)"/g,
    ),
  ].map(([, x, y, w, h, id]) => ({
    id: id as string,
    x: Number(x),
    y: Number(y),
    w: Number(w),
    h: Number(h),
  }));

  it('opens on the frame of the committed cutaway', () => {
    expect(FRAME).toEqual([-5, 0, 80, 20]);
    expect(markup).toContain('viewBox="-5 0 80 20"');
  });

  it('puts each system, hatch and the chart link inside a room of its hull section', () => {
    for (const part of PARTS_IN_HULL_ORDER) {
      if (part.kind === 'conduit') continue;
      const inside = rooms.filter(
        (room) =>
          part.at[0] >= room.x &&
          part.at[0] <= room.x + room.w &&
          part.at[1] >= room.y &&
          part.at[1] <= room.y + room.h,
      );
      const sections = Object.entries(PLACEMENT.hullSections)
        .filter(([name]) => name === part.module)
        .flatMap(([, ids]) => ids);
      expect(
        inside.some((room) => sections.includes(room.id)),
        `${part.id} sits in ${inside.map((room) => room.id).join(', ')}`,
      ).toBe(true);
    }
  });
});

describe('the room labels', () => {
  const markup = readFileSync(
    join(import.meta.dirname, '..', 'meridian-schematic.svg'),
    'utf8',
  );

  it('name a room of the schematic and the module the placement gives it', () => {
    for (const label of ROOM_LABELS) {
      expect(markup, label.room).toContain(`data-room="${label.room}"`);
      const modules = Object.entries(PLACEMENT.hullSections)
        .filter(([, ids]) => ids.includes(label.room))
        .map(([name]) => name);
      expect(modules, label.room).toEqual([label.module]);
    }
  });

  it('label each room once', () => {
    const rooms = ROOM_LABELS.map((label) => label.room);
    expect(new Set(rooms).size).toBe(rooms.length);
  });
});

describe('the hit areas', () => {
  // The wide stage crops the frame to 72.5 m and fills 1344 px.
  const wide = 1344 / 72.5;
  it('keeps the 24 px circles apart on a wide screen', () => {
    for (const [i, left] of PARTS_IN_HULL_ORDER.entries())
      for (const right of PARTS_IN_HULL_ORDER.slice(i + 1))
        expect(
          distance(left, right) * wide,
          `${left.id} ${right.id}`,
        ).toBeGreaterThanOrEqual(HIT_PX.fine);
  });

  it('shows every part of a section in one of its runs', () => {
    for (const { id } of SECTIONS) {
      const shown = CROPS[id].runs.flatMap((_, run) => partsInRun(id, run));
      const all = PARTS_IN_HULL_ORDER.filter((part) => part.section === id);
      expect(shown.map((p) => p.id).sort(), id).toEqual(
        all.map((p) => p.id).sort(),
      );
    }
  });

  it.each(SECTIONS.map((s) => s.id))(
    'draws %s at 5 px/m or more at 358 px, with no 44 px circles overlapping',
    (id: SectionId) => {
      const ppm = runScale(id, 358);
      expect(ppm).toBeGreaterThanOrEqual(5);
      const parts = PARTS_IN_HULL_ORDER.filter((part) => part.section === id);
      for (const [i, left] of parts.entries())
        for (const right of parts.slice(i + 1))
          expect(
            distance(left, right) * ppm,
            `${left.id} ${right.id}`,
          ).toBeGreaterThanOrEqual(HIT_PX.coarse);
    },
  );
});

describe('cutPath', () => {
  it('leaves a gap of 0.8 m around the handle', () => {
    const [before, after] = cutPath(
      [
        [0, 0],
        [4, 0],
      ],
      [2, 0],
    );
    expect(before?.at(-1)).toEqual([1.6, 0]);
    expect(after?.[0]).toEqual([2.4, 0]);
  });

  it('keeps a corner that lies outside the gap', () => {
    const [before, after] = cutPath(
      [
        [0, 0],
        [0, 3],
        [3, 3],
      ],
      [2, 3],
    );
    expect(before).toContainEqual([0, 3]);
    expect(after).toHaveLength(2);
  });
});
