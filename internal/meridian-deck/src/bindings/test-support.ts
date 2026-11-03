import { defineModule, Nexus } from '@nexusdi/core';
import {
  COMMAND_DESK,
  DECK_PLAN,
  FtlDrive,
  MeridianSystems,
  SHIP_STATE,
  Simulation,
  TICK_LOOP,
  readShip,
  type ICommandDesk,
  type ShipReading,
} from '@nexusdi/meridian-systems';
import { SHIP_GEOMETRY } from '@nexusdi/meridian-systems/geometry';

import type { DeckEvent, DeckPatch } from '../state/contracts.js';

import type { IShipFeed, ShipFeedEvent } from './contracts.js';

/** A real ship from the library's own simulation, read frame by frame. */
export class TestShip {
  private constructor(
    private readonly nexus: Nexus,
    readonly desk: ICommandDesk,
  ) {}

  static async start(options: { ftl?: boolean } = {}): Promise<TestShip> {
    const nexus = await Nexus.create(
      defineModule({
        name: 'DeckTestShip',
        imports: [Simulation.forRoot({ seed: 7, dt: 0.5 }), MeridianSystems],
      }),
    );
    if (options.ftl === true) await nexus.load(FtlDrive);
    return new TestShip(nexus, nexus.get(COMMAND_DESK));
  }

  /** Runs `ticks` ticks and answers the frame of the last one. */
  advance(ticks: number): ShipReading {
    this.nexus.get(TICK_LOOP).advance(ticks);
    return this.reading();
  }

  reading(): ShipReading {
    return readShip(
      this.nexus.get(SHIP_STATE).snapshot(),
      this.nexus.get(DECK_PLAN),
    );
  }

  /** Brings the reactor to full and life support online, then runs `ticks` ticks. */
  powerUp(ticks = 40): ShipReading {
    this.desk.submit({ system: 'engineering', action: 'throttle', level: 1 });
    this.desk.submit({ system: 'life-support', action: 'online' });
    return this.advance(ticks);
  }

  async dispose(): Promise<void> {
    await this.nexus[Symbol.asyncDispose]();
  }
}

/** The ids of the rooms whose hull section is one of `sections`. */
export function roomsOfSections(sections: readonly string[]): string[] {
  return SHIP_GEOMETRY.compartments
    .filter(({ hullSection }) => sections.includes(hullSection))
    .map(({ id }) => id);
}

/** The ids of every fixture in the rooms of the hull sections. */
export function fixturesOfHullSections(sections: readonly string[]): string[] {
  return SHIP_GEOMETRY.compartments
    .filter(({ hullSection }) => sections.includes(hullSection))
    .flatMap(({ fixtures }) => fixtures.map(({ id }) => id));
}

/** The ids of the conduits of one kind. */
export function conduitsOfKind(kind: string): string[] {
  return SHIP_GEOMETRY.conduits
    .filter((route) => route.kind === kind)
    .map(({ id }) => id);
}

/** The ids a patch names, by channel. The alarms list their subjects. */
export function idsOf(patch: DeckPatch | undefined) {
  return {
    rooms: Object.keys(patch?.rooms ?? {}),
    fixtures: Object.keys(patch?.fixtures ?? {}),
    frames: Object.keys(patch?.frames ?? {}),
    doors: Object.keys(patch?.doors ?? {}),
    conduits: Object.keys(patch?.conduits ?? {}),
    alarms: (patch?.alarms ?? []).map(({ subject }) => subject),
  };
}

/** The frame with one record replaced, for a case the simulation does not reach on its own. */
export function withRecords(
  reading: ShipReading,
  records: Partial<ShipReading>,
): ShipReading {
  return { ...reading, ...records };
}

/** The frame as a reading event. */
export function readingEvent(reading: ShipReading): DeckEvent {
  return { type: 'reading', reading };
}

/** A feed a test pushes events through. A late subscriber hears the latest reading and graph at once. */
export class FakeShipFeed implements IShipFeed {
  readonly listeners = new Set<(event: ShipFeedEvent) => void>();
  private reading: ShipFeedEvent | undefined;
  private graph: ShipFeedEvent | undefined;

  subscribe(listener: (event: ShipFeedEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.reading !== undefined) listener(this.reading);
    if (this.graph !== undefined) listener(this.graph);
    return () => {
      this.listeners.delete(listener);
    };
  }

  push(event: ShipFeedEvent): void {
    if (event.type === 'reading' || event.type === 'unreachable') {
      this.reading = event;
    }
    if (event.type === 'graph') this.graph = event;
    for (const listener of [...this.listeners]) listener(event);
  }
}
