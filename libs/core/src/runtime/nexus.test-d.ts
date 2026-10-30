import { describe, expectTypeOf, it } from 'vitest';

import { defineModule, Nexus as NexusClass, Token } from '../index.js';
import type {
  CheckOptions,
  CheckReport,
  CreateOptions,
  LoadEntry,
  LoadOptions,
  ModuleRef,
  Nexus,
} from '../index.js';

describe('Nexus', () => {
  it('has no graph(); graph(ship) lives in @nexusdi/devtools', () => {
    expectTypeOf<Nexus>().not.toHaveProperty('graph');
  });
});

describe('LoadOptions and LoadEntry', () => {
  const Helm = defineModule({ name: 'Helm' });

  it('takes module refs in imports and nothing else', () => {
    expectTypeOf<LoadOptions>().toEqualTypeOf<{
      readonly imports?: readonly ModuleRef[];
    }>();
    // @ts-expect-error a token is not a module
    const bad: LoadOptions = { imports: [new Token<string>('Name')] };
    void bad;
  });

  it('is a module ref or a module with its grant', () => {
    expectTypeOf<ModuleRef>().toExtend<LoadEntry>();
    expectTypeOf<{
      readonly module: ModuleRef;
      readonly imports: readonly ModuleRef[];
    }>().toExtend<LoadEntry>();
    // @ts-expect-error the grant list is required in the object form
    const bad: LoadEntry = { module: Helm };
    void bad;
  });

  it('shapes load() and CheckOptions.load with them', () => {
    expectTypeOf<Nexus['load']>().parameters.toEqualTypeOf<
      [module: ModuleRef, options?: LoadOptions]
    >();
    expectTypeOf<CheckOptions['load']>().toEqualTypeOf<
      readonly LoadEntry[] | undefined
    >();
  });
});

describe('CreateOptions', () => {
  it('has no trace option; trace(fn) is a plugin in @nexusdi/devtools', () => {
    expectTypeOf<CreateOptions>().not.toHaveProperty('trace');
    // @ts-expect-error the trace option left core
    const options: CreateOptions = { trace: () => {} };
    void options;
  });
});

describe('Nexus.check', () => {
  it('returns a CheckReport whose reasons are a closed union', () => {
    const Root = defineModule({ name: 'Root' });
    expectTypeOf(NexusClass.check(Root)).toEqualTypeOf<CheckReport>();
    expectTypeOf<CheckReport['unchecked'][number]['reason']>().toEqualTypeOf<
      'async-schema' | 'for-root-async'
    >();
  });
});
