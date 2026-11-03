import { defineModule, provide } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';

import type { DeckEvent, DeckPatch, IDeckBinding } from '../state/contracts.js';
import { DECK_BINDINGS } from '../state/tokens.js';

import type { FrameReadout } from './contracts.js';
import {
  allocated,
  fixturesOfSections,
  frameAll,
  readingOf,
} from './shared.js';

/** The hull section whose fixtures the phased array's station owns. */
const SECTIONS = ['comms'] as const;

const MEGAWATT = 1e6;

/** The readouts the comms relay callout names. */
const READOUTS: readonly FrameReadout[] = [
  {
    name: 'array-status',
    label: 'Array status',
    source: 'reading',
    read: ({ comms }) => comms.status,
  },
  {
    name: 'hail-queued',
    label: 'Hail queued',
    source: 'reading',
    read: ({ setpoints }) => setpoints.comms.hail,
  },
  {
    name: 'last-hail',
    label: 'Last hail sent',
    unit: 'tick',
    source: 'reading',
    read: ({ comms }) => comms.sent,
  },
  {
    name: 'array-power',
    label: 'Array power',
    unit: 'MW',
    source: 'reading',
    read: (reading) => {
      const got = allocated(reading, 'comms');
      return got === undefined ? null : got / MEGAWATT;
    },
  },
];

/**
 * Comms' part of the deck: the relay's rack and console, `on` while the
 * array has power and `off` when its status says `no power`.
 */
export class CommsDeckBinding implements IDeckBinding {
  readonly readouts = READOUTS;

  private readonly fixtures = fixturesOfSections(SECTIONS);

  patchOf(event: DeckEvent): DeckPatch | undefined {
    const reading = readingOf(event);
    return reading === undefined ? undefined : this.patch(reading);
  }

  private patch(reading: ShipReading): DeckPatch {
    const powered = reading.comms.status !== 'no power';
    return { frames: frameAll(this.fixtures, powered ? 'on' : 'off') };
  }
}

/** Binds the comms binding to `DECK_BINDINGS`. */
export const CommsDeck = defineModule({
  name: 'CommsDeck',
  providers: [provide(DECK_BINDINGS, { useClass: CommsDeckBinding })],
  exports: [DECK_BINDINGS],
});
