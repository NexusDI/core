import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import { describeValue } from './describe.js';
import { MultiToken, Token, displayName } from './token.js';

describe('Token', () => {
  it('returns its description from toString', () => {
    expect(String(new Token<string>('NavCharts'))).toBe('NavCharts');
    expect(new Token<string>('NavCharts').description).toBe('NavCharts');
  });

  it('compares by identity, whatever the description', () => {
    expect(new Token<string>('NavCharts')).not.toBe(
      new Token<string>('NavCharts'),
    );
  });

  it('throws NEXUS_INVALID_TOKEN for a missing or empty description', () => {
    expect(thrown(() => new Token(undefined as never))).toMatchObject({
      code: 'NEXUS_INVALID_TOKEN',
      received: 'undefined',
    });
    expect(thrown(() => new Token(''))).toMatchObject({
      code: 'NEXUS_INVALID_TOKEN',
    });
  });
});

describe('MultiToken', () => {
  it('returns its description from toString', () => {
    expect(String(new MultiToken<string>('Diagnostics'))).toBe('Diagnostics');
  });

  it('throws NEXUS_INVALID_TOKEN for a missing description', () => {
    expect(thrown(() => new MultiToken(42 as never))).toMatchObject({
      code: 'NEXUS_INVALID_TOKEN',
      received: 'the number 42',
    });
  });
});

describe('displayName', () => {
  it('names a class by its name and a token by its description', () => {
    class ReactorCore {}
    expect(displayName(ReactorCore)).toBe('ReactorCore');
    expect(displayName(new Token<string>('NavCharts'))).toBe('NavCharts');
    expect(displayName(new MultiToken<string>('Diagnostics'))).toBe(
      'Diagnostics',
    );
  });

  it('names an anonymous class', () => {
    expect(displayName((() => class {})())).toBe('(anonymous class)');
  });
});

describe('describeValue', () => {
  it('describes each kind of value for an error message', () => {
    expect(describeValue(undefined)).toBe('undefined');
    expect(describeValue(null)).toBe('null');
    expect(describeValue('nav')).toBe('the string "nav"');
    expect(describeValue(3)).toBe('the number 3');
    expect(describeValue(Symbol('nav'))).toBe('the symbol Symbol(nav)');
    expect(describeValue(() => 1)).toBe('the function (anonymous)');
    expect(describeValue([1])).toBe('an array');
    expect(describeValue({})).toBe('an object');
  });
});
