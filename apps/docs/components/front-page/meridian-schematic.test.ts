import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface Geometry {
  compartments: { id: string; fixtures: { id: string }[] }[];
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
