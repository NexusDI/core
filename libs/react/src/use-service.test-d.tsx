import { MultiToken, Token } from '@nexusdi/core';
import { expectTypeOf, it } from 'vitest';

import { useService } from './index.js';

interface IFlightLog {
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const DIAGNOSTICS = new MultiToken<{ system: string }>('Diagnostics');
class StatusBoard {
  readonly lines: string[] = [];
}

it('types a Token, a MultiToken and a class', () => {
  expectTypeOf(useService(FLIGHT_LOG)).toEqualTypeOf<IFlightLog>();
  expectTypeOf(useService(DIAGNOSTICS)).toEqualTypeOf<
    readonly { system: string }[]
  >();
  expectTypeOf(useService(StatusBoard)).toEqualTypeOf<StatusBoard>();
});

it('takes LookupOptions', () => {
  // @ts-expect-error -- module must be a ModuleRef
  useService(FLIGHT_LOG, { module: 42 });
});
