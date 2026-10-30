import { describe, expect, it } from 'vitest';

import { compileErrors } from '../../test-support/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { BlueprintError } from '../errors/index.js';
import { compile } from './compile.js';
import { NO_COMPILE_HOOKS, type CompileHooks } from './hooks.js';
import type { ModuleDefinition } from '../definitions/define-module.js';

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
      '[NEXUS_BLUEPRINT_INVALID] 2 errors. https://nexus.js.org/errors/NEXUS_BLUEPRINT_INVALID',
      '  [NEXUS_INVALID_PROVIDER] module=Root index=0 reason=not-a-provider detail=null. https://nexus.js.org/errors/NEXUS_INVALID_PROVIDER',
      '  [NEXUS_INVALID_PROVIDER] module=Root index=1 reason=not-a-provider detail=the number 42. https://nexus.js.org/errors/NEXUS_INVALID_PROVIDER',
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

describe('compile with no plugin', () => {
  it('shares one empty map for the hook results of every compile', () => {
    const a = compile({ root: defineModule({ name: 'A' }) });
    const b = compile({ root: defineModule({ name: 'B' }) });
    expect(a.rewrittenBy.size).toBe(0);
    expect(a.rewrittenBy).toBe(b.rewrittenBy);
    expect(a.replacedModules).toBe(b.replacedModules);
    expect(a.moduleByReplaced).toBe(b.moduleByReplaced);
  });
  describe('ids across a compile with previous', () => {
    const A = new Token<string>('A');
    const B = new Token<string>('B');
    const C = new Token<string>('C');
    const Held = defineModule({
      name: 'Held',
      providers: [provide(A, { useValue: 'a' })],
      exports: [A],
    });
    const Later = defineModule({
      name: 'Later',
      providers: [provide(B, { useValue: 'b' })],
      exports: [B],
    });
    const Root = defineModule({ name: 'Root', imports: [Held, Later] });
    const hooksFor = (
      pick: (m: ModuleDefinition) => ModuleDefinition | undefined,
    ): CompileHooks => ({
      ...NO_COMPILE_HOOKS,
      module: [{ plugin: 'test', call: pick }],
    });

    it('keeps the ids previous holds and numbers new modules and records from its nextIds', () => {
      const first = compile({ root: Root });
      const Grown = defineModule({
        name: 'Held',
        providers: [
          provide(A, { useValue: 'a' }),
          provide(C, { useValue: 'c' }),
        ],
        exports: [A, C],
      });
      const second = compile({
        root: Root,
        previous: first,
        phase: 'load',
        hooks: hooksFor((m) => (m === Held ? Grown : undefined)),
      });
      for (const id of first.providers.keys())
        expect(second.providers.get(id)?.token).toBe(
          first.providers.get(id)?.token,
        );
      const [, nextRecord] = first.nextIds;
      expect(second.providers.get(`p${nextRecord}`)?.token).toBe(C);
      expect(second.nextIds[1]).toBe(nextRecord + 1);
    });

    it('gives a fresh id to a second module that resolves to an id already claimed', () => {
      // At create the hook walks HeldStub in place of Held. At the load it
      // walks Held as itself and HeldStub in place of Later, so two modules
      // resolve to the id HeldStub held.
      const HeldStub = defineModule({
        name: 'HeldStub',
        providers: [provide(A, { useValue: 'stub' })],
      });
      const first = compile({
        root: Root,
        hooks: hooksFor((m) => (m === Held ? HeldStub : undefined)),
      });
      const heldId = first.moduleByDefinition.get(HeldStub);
      const second = compile({
        root: Root,
        previous: first,
        phase: 'load',
        hooks: hooksFor((m) => (m === Later ? HeldStub : undefined)),
      });
      const ids = [...second.modules.keys()];
      expect(new Set(ids).size).toBe(ids.length);
      expect(second.moduleByDefinition.get(Held)).toBe(heldId);
      expect(second.moduleByDefinition.get(HeldStub)).not.toBe(heldId);
    });

    it('assigns the ids of a compile without previous in walk order', () => {
      const bp = compile({ root: Root });
      expect([...bp.modules.keys()]).toEqual(['m0', 'm1', 'm2']);
      expect([...bp.providers.keys()].slice(0, 2)).toEqual(['p0', 'p1']);
      expect(bp.nextIds).toEqual([3, 2]);
    });

    it('gives a hook-free load the ids a fresh compile of the same graph assigns', () => {
      const first = compile({ root: Root });
      const Extra = defineModule({
        name: 'Extra',
        providers: [provide(C, { useValue: 'c' })],
      });
      const entries = [{ module: Extra, imports: [] }];
      const fresh = compile({ root: Root, extraImports: entries });
      const loaded = compile({
        root: Root,
        extraImports: entries,
        previous: first,
        phase: 'load',
      });
      expect([...loaded.modules.keys()]).toEqual([...fresh.modules.keys()]);
      expect([...loaded.providers.keys()]).toEqual([...fresh.providers.keys()]);
      expect(loaded.nextIds).toEqual(fresh.nextIds);
    });
  });
});
