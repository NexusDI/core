// @vitest-environment node
import { Nexus } from '@nexusdi/core';
import { DECK_BINDINGS } from '@nexusdi/meridian-deck';
import { rootOf, SEED } from '@nexusdi/meridian/scenes/front-page';
import { describe, expect, it, vi } from 'vitest';

import { bayLightMark, createLight, decodeBase } from './light';
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

  it('decodes the base from the file that the page picked, at the size of the file', async () => {
    // The element's naturalWidth is the width of its `sizes` slot (1133), not
    // of the 1536 px file; the bitmap must have the pixels of the file.
    const blob = new Blob(['avif']);
    const fetched = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => blob,
    }));
    const bitmap = { width: 1536, height: 384, close: vi.fn() };
    const decoded = vi.fn(async () => bitmap);
    vi.stubGlobal('fetch', fetched);
    vi.stubGlobal('createImageBitmap', decoded);
    const image = {
      currentSrc: '/cutaway-1536.avif',
      naturalWidth: 1133,
    } as HTMLImageElement;
    expect(await decodeBase(image)).toBe(bitmap);
    expect(fetched).toHaveBeenCalledWith('/cutaway-1536.avif');
    expect(decoded).toHaveBeenCalledWith(blob);
    const light = await createLight({
      base: bitmap as unknown as ImageBitmap,
      reducedMotion: true,
    });
    await light.dispose();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
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
