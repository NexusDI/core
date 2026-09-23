import { describe, expectTypeOf, it } from 'vitest';

import {
  MultiToken,
  Token,
  all,
  lazy,
  optional,
  type DepsMap,
  type Nexus,
  type ResolvedDeps,
  type Scope,
} from '../index.js';

class ReactorCore {
  output = 1.21;
}
class SubspaceLink {}
const MISSION = new Token<string>('Mission');
const DIAGNOSTICS = new MultiToken<{ run(): boolean }>('Diagnostics');
declare const shuttle: Scope;
declare const ship: Nexus;

describe('ResolvedDeps', () => {
  it('maps a deps map entry by entry, with the modifier rules', () => {
    const deps = {
      reactor: ReactorCore,
      mission: MISSION,
      link: optional(SubspaceLink),
      later: lazy(ReactorCore),
      checks: all(DIAGNOSTICS),
    } as const;
    expectTypeOf<ResolvedDeps<typeof deps>>().toEqualTypeOf<{
      reactor: ReactorCore;
      mission: string;
      link: SubspaceLink | undefined;
      later: () => ReactorCore;
      checks: { run(): boolean }[];
    }>();
  });

  it('maps a deps tuple to a mutable tuple', () => {
    const deps = [ReactorCore, optional(MISSION)] as const;
    expectTypeOf<ResolvedDeps<typeof deps>>().toEqualTypeOf<
      [ReactorCore, string | undefined]
    >();
  });
});

describe('Scope', () => {
  it('types resolve() from the deps it receives', () => {
    const { reactor, link } = shuttle.resolve({
      reactor: ReactorCore,
      link: optional(SubspaceLink),
    });
    expectTypeOf(reactor).toEqualTypeOf<ReactorCore>();
    expectTypeOf(link).toEqualTypeOf<SubspaceLink | undefined>();
    expectTypeOf(shuttle.resolve([MISSION])).toEqualTypeOf<[string]>();
  });

  it('rejects a bare MultiToken in a deps map', () => {
    const bare = { checks: DIAGNOSTICS };
    // @ts-expect-error wrap DIAGNOSTICS in all()
    shuttle.resolve(bare);
  });
});

describe('Nexus', () => {
  it('accepts a deps map in validate() and returns nothing', () => {
    expectTypeOf(ship.validate({ reactor: ReactorCore })).toEqualTypeOf<void>();
    expectTypeOf<{ reactor: typeof ReactorCore }>().toExtend<DepsMap>();
  });
});
