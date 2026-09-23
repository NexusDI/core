import { describe, expect, it } from 'vitest';

import { compileErrors } from '../../test-support/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { BlueprintError } from '../errors/index.js';
import { compile } from './compile.js';

describe('compile', () => {
  it('reports every error of every pass in one BlueprintError, in pass order', () => {
    const LOGGER = new Token<string>('Logger');
    const MISSION = new Token<string>('Mission');
    class Helm {
      constructor(readonly nav: unknown) {}
    }
    class Navigation {
      constructor(readonly helm: unknown) {}
    }
    class Missing {}
    class Needy {
      constructor(readonly missing: Missing) {}
    }
    class Captain {
      constructor(readonly mission: string) {}
    }
    const A = defineModule({
      name: 'A',
      providers: [provide(LOGGER, { useValue: 'a' })],
      exports: [LOGGER],
    });
    const B = defineModule({
      name: 'B',
      providers: [provide(LOGGER, { useValue: 'b' })],
      exports: [LOGGER],
    });
    const Root = defineModule({
      name: 'Root',
      imports: [A, B],
      providers: [
        null as never,
        provide(Needy, { deps: [Missing] }),
        provide(Helm, { deps: [Navigation] }),
        provide(Navigation, { deps: [Helm] }),
        provide(MISSION, {
          useFactory: () => 'x',
          deps: [],
          lifetime: 'scoped',
        }),
        provide(Captain, { deps: [MISSION] }),
      ],
    });

    expect(compileErrors(Root).map((e) => e.code)).toEqual([
      'NEXUS_INVALID_PROVIDER',
      'NEXUS_AMBIGUOUS_PROVIDER',
      'NEXUS_MISSING_PROVIDER',
      'NEXUS_CIRCULAR_DEPENDENCY',
      'NEXUS_LIFETIME_VIOLATION',
    ]);
  });

  it('throws a BlueprintError whose message lists each error on its own line', () => {
    let error: unknown;
    try {
      compile({
        root: defineModule({
          name: 'Root',
          providers: [null as never, 42 as never],
        }),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BlueprintError);
    expect((error as BlueprintError).message.split('\n')).toEqual([
      '[NEXUS_BLUEPRINT_INVALID] the module graph has 2 errors; nothing was built.',
      '  [NEXUS_INVALID_PROVIDER] Root.providers[0] is null, not a provider; list a class, a provide() result or a { token } literal.',
      '  [NEXUS_INVALID_PROVIDER] Root.providers[1] is the number 42, not a provider; list a class, a provide() result or a { token } literal.',
    ]);
  });

  it('returns a frozen blueprint', () => {
    expect(
      Object.isFrozen(compile({ root: defineModule({ name: 'Root' }) })),
    ).toBe(true);
  });

  it('compiles a module of literals into the blueprint provide() gives', () => {
    const NAME = new Token<string>('Name');
    class Probe {
      constructor(readonly name: string) {}
    }
    const byLiteral = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          { token: NAME, useValue: 'Meridian' },
          { token: Probe, deps: [NAME], lifetime: 'transient' },
        ],
      }),
    });
    const byProvide = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(NAME, { useValue: 'Meridian' }),
          provide(Probe, { deps: [NAME], lifetime: 'transient' }),
        ],
      }),
    });
    expect([...byLiteral.providers.values()]).toEqual([
      ...byProvide.providers.values(),
    ]);
    expect(byLiteral.singletonLevels).toEqual(byProvide.singletonLevels);
  });
});
