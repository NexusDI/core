import { Nexus, defineModule } from '@nexusdi/core';
import { afterEach, describe, expect, it } from 'vitest';

import { DeckState } from './state/deck-state.module.js';
import { DECK_BINDINGS, DECK_OPTIONS, DECK_STATE } from './state/tokens.js';
import { FakeSource, OPTIONS, globalSource } from './test-support.js';
import { DeckView } from './view/deck-view.module.js';
import {
  DECK_COMPOSITOR,
  DECK_LAYERS,
  DECK_VIEW,
  PIXI_APP,
} from './view/tokens.js';

const open: Nexus[] = [];
afterEach(async () => {
  for (const nexus of open.splice(0)) await nexus[Symbol.asyncDispose]();
});

/** The app: a global module binding the source, a root that imports the deck state once. */
async function app() {
  const source = new FakeSource();
  const BayDeckState = DeckState.forRoot(OPTIONS);
  const Root = defineModule({
    name: 'Root',
    imports: [globalSource('BayDeckSource', source), BayDeckState],
  });
  const nexus = await Nexus.create(Root);
  open.push(nexus);
  return { nexus, source, BayDeckState };
}

describe('the deck container graph', () => {
  it('resolves an empty all(DECK_BINDINGS) to an empty list', async () => {
    const { nexus } = await app();
    expect(nexus.get(DECK_BINDINGS)).toEqual([]);
  });

  it('lets DeckState export DECK_OPTIONS, and hands the options to a reader of the module', async () => {
    const { nexus } = await app();
    expect(nexus.get(DECK_OPTIONS)).toBe(OPTIONS);
    expect(nexus.get(DECK_STATE).snapshot()).toEqual({
      rooms: {},
      fixtures: {},
    });
  });

  it('feeds the store from the source the app binds in its global module', async () => {
    const { nexus, source } = await app();
    const state = nexus.get(DECK_STATE);
    source.push({ type: 'state', patch: { rooms: { bridge: 'alarm' } } });
    expect(state.snapshot().rooms).toEqual({ bridge: 'alarm' });
  });

  it('resolves DECK_VIEW when DeckView loads over the app’s DeckState', async () => {
    const { nexus, BayDeckState } = await app();
    await nexus.load(DeckView, { imports: [BayDeckState] });
    const view = nexus.get(DECK_VIEW);
    expect(typeof view.attach).toBe('function');
    expect(typeof view.detach).toBe('function');
    expect(typeof view.onStatus).toBe('function');
  });

  it('refuses a load import that is not in the graph with NEXUS_LOAD_IMPORT', async () => {
    const source = new FakeSource();
    const nexus = await Nexus.create(
      defineModule({
        name: 'Root',
        imports: [globalSource('BayDeckSource', source)],
      }),
    );
    open.push(nexus);
    await expect(
      nexus.load(DeckView, { imports: [DeckState.forRoot(OPTIONS)] }),
    ).rejects.toMatchObject({ code: 'NEXUS_LOAD_IMPORT' });
  });

  it('keeps the renderer, the layers and the compositor private to DeckView', async () => {
    const { nexus, BayDeckState } = await app();
    await nexus.load(DeckView, { imports: [BayDeckState] });
    const notVisible = expect.objectContaining({ code: 'NEXUS_NOT_VISIBLE' });
    expect(() => nexus.get(PIXI_APP)).toThrowError(notVisible);
    expect(() => nexus.get(DECK_COMPOSITOR)).toThrowError(notVisible);
    // The layers are private contributions, so the root reads none of them.
    expect(nexus.get(DECK_LAYERS)).toEqual([]);
  });

  it('declares no import of DeckState, so DeckView alone fails the check', () => {
    expect(() => Nexus.check(DeckView)).toThrowError(
      expect.objectContaining({ code: 'NEXUS_BLUEPRINT_INVALID' }),
    );
  });

  it('fails with NEXUS_AMBIGUOUS_PROVIDER when two global modules bind a source', async () => {
    const Root = defineModule({
      name: 'Root',
      imports: [
        globalSource('FirstSource', new FakeSource()),
        globalSource('SecondSource', new FakeSource()),
        DeckState.forRoot(OPTIONS),
      ],
    });
    const failure = await Nexus.create(Root).catch((error: unknown) => error);
    const { errors } = failure as { errors: { code: string }[] };
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((error) => error.code)).toEqual(
      errors.map(() => 'NEXUS_AMBIGUOUS_PROVIDER'),
    );
  });
});
