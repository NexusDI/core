import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { SHIP_GEOMETRY } from '../../src/geometry/ship-geometry';
import {
  MAP_CODES,
  MAP_RECORDS,
  type MapDefinition,
  type RecordPath,
} from '../../src/maps/map-definition';

import { mapProblems, objectiveProblems } from './guard';

const ROOT = join(import.meta.dirname, '..', '..');
const MAPS = join(ROOT, 'deck', 'maps');
const FIXTURES = join(import.meta.dirname, 'fixtures');
const SCHEMA_FILE = join(MAPS, 'map.schema.json');

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf-8'));

const schema = read(SCHEMA_FILE) as object;
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);

const mapFiles = readdirSync(MAPS).filter((name) => name.endsWith('.map.json'));
const load = (dir: string, name: string) =>
  read(join(dir, name)) as MapDefinition;

const CONSOLE_MAPS = [
  'console-engineering',
  'console-life-support',
  'console-safety',
  'console-airlock',
  'console-comms',
  'console-helm',
  'console-ftl',
  'console-weapons',
  'console-diagnostics',
];

const accepts = (map: unknown) => validate(map) === true;

/** A copy of the airlock map with `change` applied. */
const airlock = (change: Record<string, unknown>) => ({
  ...load(MAPS, 'console-airlock.map.json'),
  ...change,
});

describe('the map schema', () => {
  it('carries version 1 in its id', () => {
    expect((schema as { $id: string }).$id).toMatch(/\/1\.json$/);
  });

  it('matches what the script writes from MAP_RECORDS and MAP_CODES', () => {
    const dir = mkdtempSync(join(tmpdir(), 'map-schema-'));
    try {
      const out = join(dir, 'map.schema.json');
      execFileSync(
        process.execPath,
        [join(ROOT, 'scripts', 'write-map-schema.mjs'), '--out', out],
        { stdio: 'pipe' },
      );
      expect(read(SCHEMA_FILE)).toEqual(read(out));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists every record path and code the constants name', () => {
    const defs = (schema as { $defs: Record<string, { enum: string[] }> })
      .$defs;
    expect(defs.recordPath.enum).toEqual([...MAP_RECORDS]);
    expect(defs.alarmCode.enum).toEqual([...MAP_CODES.alarm]);
    expect(defs.refusalCode.enum).toEqual([...MAP_CODES.refused]);
  });

  it('refuses a field it does not know', () => {
    expect(accepts(airlock({}))).toBe(true);
    expect(accepts(airlock({ titel: 'typo' }))).toBe(false);
    expect(
      accepts(
        airlock({
          camera: { deck: 'main', focus: 'airlock', zoom: 'room', x: 1 },
        }),
      ),
    ).toBe(false);
  });

  it('refuses a record path or a code the library lacks', () => {
    const when = (w: object) =>
      airlock({
        triggers: [{ id: 'one', when: w, then: [{ announce: 'x' }] }],
      });
    expect(accepts(when({ record: 'ftl.status', is: 'charged' }))).toBe(true);
    expect(accepts(when({ record: 'ftl.state', is: 'charged' }))).toBe(false);
    expect(accepts(when({ alarm: 'FIRE', room: 'habitat' }))).toBe(true);
    expect(accepts(when({ alarm: 'FLOOD', room: 'habitat' }))).toBe(false);
    expect(accepts(when({ refused: 'MERIDIAN_INTERLOCK' }))).toBe(true);
    expect(accepts(when({ refused: 'MERIDIAN_NOPE' }))).toBe(false);
  });

  it('takes a zoom level or a step and nothing between', () => {
    const zoom = (z: unknown) =>
      airlock({ camera: { deck: 'main', focus: 'airlock', zoom: z } });
    for (const ok of [
      'ship',
      'deck',
      'section',
      'room',
      6,
      8,
      12,
      16,
      24,
      32,
      48,
    ]) {
      expect(accepts(zoom(ok))).toBe(true);
    }
    for (const bad of ['street', 7, 100, '12'])
      expect(accepts(zoom(bad))).toBe(false);
  });

  it('allows four readouts in a callout and refuses five', () => {
    const show = (names: string[]) =>
      airlock({ callouts: [{ at: 'airlock', show: names }] });
    expect(accepts(show(['a', 'b', 'c', 'd']))).toBe(true);
    expect(accepts(show(['a', 'b', 'c', 'd', 'e']))).toBe(false);
  });

  it('names the room light powered, unpowered or alarm', () => {
    const light = (l: string) =>
      airlock({ start: { rooms: { habitat: { light: l } } } });
    expect(accepts(light('powered'))).toBe(true);
    expect(accepts(light('off'))).toBe(false);
  });

  it('wants a text or a readout list on a callout effect', () => {
    const effect = (e: object) =>
      airlock({ triggers: [{ id: 'one', when: { enter: true }, then: [e] }] });
    expect(accepts(effect({ callout: 'airlock', text: 'hi' }))).toBe(true);
    expect(accepts(effect({ callout: 'airlock' }))).toBe(false);
  });
});

describe('the record paths and codes', () => {
  it('type-check against the telemetry frame and the library unions', () => {
    const path: RecordPath = 'ftl.status';
    // @ts-expect-error the frame has no ftl.state
    const wrong: RecordPath = 'ftl.state';
    expect([path, wrong]).toHaveLength(2);
  });
});

describe('deck/maps', () => {
  it('holds the nine console maps and the schema', () => {
    expect(mapFiles.sort()).toEqual(
      CONSOLE_MAPS.map((id) => `${id}.map.json`).sort(),
    );
  });

  it.each(mapFiles)('%s validates against the schema', (name) => {
    const map = read(join(MAPS, name));
    expect(validate(map) ? [] : validate.errors).toEqual([]);
  });

  it.each(mapFiles)(
    '%s names the id of its file and no id the geometry lacks',
    (name) => {
      const map = load(MAPS, name);
      expect(`${map.id}.map.json`).toBe(name);
      expect(mapProblems(map, SHIP_GEOMETRY)).toEqual([]);
    },
  );

  it('holds demo maps alone', () => {
    const surfaces = mapFiles.map((name) => load(MAPS, name).surface);
    expect(new Set(surfaces)).toEqual(new Set(['demo']));
  });

  it('names no station fixture and loads no bridge-stations map', () => {
    const text = mapFiles
      .map((name) => readFileSync(join(MAPS, name), 'utf-8'))
      .join();
    expect(text).not.toContain('station-bank');
    expect(mapFiles).not.toContain('bridge-stations.map.json');
  });
});

describe('the guard', () => {
  const fixture = (name: string) => load(FIXTURES, `${name}.map.json`);

  it.each(['academy-valid', 'scene-valid', 'academy-refused', 'scene-refused'])(
    'fixture %s validates against the schema',
    (name) => {
      expect(validate(fixture(name)) ? [] : validate.errors).toEqual([]);
    },
  );

  it('passes an academy map whose ship effects come from container conditions', () => {
    expect(mapProblems(fixture('academy-valid'), SHIP_GEOMETRY)).toEqual([]);
  });

  it('passes a scene map whose ship effects come from container conditions', () => {
    expect(mapProblems(fixture('scene-valid'), SHIP_GEOMETRY)).toEqual([]);
  });

  it('refuses an academy map that lights the ship from enter, select or a record', () => {
    expect(mapProblems(fixture('academy-refused'), SHIP_GEOMETRY)).toEqual([
      'trigger "enter-lights": a academy map changes the ship only from a container condition',
      'trigger "select-sets": a academy map changes the ship only from a container condition',
      'trigger "telemetry-conduit": a academy map changes the ship only from a container condition',
      'trigger "wrong-hub": passed is valid on academy-hub alone',
    ]);
  });

  it('refuses a scene map that lights the ship from enter or an alarm', () => {
    expect(mapProblems(fixture('scene-refused'), SHIP_GEOMETRY)).toEqual([
      'trigger "enter-lights": a scene map changes the ship only from a container condition',
      'trigger "alarm-sets": a scene map changes the ship only from a container condition',
    ]);
  });

  it('allows passed on academy-hub', () => {
    const hub = {
      ...fixture('academy-refused'),
      id: 'academy-hub',
      triggers: [
        {
          id: 'badge',
          when: { passed: 'first-mission' },
          then: [{ announce: 'Passed.' }],
        },
      ],
    } as MapDefinition;
    expect(mapProblems(hub, SHIP_GEOMETRY)).toEqual([]);
  });

  it('lets a demo map light the ship from the telemetry', () => {
    const demo = {
      ...fixture('academy-refused'),
      surface: 'demo',
      triggers: [
        {
          id: 'enter-lights',
          when: { enter: true },
          then: [{ room: 'habitat', light: 'alarm' }],
        },
      ],
    } as MapDefinition;
    expect(mapProblems(demo, SHIP_GEOMETRY)).toEqual([]);
  });

  it('refuses an id the geometry lacks', () => {
    const map = airlock({
      decks: ['main', 'roof'],
      directory: ['airlock', 'airlock-hatch'],
      start: {
        fixtures: { 'airlock.nope': 'on' },
        doors: { 'no-door': 'open' },
      },
    }) as MapDefinition;
    expect(mapProblems(map, SHIP_GEOMETRY)).toEqual([
      'decks: no deck "roof"',
      'start.fixtures: no fixture "airlock.nope"',
      'start.doors: no door "no-door"',
      'directory: no room, door or fixture "airlock-hatch"',
    ]);
  });

  it('refuses a state the fixture does not list', () => {
    const map = airlock({
      start: {
        fixtures: { 'habitat.lockers': 'on', 'bridge.helm': 'damaged' },
      },
    }) as MapDefinition;
    expect(mapProblems(map, SHIP_GEOMETRY)).toEqual([
      'start.fixtures: fixture "habitat.lockers" has no state "on"',
      'start.fixtures: fixture "bridge.helm" has no state "damaged"',
    ]);
  });

  it('refuses a camera deck outside the map and a trigger that names a missing conduit', () => {
    const map = airlock({
      camera: { deck: 'upper', focus: 'airlock', zoom: 'section' },
      triggers: [
        {
          id: 'one',
          when: { enter: true },
          then: [{ conduit: 'power.nope', state: 'broken' }],
        },
      ],
    }) as MapDefinition;
    expect(mapProblems(map, SHIP_GEOMETRY)).toEqual([
      'camera.deck: "upper" is not one of the map\'s decks',
      'trigger "one" conduit: no conduit "power.nope"',
    ]);
  });

  it('checks the objectives of an academy map', () => {
    const map = fixture('academy-valid');
    expect(objectiveProblems(map, ['power-habitat'])).toEqual([]);
    expect(objectiveProblems(map, ['power-habitat', 'seal-door'])).toEqual([
      'objective "seal-door" has no trigger',
    ]);
    expect(objectiveProblems(map, [])).toEqual([
      'objective "power-habitat" is not an objective of the mission',
    ]);
  });
});
