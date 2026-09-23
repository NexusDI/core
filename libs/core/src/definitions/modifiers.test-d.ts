import { describe, expectTypeOf, it } from 'vitest';

import {
  all,
  lazy,
  optional,
  type All,
  type Dep,
  type Lazy,
  type Optional,
  type Resolve,
  type ResolveAll,
  type Tokens,
} from './modifiers.js';
import { MultiToken, Token } from './token.js';

class ReactorCore {
  output = 1.21;
}
class ShieldGrid {
  draw() {
    return 0.4;
  }
}
class SubspaceLink {
  frequency = 1420;
}
interface Diagnostic {
  run(): boolean;
}
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');
const NAME = new Token<string>('Name');

describe('Resolve', () => {
  it('maps each deps entry to what it resolves to', () => {
    expectTypeOf<Resolve<typeof ReactorCore>>().toEqualTypeOf<ReactorCore>();
    expectTypeOf<Resolve<typeof NAME>>().toEqualTypeOf<string>();
    expectTypeOf<Resolve<Optional<SubspaceLink>>>().toEqualTypeOf<
      SubspaceLink | undefined
    >();
    expectTypeOf<Resolve<Lazy<ShieldGrid>>>().toEqualTypeOf<() => ShieldGrid>();
    expectTypeOf<Resolve<All<Diagnostic>>>().toEqualTypeOf<Diagnostic[]>();
  });
});

describe('ResolveAll', () => {
  it('maps a deps tuple to a tuple of arguments', () => {
    const deps = [
      ReactorCore,
      optional(SubspaceLink),
      all(DIAGNOSTICS),
    ] as const;
    expectTypeOf<ResolveAll<typeof deps>>().toEqualTypeOf<
      [ReactorCore, SubspaceLink | undefined, Diagnostic[]]
    >();
  });
});

describe('Tokens', () => {
  it('accepts a matching deps entry for each parameter', () => {
    type Params = [
      ReactorCore,
      () => ShieldGrid,
      Diagnostic[],
      SubspaceLink | undefined,
    ];
    const deps: Tokens<Params> = [
      ReactorCore,
      lazy(ShieldGrid),
      all(DIAGNOSTICS),
      optional(SubspaceLink),
    ];
    expectTypeOf(deps).toExtend<Tokens<Params>>();
  });

  it('rejects a deps entry of the wrong type', () => {
    // @ts-expect-error SubspaceLink is not a ReactorCore
    const deps: Tokens<[ReactorCore]> = [SubspaceLink];
  });

  it('rejects optional() for a parameter that does not accept undefined', () => {
    // @ts-expect-error ReactorCore does not accept undefined
    const deps: Tokens<[ReactorCore]> = [optional(ReactorCore)];
  });
});

describe('Dep', () => {
  it('excludes a bare MultiToken, which must be wrapped in all()', () => {
    expectTypeOf<MultiToken<Diagnostic>>().not.toExtend<Dep>();
    expectTypeOf(all(DIAGNOSTICS)).toExtend<Dep>();
  });
});
