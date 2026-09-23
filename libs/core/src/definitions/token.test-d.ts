import { describe, expectTypeOf, it } from 'vitest';

import { MultiToken, Token, type InjectionToken } from './token.js';

class PowerSource {
  watts = 1;
}
class ReactorCore extends PowerSource {
  output = 1.21;
}

describe('Token', () => {
  it('is covariant in its type', () => {
    expectTypeOf<Token<ReactorCore>>().toExtend<Token<PowerSource>>();
    expectTypeOf<Token<PowerSource>>().not.toExtend<Token<ReactorCore>>();
  });

  it('keeps tokens of unrelated types apart', () => {
    expectTypeOf<Token<string>>().not.toExtend<Token<number>>();
  });

  it('is a separate type from MultiToken', () => {
    expectTypeOf<MultiToken<string>>().not.toExtend<Token<string[]>>();
    expectTypeOf<Token<string[]>>().not.toExtend<MultiToken<string>>();
  });
});

describe('InjectionToken', () => {
  it('accepts a class as its own token', () => {
    expectTypeOf(ReactorCore).toExtend<InjectionToken<ReactorCore>>();
    expectTypeOf(ReactorCore).not.toExtend<InjectionToken<string>>();
  });
});
