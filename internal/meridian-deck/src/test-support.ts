import { defineModule, provide } from '@nexusdi/core';

import type {
  DeckEvent,
  DeckImage,
  DeckOptions,
  IDeckSource,
} from './state/contracts.js';
import { DECK_SOURCE } from './state/tokens.js';

/** Options for a test that never mounts a view: the scene holds placeholders. */
export const OPTIONS: DeckOptions = {
  reducedMotion: false,
  palette: { lamp: '#e8b46a', glow: '#dfe6ea', alarm: '#ff5a4d' },
  scene: {
    base: {} as DeckImage,
    masks: { rooms: 'rooms.png', emissive: 'emissive.png' },
    legend: {
      size: { width: 2048, height: 512 },
      rooms: { bridge: 2 },
      bounds: { bridge: [180, 244, 383, 324] },
    },
    lights: [],
  },
};

/** A source a test pushes events through. */
export class FakeSource implements IDeckSource {
  readonly listeners = new Set<(event: DeckEvent) => void>();

  subscribe(listener: (event: DeckEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  push(event: DeckEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/** The app's global module: it binds `DECK_SOURCE` and exports it, as `DeckState` needs. */
export function globalSource(name: string, source: IDeckSource) {
  return defineModule({
    name,
    global: true,
    providers: [provide(DECK_SOURCE, { useValue: source })],
    exports: [DECK_SOURCE],
  });
}
