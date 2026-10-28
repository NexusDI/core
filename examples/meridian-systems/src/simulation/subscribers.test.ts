import { describe, expect, it } from 'vitest';

import { Subscribers } from './subscribers';

describe('Subscribers', () => {
  it('iterates the items in the order they were added', () => {
    const subscribers = new Subscribers<string>();
    subscribers.add('a');
    subscribers.add('b');
    expect([...subscribers]).toEqual(['a', 'b']);
  });

  it('holds an item added twice twice', () => {
    const subscribers = new Subscribers<string>();
    const stop = subscribers.add('a');
    subscribers.add('a');
    expect([...subscribers]).toEqual(['a', 'a']);
    stop();
    expect([...subscribers]).toEqual(['a']);
  });

  it('removes an item at its stop, which runs twice and removes once', () => {
    const subscribers = new Subscribers<string>();
    subscribers.add('a');
    const stop = subscribers.add('b');
    stop();
    stop();
    expect([...subscribers]).toEqual(['a']);
    expect(subscribers.size).toBe(1);
  });

  it('skips an item removed during the iteration before it was visited', () => {
    const subscribers = new Subscribers<string>();
    const seen: string[] = [];
    let stopLater = () => {};
    subscribers.add('first');
    stopLater = subscribers.add('later');
    subscribers.add('last');
    for (const item of subscribers) {
      seen.push(item);
      if (item === 'first') stopLater();
    }
    expect(seen).toEqual(['first', 'last']);
  });

  it('still visits an item removed after it was visited', () => {
    const subscribers = new Subscribers<string>();
    const stopFirst = subscribers.add('first');
    subscribers.add('second');
    const seen: string[] = [];
    for (const item of subscribers) {
      seen.push(item);
      if (item === 'second') stopFirst();
    }
    expect(seen).toEqual(['first', 'second']);
    expect([...subscribers]).toEqual(['second']);
  });

  it('leaves an item added during the iteration for the next one', () => {
    const subscribers = new Subscribers<string>();
    subscribers.add('first');
    const seen: string[] = [];
    for (const item of subscribers) {
      seen.push(item);
      if (item === 'first') subscribers.add('added');
    }
    expect(seen).toEqual(['first']);
    expect([...subscribers]).toEqual(['first', 'added']);
  });

  it('counts its items and empties at clear', () => {
    const subscribers = new Subscribers<number>();
    expect(subscribers.size).toBe(0);
    subscribers.add(1);
    subscribers.add(2);
    expect(subscribers.size).toBe(2);
    subscribers.clear();
    expect(subscribers.size).toBe(0);
    expect([...subscribers]).toEqual([]);
  });

  it('skips an item that clear removed during the iteration', () => {
    const subscribers = new Subscribers<string>();
    subscribers.add('first');
    subscribers.add('second');
    const seen: string[] = [];
    for (const item of subscribers) {
      seen.push(item);
      subscribers.clear();
    }
    expect(seen).toEqual(['first']);
  });
});
