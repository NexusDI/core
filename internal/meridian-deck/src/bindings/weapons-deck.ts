import { defineModule, provide } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';

import type { DeckEvent, DeckPatch, IDeckBinding } from '../state/contracts.js';
import { DECK_BINDINGS } from '../state/tokens.js';

import type { FrameReadout } from './contracts.js';
import { fixturesOfSections, frameAll, readingOf } from './shared.js';

/** The hull section whose fixtures the railgun owns. */
const SECTIONS = ['weapons'] as const;

const MEGAJOULE = 1e6;

/** The readouts the capacitor room callout names. */
const READOUTS: readonly FrameReadout[] = [
  {
    name: 'weapons-status',
    label: 'Railgun status',
    source: 'reading',
    read: ({ weapons }) => weapons.status,
  },
  {
    name: 'capacitor-charge',
    label: 'Capacitor charge',
    unit: 'MJ',
    source: 'reading',
    read: ({ weapons }) => weapons.charge / MEGAJOULE,
  },
  {
    name: 'shots',
    label: 'Shots fired',
    source: 'reading',
    read: ({ weapons }) => weapons.shots,
  },
  {
    name: 'hits',
    label: 'Hits',
    source: 'reading',
    read: ({ weapons }) => weapons.hits,
  },
];

/**
 * The railgun's part of the deck: the capacitor banks and the breech, `on`
 * while the reactor puts out electric power.
 */
export class WeaponsDeckBinding implements IDeckBinding {
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

/** Binds the weapons binding to `DECK_BINDINGS`. */
export const WeaponsDeck = defineModule({
  name: 'WeaponsDeck',
  providers: [provide(DECK_BINDINGS, { useClass: WeaponsDeckBinding })],
  exports: [DECK_BINDINGS],
});
