import { Nexus, defineModule, provide } from '@nexusdi/core';
import {
  DECK_SOURCE,
  DeckState,
  type DeckImage,
  type DeckLegend,
  type DeckLight,
} from '@nexusdi/meridian-deck';
import {
  DECK_VIEW,
  DeckView,
  type IDeckView,
} from '@nexusdi/meridian-deck/view';

import lightsJson from '../../ship-art/cutaway/meridian-cutaway-lights.json';
import legendJson from '../../ship-art/cutaway/meridian-cutaway-rooms.legend.json';
import emissiveMask from '../../ship-art/cutaway/meridian-cutaway-emissive.png';
import roomsMask from '../../ship-art/cutaway/meridian-cutaway-rooms.png';
import { PreflightDeckSource } from './deck-source';

/**
 * The light chunk (site UX spec 5.6, owner ruling OR5): the deck state, the
 * Pixi view and the cutaway's data layers. The bay controller loads it with
 * `import()` once the bay is mounted, half in view and the browser is idle.
 * Its marker is the exported constant, so a minifier keeps the string and
 * `check-budgets.mjs` finds the chunk by it (12.1).
 */
const BAY_LIGHT_MARK = 'nexus-bay-light';
export const bayLightMark = (): string => BAY_LIGHT_MARK;

/** The art colours of the light (design system 4.5 and 8.5). */
const PALETTE = {
  lamp: '#e8b46a',
  glow: '#dfe6ea',
  alarm: '#ff6b5e',
} as const;

const LIGHTS = lightsJson as unknown as readonly DeckLight[];
const LEGEND = legendJson as unknown as DeckLegend;

/** What the bay holds of the deck: the source to feed, the view to attach, and the way down. */
export interface BayLight {
  readonly source: PreflightDeckSource;
  readonly view: IDeckView;
  dispose(): Promise<void>;
}

/**
 * Builds the deck in its own container: a global module that binds the
 * source, `DeckState.forRoot()` once, and `DeckView` loaded over it. Nothing
 * of it enters the seed's graph.
 */
export async function createLight(options: {
  /** The decoded image of the page's `<picture>`, so the base downloads once. */
  base: DeckImage;
  reducedMotion: boolean;
}): Promise<BayLight> {
  const source = new PreflightDeckSource(
    LIGHTS.flatMap((light) => (light.fixture ? [light.fixture] : [])),
  );
  const BayDeckSource = defineModule({
    name: 'BayDeckSource',
    global: true,
    providers: [provide(DECK_SOURCE, { useValue: source })],
    exports: [DECK_SOURCE],
  });
  const BayDeckState = DeckState.forRoot({
    reducedMotion: options.reducedMotion,
    palette: PALETTE,
    scene: {
      base: options.base,
      masks: { rooms: roomsMask.src, emissive: emissiveMask.src },
      legend: LEGEND,
      lights: LIGHTS,
    },
  });
  const nexus = await Nexus.create(
    defineModule({
      name: 'BayDeck',
      imports: [BayDeckSource, BayDeckState],
    }),
  );
  await nexus.load(DeckView, { imports: [BayDeckState] });
  return {
    source,
    view: nexus.get(DECK_VIEW),
    dispose: () => nexus[Symbol.asyncDispose](),
  };
}
