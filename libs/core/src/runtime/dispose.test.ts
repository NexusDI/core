import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NexusSuppressedError,
  chainErrors,
  disposeInReverse,
  disposeObject,
  hasDisposer,
} from './dispose.js';
import { Ownership, type OwnedEntry } from './ownership.js';

const entry = (instance: object, token: string): OwnedEntry => ({
  instance,
  providerId: token,
  token,
});

describe('disposeObject', () => {
  it('awaits Symbol.asyncDispose once and never calls Symbol.dispose on an object with both', async () => {
    const calls: string[] = [];
    const both = {
      async [Symbol.asyncDispose]() {
        calls.push('async');
      },
      [Symbol.dispose]() {
        calls.push('sync');
      },
    };
    expect(await disposeObject(both)).toBe(true);
    expect(calls).toEqual(['async']);
  });

  it('calls Symbol.dispose when it is the only disposer', async () => {
    const dispose = vi.fn();
    expect(await disposeObject({ [Symbol.dispose]: dispose })).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('reports an object without a disposer', async () => {
    expect(await disposeObject({})).toBe(false);
    expect(hasDisposer({})).toBe(false);
  });
});

describe('disposeInReverse', () => {
  it('disposes last first, one at a time, and empties the list', async () => {
    const order: string[] = [];
    const make = (name: string) => ({
      async [Symbol.asyncDispose]() {
        order.push(`start ${name}`);
        await Promise.resolve();
        order.push(`end ${name}`);
      },
    });
    const entries = [entry(make('a'), 'a'), entry(make('b'), 'b')];
    const report = await disposeInReverse(entries, new Ownership());
    expect(order).toEqual(['start b', 'end b', 'start a', 'end a']);
    expect(entries).toEqual([]);
    expect(report).toEqual({ disposed: 2, errors: [] });
  });

  it('continues after a disposer throws and reports every error', async () => {
    const boom = new Error('stuck rod');
    const later = vi.fn();
    const report = await disposeInReverse(
      [
        entry({ [Symbol.dispose]: later }, 'a'),
        entry(
          {
            [Symbol.dispose]: () => {
              throw boom;
            },
          },
          'b',
        ),
      ],
      new Ownership(),
    );
    expect(later).toHaveBeenCalledOnce();
    expect(report.errors).toEqual([boom]);
  });

  it('reports each disposed entry in disposal order and skips objects without a disposer', async () => {
    const seen: string[] = [];
    await disposeInReverse(
      [
        entry({ [Symbol.dispose]() {} }, 'a'),
        entry({}, 'plain'),
        entry({ [Symbol.dispose]() {} }, 'c'),
      ],
      new Ownership(),
      (e) => seen.push(e.token),
    );
    expect(seen).toEqual(['c', 'a']);
  });

  it('marks every entry disposed', async () => {
    const ownership = new Ownership();
    const reactor = {};
    await disposeInReverse([entry(reactor, 'a')], ownership);
    expect(ownership.isDisposed(reactor)).toBe(true);
  });
});

describe('chainErrors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns nothing for no errors and the error itself for one', () => {
    const boom = new Error('boom');
    expect(chainErrors([])).toBeUndefined();
    expect(chainErrors([boom])).toEqual({ error: boom });
  });

  it('chains errors the way DisposableStack does, newest outermost', () => {
    const first = new Error('first');
    const second = new Error('second');
    const third = new Error('third');
    const chained = chainErrors([first, second, third])
      ?.error as SuppressedError;
    expect(chained).toBeInstanceOf(SuppressedError);
    expect(chained.error).toBe(third);
    expect((chained.suppressed as SuppressedError).error).toBe(second);
    expect((chained.suppressed as SuppressedError).suppressed).toBe(first);
  });

  it('falls back to an internal class with the same fields when SuppressedError is absent', () => {
    vi.stubGlobal('SuppressedError', undefined);
    const chained = chainErrors([new Error('a'), new Error('b')])?.error;
    expect(chained).toBeInstanceOf(NexusSuppressedError);
    expect(chained).toMatchObject({
      name: 'SuppressedError',
      error: { message: 'b' },
      suppressed: { message: 'a' },
    });
  });
});
