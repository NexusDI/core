import { defineModule, provide } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';

import type { DeckEvent, DeckPatch, IDeckBinding } from '../state/contracts.js';
import { DECK_BINDINGS } from '../state/tokens.js';

import type { FrameReadout } from './contracts.js';
import { fixturesOfSections, frameAll, readingOf } from './shared.js';

/** The hull section whose fixtures the helm owns. */
const SECTIONS = ['bridge'] as const;

const DEGREES = 180 / Math.PI;
const KILO = 1e3;

/** The readouts the helm console callout names. */
const READOUTS: readonly FrameReadout[] = [
  {
    name: 'heading',
    label: 'Heading',
    unit: 'deg',
    source: 'reading',
    read: ({ helm }) => helm.attitude * DEGREES,
  },
  {
    name: 'course',
    label: 'Course',
    unit: 'deg',
    source: 'reading',
    read: ({ setpoints }) => setpoints.helm.heading * DEGREES,
  },
  {
    name: 'turn-rate',
    label: 'Turn rate',
    unit: 'deg/s',
    source: 'reading',
    read: ({ helm }) => helm.rate * DEGREES,
  },
  {
    name: 'thruster-torque',
    label: 'Thruster torque',
    unit: 'kN·m',
    source: 'reading',
    read: ({ helm }) => helm.torque / KILO,
  },
];

/**
 * The helm's part of the deck: the bridge consoles, `on` while the reactor
 * puts out electric power. The station bank is a console of the bridge too,
 * and it follows the same power.
 */
export class HelmDeckBinding implements IDeckBinding {
  readonly readouts = READOUTS;

  private readonly fixtures = fixturesOfSections(SECTIONS);

  patchOf(event: DeckEvent): DeckPatch | undefined {
    const reading = readingOf(event);
    return reading === undefined ? undefined : this.patch(reading);
  }

  private patch(reading: ShipReading): DeckPatch {
    return {
      frames: frameAll(
        this.fixtures,
        reading.reactor.electric > 0 ? 'on' : 'off',
      ),
    };
  }
}

/** Binds the helm binding to `DECK_BINDINGS`. */
export const HelmDeck = defineModule({
  name: 'HelmDeck',
  providers: [provide(DECK_BINDINGS, { useClass: HelmDeckBinding })],
  exports: [DECK_BINDINGS],
});
