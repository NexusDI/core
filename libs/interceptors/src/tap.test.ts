import { describe, expect, it, vi } from 'vitest';

import { tap } from './tap.js';

describe('tap', () => {
  it('passes a sync value to value() and returns it', () => {
    const value = vi.fn();
    expect(tap(() => 42, { value })).toBe(42);
    expect(value).toHaveBeenCalledWith(42);
  });

  it('passes a sync throw to error() and rethrows it', () => {
    const error = vi.fn();
    const failure = new Error('boom');
    expect(() =>
      tap(
        () => {
          throw failure;
        },
        { error },
      ),
    ).toThrow(failure);
    expect(error).toHaveBeenCalledWith(failure);
  });

  it('keeps a promise a promise and observes its value', async () => {
    const value = vi.fn();
    const result = tap(() => Promise.resolve('done'), { value });
    expect(result).toBeInstanceOf(Promise);
    expect(value).not.toHaveBeenCalled();
    await expect(result).resolves.toBe('done');
    expect(value).toHaveBeenCalledWith('done');
  });

  it('observes a rejection and rejects with the same reason', async () => {
    const error = vi.fn();
    const failure = new Error('late');
    await expect(tap(() => Promise.reject(failure), { error })).rejects.toBe(
      failure,
    );
    expect(error).toHaveBeenCalledWith(failure);
  });

  it('runs with no observers', () => {
    expect(tap(() => 'x', {})).toBe('x');
  });
});
