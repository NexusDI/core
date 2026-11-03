import { defineModule, provide } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';

import type {
  DeckEvent,
  DeckPatch,
  FixtureLight,
  IDeckBinding,
  PropFrame,
} from '../state/contracts.js';
import { DECK_BINDINGS } from '../state/tokens.js';

import type { FrameReadout } from './contracts.js';
import { readingOf } from './shared.js';

const RING = 'ftl-core.ring';
const CABINET = 'ftl-core.capacitor-cabinet';
const ROOM = 'ftl-core';

const GIGAJOULE = 1e9;

/** The readouts the FTL core callout names. A ship that has not loaded the drive reads null. */
const READOUTS: readonly FrameReadout[] = [
  {
    name: 'ftl-status',
    label: 'FTL status',
    source: 'reading',
    read: ({ ftl }) => ftl?.status ?? null,
  },
  {
    name: 'spool-charge',
    label: 'Spool charge',
    unit: 'GJ',
    source: 'reading',
    read: ({ ftl }) => (ftl === undefined ? null : ftl.charge / GIGAJOULE),
  },
  {
    name: 'sector',
    label: 'Sector',
    source: 'reading',
    read: ({ ftl }) => ftl?.sector ?? null,
  },
  {
    name: 'last-jump',
    label: 'Last jump',
    unit: 'tick',
    source: 'reading',
    read: ({ ftl }) => ftl?.jumped ?? null,
  },
];

/**
 * The FTL drive's part of the deck. The ring and the capacitor cabinet are
 * `off` while the drive is not loaded or its status is `offline`, and `on` in
 * every other status. The ring is `damaged` under a fire in its room. While
 * the drive idles, it has loaded but not begun to spool, so the ring's glow
 * is `standby`; the store derives the glow in every other case.
 */
export class FtlDeckBinding implements IDeckBinding {
  readonly readouts = READOUTS;

  patchOf(event: DeckEvent): DeckPatch | undefined {
    const reading = readingOf(event);
    return reading === undefined ? undefined : this.patch(reading);
  }

  private patch(reading: ShipReading): DeckPatch {
    const status = reading.ftl?.status ?? 'offline';
    const burning = (reading.safety.fires[ROOM] ?? 0) > 0;
    const running = status !== 'offline';
    const ring: PropFrame = burning ? 'damaged' : running ? 'on' : 'off';
    const frames: Record<string, PropFrame> = {
      [RING]: ring,
      [CABINET]: running ? 'on' : 'off',
    };
    const fixtures: Record<string, FixtureLight> =
      ring === 'on' && status === 'idle' ? { [RING]: 'standby' } : {};
    return { frames, fixtures };
  }
}

/** Binds the FTL binding to `DECK_BINDINGS`. */
export const FtlDeck = defineModule({
  name: 'FtlDeck',
  providers: [provide(DECK_BINDINGS, { useClass: FtlDeckBinding })],
  exports: [DECK_BINDINGS],
});
