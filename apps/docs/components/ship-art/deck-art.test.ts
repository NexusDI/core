// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { geometryHash } from '../../tools/ship-art.mjs';

interface Card {
  view?: string;
  layer?: string;
  geometry?: string;
  pixelsPerMetre?: number;
  origin?: number[];
  meta?: { geometry?: string; view?: string; pixelsPerMetre?: number };
}

const art = join(import.meta.dirname, '../../../../internal/meridian-deck/art');
const decks = ['lower', 'main', 'upper'];

const cards = (dir: string) =>
  readdirSync(join(art, dir))
    .filter((name) => name.endsWith('.json') && name !== 'lights.json')
    .map((name) => ({
      name: `${dir}/${name}`,
      card: JSON.parse(readFileSync(join(art, dir, name), 'utf8')) as Card,
    }));

describe('the deck art sidecars (design system 8.3)', () => {
  it('hash the geometry the way the cutaway sidecars do', () => {
    const hash = geometryHash();
    for (const dir of [...decks, 'shared'])
      for (const { name, card } of cards(dir))
        expect(card.geometry ?? card.meta?.geometry, name).toBe(hash);
  });

  it('name their deck view, 32 pixels per metre and the origin at pixel (64, 320)', () => {
    for (const deck of decks)
      for (const { name, card } of cards(deck)) {
        if (card.meta) {
          expect(card.meta.view, name).toBe(`deck-${deck}`);
          expect(card.meta.pixelsPerMetre, name).toBe(32);
        } else if (card.layer) {
          expect(card.view, name).toBe(`deck-${deck}`);
          expect(card.pixelsPerMetre, name).toBe(32);
          expect(card.origin, name).toEqual([64, 320]);
        }
      }
  });
});
