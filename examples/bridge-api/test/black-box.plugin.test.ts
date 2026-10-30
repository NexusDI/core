import {
  defineModule,
  isNexusError,
  Nexus,
  provide,
  Token,
  type NexusPlugin,
} from '@nexusdi/core';
import {
  SHIP_SYSTEMS,
  type IShipSystem,
  type Phase,
} from '@nexusdi/meridian-systems';
import { describe, expect, it } from 'vitest';

import {
  blackBox,
  phaseCheck,
  SystemPhaseError,
  systemPhaseText,
} from '../src/ship/black-box.plugin';
import { OfflineMeridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';
import { findCode } from './contracts/fix-line';

/** A ship system that declares no static phase. */
class Phaseless implements IShipSystem {
  readonly name = 'phaseless';
  readonly phase: Phase = 1;
  step: IShipSystem['step'] = (ship) => ship;
}

/** A ship system that declares its phase. */
class Phased implements IShipSystem {
  static readonly phase: Phase = 2;
  readonly name = 'phased';
  readonly phase: Phase = 2;
  step: IShipSystem['step'] = (ship) => ship;
}

const moduleOf = (system: new () => IShipSystem) =>
  defineModule({
    name: 'Probe',
    providers: [provide(SHIP_SYSTEMS, { useClass: system })],
    exports: [SHIP_SYSTEMS],
  });

/** The same hooks under another name, so a container takes two boxes. */
const renamed = (plugin: NexusPlugin): NexusPlugin => ({
  ...plugin,
  name: `${plugin.name}:second`,
});

/** A ship system built per scope. */
const scopedModule = defineModule({
  name: 'ScopedProbe',
  providers: [provide(SHIP_SYSTEMS, { useClass: Phased, lifetime: 'scoped' })],
  exports: [SHIP_SYSTEMS],
});

describe('the black box plugin', () => {
  it('observe keeps the trace events in order and drops the oldest past its capacity', async () => {
    const box = blackBox({ capacity: 3 });
    await using ship = await Nexus.create(moduleOf(Phased), {
      plugins: [box.plugin],
    });
    ship.get(SHIP_SYSTEMS);
    const kept = box.trace();
    expect(kept).toHaveLength(3);
    expect(kept.at(-1)?.type).toBe('run');
  });

  it('observe keeps nothing at capacity 0 and one event at capacity 1', async () => {
    const none = blackBox({ capacity: 0 });
    const one = blackBox({ capacity: 1 });
    await using ship = await Nexus.create(moduleOf(Phased), {
      plugins: [none.plugin, renamed(one.plugin)],
    });
    ship.get(SHIP_SYSTEMS);
    expect(none.trace()).toEqual([]);
    expect(one.trace()).toHaveLength(1);
  });

  it('the kept events equal the tail of the full trace, in order', async () => {
    const full = blackBox({ capacity: 10_000 });
    const tail = blackBox({ capacity: 4 });
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: [full.plugin, renamed(tail.plugin)],
    });
    ship.get(SHIP_SYSTEMS);
    expect(full.trace().length).toBeGreaterThan(4);
    expect(tail.trace()).toEqual(full.trace().slice(-4));
  });

  it.each([Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY])(
    'blackBox throws a plain Error for the capacity %s',
    (capacity) => {
      expect(() => blackBox({ capacity })).toThrow(Error);
      expect(() => blackBox({ capacity })).toThrow(/capacity/);
    },
  );

  it('each blackBox call gives its own plugin and records', async () => {
    const [a, b] = [blackBox(), blackBox()];
    expect(a.plugin).not.toBe(b.plugin);
    await using ship = await Nexus.create(moduleOf(Phased), {
      plugins: [a.plugin],
    });
    ship.get(SHIP_SYSTEMS);
    expect(a.stamps()).toHaveLength(1);
    expect(b.stamps()).toEqual([]);
  });

  it('construct stamps each ship system with its name, phase and scope, and leaves the instance alone', async () => {
    const box = blackBox();
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: [...bridgePlugins(), box.plugin],
    });
    // Ship systems are lazy singletons: the first read builds them.
    const systems = ship.get(SHIP_SYSTEMS);
    // The instances stay the ones the container built.
    const again = ship.get(SHIP_SYSTEMS);
    systems.forEach((system, index) => expect(again[index]).toBe(system));
    const stamped = box.stamps().map(({ system, phase }) => [system, phase]);
    expect(stamped).toContainEqual(['Engineering', 1]);
    expect(stamped).toContainEqual(['Comms', 6]);
    expect(box.stamps().every(({ scope }) => scope === null)).toBe(true);
    for (const system of systems) expect(Object.isFrozen(system)).toBe(false);
  });

  it('construct stamps the scope that built a scoped system', async () => {
    const box = blackBox();
    await using ship = await Nexus.create(scopedModule, {
      plugins: [box.plugin],
    });
    await using scope = await ship.createScope({});
    scope.get(SHIP_SYSTEMS);
    const [stamp] = box.stamps();
    expect(stamp?.system).toBe('phased');
    expect(stamp?.scope).toBe(scope.id);
  });

  it('construct skips a provider of another token', async () => {
    const box = blackBox();
    const OTHER = new Token<{ readonly name: string }>('OTHER');
    await using ship = await Nexus.create(
      defineModule({
        name: 'Other',
        providers: [provide(OTHER, { useValue: { name: 'x' } })],
        exports: [OTHER],
      }),
      { plugins: [box.plugin] },
    );
    ship.get(OTHER);
    expect(box.stamps()).toEqual([]);
  });

  it('construct stamps nothing readable from a factory that returns null, and does not throw', async () => {
    const box = blackBox();
    await using ship = await Nexus.create(
      defineModule({
        name: 'Nulls',
        providers: [
          provide(SHIP_SYSTEMS, {
            useFactory: () => null as unknown as IShipSystem,
          }),
        ],
        exports: [SHIP_SYSTEMS],
      }),
      { plugins: [box.plugin, phaseCheck] },
    );
    expect(() => ship.get(SHIP_SYSTEMS)).not.toThrow();
    expect(box.stamps()).toEqual([]);
  });

  it('construct stamps nothing for a factory whose system has no numeric phase', async () => {
    const box = blackBox();
    await using ship = await Nexus.create(
      defineModule({
        name: 'Odd',
        providers: [
          provide(SHIP_SYSTEMS, {
            useFactory: () => ({ name: 'odd' }) as unknown as IShipSystem,
          }),
        ],
        exports: [SHIP_SYSTEMS],
      }),
      { plugins: [box.plugin] },
    );
    ship.get(SHIP_SYSTEMS);
    expect(box.stamps()).toEqual([]);
  });

  it('compile.check accepts a ship system class with a phase', async () => {
    await using ship = await Nexus.create(moduleOf(Phased), {
      plugins: [phaseCheck],
    });
    expect(ship.get(SHIP_SYSTEMS)[0]).toBeInstanceOf(Phased);
  });

  it('compile.check skips a factory contribution and a value contribution', async () => {
    await using ship = await Nexus.create(
      defineModule({
        name: 'Loose',
        providers: [
          provide(SHIP_SYSTEMS, {
            useFactory: () => new Phased(),
          }),
          provide(SHIP_SYSTEMS, { useValue: new Phased() }),
        ],
        exports: [SHIP_SYSTEMS],
      }),
      { plugins: [phaseCheck] },
    );
    expect(ship.get(SHIP_SYSTEMS)).toHaveLength(2);
  });

  it('bridgePlugins carries the phase check and no recorder', async () => {
    const names = bridgePlugins().map((plugin) => plugin.name);
    expect(names).toContain(phaseCheck.name);
    expect(names).not.toContain(blackBox().plugin.name);
    const error = await Nexus.create(moduleOf(Phaseless), {
      plugins: bridgePlugins(),
    }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(findCode(error, 'MERIDIAN_SYSTEM_PHASE')).toBeInstanceOf(
      SystemPhaseError,
    );
  });

  it('compile.check refuses a ship system class without a phase with MERIDIAN_SYSTEM_PHASE and its fix line', async () => {
    const error = await Nexus.create(moduleOf(Phaseless), {
      plugins: [phaseCheck],
    }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    const refusal = findCode(error, 'MERIDIAN_SYSTEM_PHASE');
    expect(refusal).toBeInstanceOf(SystemPhaseError);
    expect(refusal.system).toBe('Phaseless');
    expect(isNexusError(refusal, 'MERIDIAN_SYSTEM_PHASE')).toBe(true);
    const text = systemPhaseText.MERIDIAN_SYSTEM_PHASE(refusal);
    expect(text.message).toContain('Phaseless');
    expect(text.fix).toBe(
      'declare `static readonly phase` on the class, one of 1 to 6, so the graph and the black box read it without building the class.',
    );
  });
});
