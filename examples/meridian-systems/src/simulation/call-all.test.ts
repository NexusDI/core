import { describe, expect, it } from 'vitest';

import { callAll } from './call-all';

describe('callAll', () => {
  it('calls every function with the argument in order', () => {
    const heard: string[] = [];
    callAll(
      [(arg: number) => heard.push(`a${arg}`), (arg) => heard.push(`b${arg}`)],
      1,
    );
    expect(heard).toEqual(['a1', 'b1']);
  });

  it('returns when nothing throws', () => {
    expect(callAll([() => undefined], 1)).toBeUndefined();
  });

  it('rethrows one error after the rest ran', () => {
    const boom = new Error('boom');
    const heard: string[] = [];
    expect(() =>
      callAll(
        [
          () => {
            throw boom;
          },
          () => heard.push('after'),
        ],
        1,
      ),
    ).toThrow(boom);
    expect(heard).toEqual(['after']);
  });

  it('throws an AggregateError when two throw, in call order', () => {
    const first = new Error('first');
    const second = new Error('second');
    let error: unknown;
    try {
      callAll(
        [
          () => {
            throw first;
          },
          () => {
            throw second;
          },
        ],
        1,
      );
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([first, second]);
  });
});
