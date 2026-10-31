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

  it('has a data-door and a data-fixture for every door and fixture', () => {
    const doors = ids('data-door');
    const fixtures = ids('data-fixture');
    expect(geometry.doors.filter((door) => !doors.has(door.id))).toEqual([]);
    const want = geometry.compartments.flatMap((room) =>
      room.fixtures.map((fixture) => fixture.id),
    );
    expect(want.filter((id) => !fixtures.has(id))).toEqual([]);
  });

  it('carries no paint and no text, so the page CSS styles it', () => {
    expect(svg).not.toMatch(/\sfill=|\sstroke=|#[0-9a-f]{3,8}\b|<text/i);
  });

  it('stays under 60 kB gzipped', () => {
    expect(gzipSync(svg).length).toBeLessThan(60 * 1024);
  });
});
