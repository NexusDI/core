import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface Geometry {
  compartments: {
    id: string;
    fixtures: { id: string }[];
    boxes: { x: [number, number]; z: [number, number] }[];
  }[];
  doors: { id: string }[];
}

const svg = readFileSync(
  join(import.meta.dirname, 'meridian-schematic.svg'),
  'utf8',
);
const geometry = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      '../../../../examples/meridian-systems/deck/meridian.geometry.json',
    ),
    'utf8',
  ),
) as Geometry;

function ids(attribute: string): Set<string> {
  return new Set(
    [...svg.matchAll(new RegExp(`${attribute}="([^"]*)"`, 'g'))].map(
      (match) => match[1] ?? '',
    ),
  );
}

describe('the committed schematic cutaway', () => {
  it('has a data-room for every room of the geometry', () => {
    const have = ids('data-room');
    const want = geometry.compartments.map((room) => room.id);
    expect(want.filter((id) => !have.has(id))).toEqual([]);
    expect([...have].filter((id) => !want.includes(id))).toEqual([]);
  });

  it('has exactly the doors and fixtures of the geometry', () => {
    const doors = [...ids('data-door')].sort();
    expect(doors).toEqual(geometry.doors.map((door) => door.id).sort());
    const fixtures = [...ids('data-fixture')].sort();
    expect(fixtures).toEqual(
      geometry.compartments
        .flatMap((room) => room.fixtures.map((fixture) => fixture.id))
        .sort(),
    );
  });

  it('gives the chart room x 10 to 14 and the habitat the rooms around it', () => {
    const rect = (room: string) =>
      [
        ...svg.matchAll(
          new RegExp(
            `<rect class="sv-room" x="([\\d.-]+)" y="[\\d.-]+" width="([\\d.-]+)" height="[\\d.-]+" data-room="${room}"`,
            'g',
          ),
        ),
      ].map((match) => [Number(match[1]), Number(match[1]) + Number(match[2])]);
    expect(rect('chart-room')).toEqual([[10.05, expect.closeTo(13.95, 6)]]);
    expect(rect('habitat').every(([from]) => (from ?? 0) >= 14)).toBe(true);
  });

  it('draws no two doors over the same area', () => {
    const rects = [
      ...svg.matchAll(
        /<rect class="sv-door" x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)" data-door="([^"]+)"/g,
      ),
    ].map((match) => ({
      id: match[5] ?? '',
      x: Number(match[1]),
      y: Number(match[2]),
      w: Number(match[3]),
      h: Number(match[4]),
    }));
    expect(rects).toHaveLength(geometry.doors.length);
    const clashes: string[] = [];
    rects.forEach((a, index) => {
      for (const b of rects.slice(index + 1)) {
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX > 1e-6 && overlapY > 1e-6) {
          clashes.push(`${a.id} / ${b.id}`);
        }
      }
    });
    expect(clashes).toEqual([]);
  });

  it('draws no two room rectangles over the same area', () => {
    const rects = [
      ...svg.matchAll(
        /<rect class="sv-room" x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)" data-room="([^"]+)"/g,
      ),
    ].map((match) => ({
      id: match[5] ?? '',
      x: Number(match[1]),
      y: Number(match[2]),
      w: Number(match[3]),
      h: Number(match[4]),
    }));
    expect(rects.length).toBeGreaterThanOrEqual(geometry.compartments.length);
    const clashes: string[] = [];
    rects.forEach((a, index) => {
      for (const b of rects.slice(index + 1)) {
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX > 1e-6 && overlapY > 1e-6) {
          clashes.push(`${a.id} / ${b.id}`);
        }
      }
    });
    expect(clashes).toEqual([]);
  });

  it('lets the smaller room keep an overlap: the chart room and the airlock over the habitat', () => {
    const area = (id: string) =>
      [
        ...svg.matchAll(
          new RegExp(
            `<rect class="sv-room" x="[\\d.-]+" y="[\\d.-]+" width="([\\d.-]+)" height="([\\d.-]+)" data-room="${id}"`,
            'g',
          ),
        ),
      ].reduce((sum, m) => sum + Number(m[1]) * Number(m[2]), 0);
    const painted = (id: string) => {
      const room = geometry.compartments.find((each) => each.id === id);
      return (room?.boxes ?? []).reduce(
        (sum, box) =>
          sum + (box.x[1] - box.x[0] - 0.1) * (box.z[1] - box.z[0] - 0.1),
        0,
      );
    };
    expect(area('chart-room')).toBeCloseTo(painted('chart-room'), 1);
    expect(area('airlock')).toBeCloseTo(painted('airlock'), 1);
    expect(area('habitat')).toBeLessThan(painted('habitat'));
  });

  it('uses the frame of the painted side views as its viewBox', () => {
    expect(/<svg [^>]*viewBox="([^"]*)"/.exec(svg)?.[1]).toBe('-5 0 80 20');
    for (const view of ['cutaway', 'side']) {
      const sidecar = JSON.parse(
        readFileSync(
          join(import.meta.dirname, '..', 'ship-art', view, `${view}.json`),
          'utf8',
        ),
      ) as { frame: string };
      expect(sidecar.frame).toBe('-5 0 80 20');
    }
  });

  it('has no title and no paint, so the page names and styles it', () => {
    expect(svg).not.toContain('<title');
  });

  it('carries no paint and no text, so the page CSS styles it', () => {
    expect(svg).not.toMatch(/\sfill=|\sstroke=|#[0-9a-f]{3,8}\b|<text/i);
  });

  it('stays under 60 kB gzipped', () => {
    expect(gzipSync(svg).length).toBeLessThan(60 * 1024);
  });
});
