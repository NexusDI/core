import { describe, expect, it } from 'vitest';

import {
  Nexus,
  Token,
  defineModule,
  provide,
  type NexusPlugin,
} from '@nexusdi/core';

import { rejected } from '../test-support/catch.js';
import {
  DockingBayError,
  dockingText,
} from '../test-support/third-party-codes.js';
import { errors } from './index.js';

interface NavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
class ShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(readonly charts: NavCharts) {}
}
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useValue: { plot: () => 'x' } })],
});
const Engineering = defineModule({
  name: 'Engineering',
  providers: [ShipComputer],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Engineering, Tactical],
});

describe('errors', () => {
  const Hangar = defineModule({ name: 'Hangar' });
  const Fleet = defineModule({ name: 'Fleet', imports: [Hangar, Tactical] });

  /** A check hook that reports Hangar's missing docking bay, looked up as NavCharts. */
  const docking: NexusPlugin = {
    name: 'docking',
    apiVersion: 1,
    compile: {
      check: (view, report) => {
        const hangar = view.modules.find((m) => m.name === 'Hangar')?.id;
        report(
          new DockingBayError(
            { bay: 'NavCharts', module: 'Hangar' },
            { hidden: { lookup: { token: NAV_CHARTS, moduleId: hangar } } },
          ),
        );
      },
    },
  };

  it("formats another package's code, raised from a check hook, with the packs it is given", async () => {
    const error = await rejected(
      Nexus.create(Fleet, {
        plugins: [docking, errors({ text: [dockingText] })],
      }),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'ACME_DOCKING_BAY',
          message:
            '[ACME_DOCKING_BAY] Hangar asked for the NavCharts bay, which no module provides.\n' +
            '  Fix: provide it: provide(DOCKING_BAY, { useClass: ShuttleBay }).',
        },
      ],
    });
  });

  it("leaves another package's code on its own line without its pack", async () => {
    const error = (await rejected(
      Nexus.create(Fleet, { plugins: [docking, errors()] }),
    )) as { errors: Error[] };
    expect(error.errors[0]?.message).toBe(
      '[ACME_DOCKING_BAY] bay=NavCharts module=Hangar. https://acme.dev/errors/ACME_DOCKING_BAY',
    );
  });

  it('writes revision 1 text and fills nearMisses', async () => {
    const error = await Nexus.create(Meridian, { plugins: [errors()] }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_MISSING_PROVIDER',
          nearMisses: [{ kind: 'not-exported', module: 'Tactical' }],
          message:
            '[NEXUS_MISSING_PROVIDER] ShipComputer (module Engineering) depends on NavCharts, but no provider of NavCharts is visible in Engineering.\n' +
            '  NavCharts is provided in Tactical, which does not export it.\n' +
            "  Fix: add NavCharts to Tactical's exports and import Tactical into Engineering.",
        },
      ],
    });
  });

  it('never advises an import that closes a cycle', async () => {
    const APP_SOURCE = new Token<NavCharts>('AppSource');
    const DeckOptions = new Token<{ source: NavCharts }>('DeckOptions');
    const DeckState = defineModule({ name: 'DeckState', options: DeckOptions });
    const App = defineModule({
      name: 'App',
      providers: [provide(APP_SOURCE, { useValue: { plot: () => 'x' } })],
      imports: [
        DeckState.forRootAsync({
          useFactory: (source: NavCharts) => ({ source }),
          deps: [APP_SOURCE],
        }),
      ],
    });
    const error = await Nexus.create(App, { plugins: [errors()] }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_MISSING_PROVIDER',
          nearMisses: [{ kind: 'importer', module: 'App' }],
          message:
            '[NEXUS_MISSING_PROVIDER] DeckOptions (module DeckState) depends on AppSource, but no provider of AppSource is visible in DeckState.\n' +
            '  AppSource is provided in App, which imports DeckState, directly or through other modules.\n' +
            "  Fix: App imports DeckState, so DeckState cannot import App. Move AppSource into a module that DeckState imports, or into a global module that exports it. A function that returns a module importing App's provider module also works.",
        },
      ],
    });
  });

  it('leaves nearMisses empty without the plugin', async () => {
    const error = await Nexus.create(Meridian).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ errors: [{ nearMisses: [] }] });
  });

  it.each([
    {
      name: 'a useFactory that is not a function',
      config: { useFactory: 4 },
      sentence: 'has a useFactory that is not a function',
    },
    {
      name: 'deps that are not an array',
      config: { useFactory: () => ({}), deps: 'freq' },
      sentence: 'has deps that are not an array',
    },
  ])(
    'leads the forRootAsync() reason for $name with the factory detail',
    async ({ config, sentence }) => {
      const OPTIONS = new Token<{ freq: number }>('CommsOptions');
      const Comms = defineModule({ name: 'Comms', options: OPTIONS });
      const error = await Nexus.create(Comms.forRootAsync(config as never), {
        plugins: [errors()],
      }).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toMatchObject({
        errors: [
          {
            code: 'NEXUS_INVALID_PROVIDER',
            message: `[NEXUS_INVALID_PROVIDER] Comms.providers[0] (the forRootAsync() factory) ${sentence}.`,
          },
        ],
      });
    },
  );
  describe('a module whose schema rejects its options', () => {
    const SIM_OPTIONS = new Token<{ seed: number }>('SimOptions');
    const issues = [
      { message: 'expected an integer, received 1.5', path: ['seed'] },
      { message: 'expected 1 to 10', path: [{ key: 'crew' }, 0] },
    ];
    const simulation = (refused: readonly object[]) =>
      defineModule({
        name: 'Simulation',
        options: SIM_OPTIONS,
        schema: {
          '~standard': {
            version: 1,
            vendor: 'nexusdi-test',
            validate: () => ({ issues: refused as never }),
          },
        },
      }).forRoot({ seed: 1.5 });

    it('names each issue in the one-line message without errors()', async () => {
      const error = (await rejected(Nexus.create(simulation(issues)))) as Error;
      expect(error.message).toBe(
        '[NEXUS_PROVIDER_FAILED] token=SimOptions module=Simulation path=SimOptions. https://nexus.js.org/errors/NEXUS_PROVIDER_FAILED' +
          ' Cause: [NEXUS_INVALID_MODULE_OPTIONS] module=Simulation issues=seed: expected an integer, received 1.5; crew.0: expected 1 to 10. https://nexus.js.org/errors/NEXUS_INVALID_MODULE_OPTIONS',
      );
    });

    it('lists each issue in the full text with errors()', async () => {
      const error = (await rejected(
        Nexus.create(simulation(issues), { plugins: [errors()] }),
      )) as Error;
      expect(error.message).toBe(
        [
          '[NEXUS_PROVIDER_FAILED] SimOptions (module Simulation) failed: [NEXUS_INVALID_MODULE_OPTIONS] Simulation received options its schema rejects:',
          '      seed: expected an integer, received 1.5',
          '      crew.0: expected 1 to 10',
        ].join('\n'),
      );
      expect((error.cause as Error).message).toBe(
        [
          '[NEXUS_INVALID_MODULE_OPTIONS] Simulation received options its schema rejects:',
          '  seed: expected an integer, received 1.5',
          '  crew.0: expected 1 to 10',
        ].join('\n'),
      );
    });

    it('lists the first ten issues with errors() and counts the rest', async () => {
      const many = Array.from({ length: 14 }, (_, i) => ({
        message: `issue ${i + 1}`,
        path: [`field${i + 1}`],
      }));
      const error = (await rejected(
        Nexus.create(simulation(many), { plugins: [errors()] }),
      )) as Error;
      const lines = (error.cause as Error).message.split('\n');
      expect(lines.slice(1)).toEqual([
        ...many.slice(0, 10).map((_, i) => `  field${i + 1}: issue ${i + 1}`),
        '  and 4 more',
      ]);
      expect(error.message.split('\n').at(-1)).toBe('      and 4 more');
    });

    it('formats a schema rejection in alsoFailed and keeps the text of an error user code threw', async () => {
      const LINK = new Token<object>('SubspaceLink');
      const Simulation = defineModule({
        name: 'Simulation',
        options: SIM_OPTIONS,
        schema: {
          '~standard': {
            version: 1,
            vendor: 'nexusdi-test',
            validate: () => ({ issues }),
          },
        },
      });
      const offline = new Error('subspace link down');
      const error = (await rejected(
        Nexus.create(
          defineModule({
            name: 'Root',
            imports: [
              Simulation.forRootAsync({
                useFactory: async () => ({ seed: 1 }),
              }),
            ],
            providers: [
              provide(LINK, {
                useFactory: async () => {
                  throw offline;
                },
              }),
            ],
          }),
          { plugins: [errors()] },
        ),
      )) as Error & { alsoFailed: { cause: unknown }[] };
      const causes = [error.cause, ...error.alsoFailed.map((f) => f.cause)];
      expect(causes).toHaveLength(2);
      expect(causes).toContain(offline);
      expect(offline.message).toBe('subspace link down');
      const refused = causes.find((cause) => cause !== offline) as Error;
      expect(refused.message).toBe(
        [
          '[NEXUS_INVALID_MODULE_OPTIONS] Simulation received options its schema rejects:',
          '  seed: expected an integer, received 1.5',
          '  crew.0: expected 1 to 10',
        ].join('\n'),
      );
    });

    it("keeps the text of another container's error an async factory rejects with", async () => {
      const LINK = new Token<object>('SubspaceLink');
      let nested: unknown;
      const error = (await rejected(
        Nexus.create(
          defineModule({
            name: 'Root',
            providers: [
              provide(LINK, {
                useFactory: async () => {
                  nested = await rejected(Nexus.create(simulation(issues)));
                  throw nested;
                },
              }),
            ],
          }),
          { plugins: [errors()] },
        ),
      )) as Error;
      // create reports the nested failure's provider, and its cause keeps
      // the one-line text the nested container gave it.
      expect(error.cause).toBe((nested as Error).cause);
      expect((error.cause as Error).message).toBe(
        '[NEXUS_INVALID_MODULE_OPTIONS] module=Simulation issues=seed: expected an integer, received 1.5; crew.0: expected 1 to 10. https://nexus.js.org/errors/NEXUS_INVALID_MODULE_OPTIONS',
      );
    });

    it('cuts a foreign cause at 500 characters in the provider text', async () => {
      const LINK = new Token<object>('SubspaceLink');
      const error = (await rejected(
        Nexus.create(
          defineModule({
            name: 'Root',
            providers: [
              provide(LINK, {
                useFactory: () => {
                  throw new Error('x'.repeat(1000));
                },
              }),
            ],
          }),
          { plugins: [errors()] },
        ),
      )) as Error;
      expect(error.message).toBe(
        `[NEXUS_PROVIDER_FAILED] SubspaceLink (module Root) failed: ${`Error: ${'x'.repeat(1000)}`.slice(0, 500)}…`,
      );
    });

    it('formats the schema rejection of a forRootAsync() factory with errors()', async () => {
      const Simulation = defineModule({
        name: 'Simulation',
        options: SIM_OPTIONS,
        schema: {
          '~standard': {
            version: 1,
            vendor: 'nexusdi-test',
            validate: () => ({ issues }),
          },
        },
      });
      const error = (await rejected(
        Nexus.create(
          Simulation.forRootAsync({ useFactory: async () => ({ seed: 1.5 }) }),
          { plugins: [errors()] },
        ),
      )) as Error;
      expect(error.message).toContain('      crew.0: expected 1 to 10');
    });
  });
});
