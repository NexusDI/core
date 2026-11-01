import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import {
  defineModule,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { MissingProviderError } from '../errors/index.js';
import { Nexus } from '../runtime/nexus.js';
import { coreText } from '../text/index.js';

// Issue #308: a configurable module sees its own providers, its imports'
// exports and the global modules' exports (spec section 3.4). It never sees
// a provider of the module that imports it, and the forRootAsync() factory
// resolves its deps inside the configured module.

interface IDeckSource {
  events(): string[];
}
const DECK_SOURCE = new Token<IDeckSource>('DeckSource');
const APP_SOURCE = new Token<IDeckSource>('AppSource');
const DECK_OPTIONS = new Token<{ source: IDeckSource }>('DeckOptions');
const DECK_STATE = new Token<{ read(): string[] }>('DeckState');

class PreflightDeckSource implements IDeckSource {
  events(): string[] {
    return ['preflight'];
  }
}

const deckStateProvider = provide(DECK_STATE, {
  useFactory: (options: { source: IDeckSource }) => ({
    read: () => options.source.events(),
  }),
  deps: [DECK_OPTIONS],
});

const DeckState = defineModule({
  name: 'DeckState',
  options: DECK_OPTIONS,
  providers: [deckStateProvider],
  exports: [DECK_STATE],
});

describe('#308 a configurable module and its importer', () => {
  it('does not see a provider of its importer from the forRootAsync() factory', async () => {
    const App = defineModule({
      name: 'App',
      providers: [provide(APP_SOURCE, { useClass: PreflightDeckSource })],
      imports: [
        DeckState.forRootAsync({
          useFactory: (source) => ({ source }),
          deps: [APP_SOURCE],
        }),
      ],
    });
    const error = await rejected(Nexus.create(App));
    expect(error).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [
        {
          code: 'NEXUS_MISSING_PROVIDER',
          token: 'AppSource',
          module: 'DeckState',
        },
      ],
    });
  });

  it('sees a provider that a module it imports exports, through a module factory', async () => {
    const deckState = (source: ModuleDefinition) =>
      defineModule({
        name: 'DeckState',
        imports: [source],
        providers: [
          provide(DECK_STATE, {
            useFactory: (s: IDeckSource) => ({ read: () => s.events() }),
            deps: [DECK_SOURCE],
          }),
        ],
        exports: [DECK_STATE],
      });
    const Source = defineModule({
      name: 'PreflightSource',
      providers: [provide(DECK_SOURCE, { useClass: PreflightDeckSource })],
      exports: [DECK_SOURCE],
    });
    const ship = await Nexus.create(
      defineModule({ name: 'App', imports: [deckState(Source)] }),
    );
    expect(ship.get(DECK_STATE).read()).toEqual(['preflight']);
  });

  it('sees a provider that a global module exports from the forRootAsync() factory', async () => {
    const Source = defineModule({
      name: 'PreflightSource',
      providers: [provide(APP_SOURCE, { useClass: PreflightDeckSource })],
      exports: [APP_SOURCE],
      global: true,
    });
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [
          Source,
          DeckState.forRootAsync({
            useFactory: (source) => ({ source }),
            deps: [APP_SOURCE],
          }),
        ],
      }),
    );
    expect(ship.get(DECK_STATE).read()).toEqual(['preflight']);
  });

  it('tells the user to move the token or go global, and never to import the importer', () => {
    const error = new MissingProviderError({
      token: 'AppSource',
      requester: 'DeckOptions',
      module: 'DeckState',
      entry: null,
      nearMisses: [{ kind: 'importer', module: 'App' }],
    });
    const { message } = coreText.NEXUS_MISSING_PROVIDER(error, undefined, {
      nearMisses: () => [],
    });
    expect(message).toBe(
      'DeckOptions (module DeckState) depends on AppSource, but no provider of AppSource is visible in DeckState.\n' +
        '  AppSource is provided in App, which imports DeckState, directly or through other modules.\n' +
        '  Fix: App imports DeckState, so DeckState cannot import App. Move AppSource into a module that DeckState imports, or into a global module that exports it.',
    );
  });
});
