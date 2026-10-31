// @vitest-environment node
import { Nexus } from '@nexusdi/core';
import { DECK_BINDINGS } from '@nexusdi/meridian-deck';
import { rootOf, SEED } from '@nexusdi/meridian/scenes/front-page';
import { describe, expect, it, vi } from 'vitest';

import { bayLightMark, createLight } from './light';
import { graphOf } from './run';

// The test stands in for the module that reads Next's static image object.
vi.mock('../../ship-art/cutaway/meridian-cutaway-rooms.png', () => ({
  default: { src: '/rooms.png', width: 2048, height: 512 },
}));
vi.mock('../../ship-art/cutaway/meridian-cutaway-emissive.png', () => ({
  default: { src: '/emissive.png', width: 2048, height: 512 },
}));

describe('the bay light', () => {
  it('builds the deck in its own container and resolves the view', async () => {
    const light = await createLight({
      base: {} as HTMLImageElement,
      reducedMotion: true,
    });
    expect(typeof light.view.attach).toBe('function');
    expect(typeof light.source.update).toBe('function');
    await light.dispose();
  });

  it('keeps the deck out of the seed graph', () => {
    const tokens = graphOf(SEED).providers.map((provider) => provider.token);
    expect(tokens.filter((token) => /Deck|Pixi/.test(token))).toEqual([]);
    expect(() => Nexus.check(rootOf(SEED))).not.toThrow();
    expect(DECK_BINDINGS.description).toBe('DeckBindings');
  });

  it('carries the marker the budget check finds the chunk by', () => {
    expect(bayLightMark()).toBe('nexus-bay-light');
  });
});
