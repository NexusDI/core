import { Token, type ProviderView } from '@nexusdi/core';
import { describe, expect, it, vi } from 'vitest';

import { findCode, rejected, thrown } from '../test-support/catch.js';
import { interceptedProxy, type Session } from './proxy.js';
import type { CallContext, Interceptor, Next } from './types.js';

const A = new Token<Interceptor>('A');
const B = new Token<Interceptor>('B');
const provider = { name: 'Payments' } as ProviderView;

const recorder = (log: string[], name: string): Interceptor => ({
  intercept(call: CallContext, next: Next) {
    log.push(`${name}:before:${String(call.method)}`);
    const result = next();
    log.push(`${name}:after`);
    return result;
  },
});

const session = (entries: [Token<Interceptor>, Interceptor][]): Session => ({
  instances: new Map(entries),
  disposed: false,
});

class Payments {
  #balance = 10;
  readonly calls: string[] = [];
  charge(amount: number): number {
    this.calls.push('charge');
    this.#balance -= amount;
    return this.#balance;
  }
  total(): number {
    return this.charge(0);
  }
  async settle(): Promise<string> {
    return 'settled';
  }
  get balance(): number {
    return this.#balance;
  }
  onInit(): number {
    return this.#balance;
  }
}

describe('interceptedProxy', () => {
  it('runs the chain outermost first, then the method on the raw instance', () => {
    const log: string[] = [];
    const raw = new Payments();
    const proxy = interceptedProxy(raw, provider, null, {
      session: session([
        [A, recorder(log, 'A')],
        [B, recorder(log, 'B')],
      ]),
      chain: (key) => (key === 'charge' ? [A, B] : []),
    });
    expect(proxy.charge(3)).toBe(7);
    expect(log).toEqual([
      'A:before:charge',
      'B:before:charge',
      'B:after',
      'A:after',
    ]);
    expect(proxy).toBeInstanceOf(Payments);
  });

  it('keeps private fields working in wrapped, unwrapped and lifecycle methods and accessors', () => {
    const proxy = interceptedProxy(new Payments(), provider, null, {
      session: session([[A, recorder([], 'A')]]),
      chain: (key) => (key === 'charge' ? [A] : []),
    });
    expect(proxy.charge(1)).toBe(9);
    expect(proxy.balance).toBe(9);
    expect(proxy.onInit()).toBe(9);
    expect(proxy.total()).toBe(9);
  });

  it('does not intercept a call from one method to another on this', () => {
    const log: string[] = [];
    const proxy = interceptedProxy(new Payments(), provider, null, {
      session: session([[A, recorder(log, 'A')]]),
      chain: (key) => (key === 'charge' ? [A] : []),
    });
    proxy.total();
    expect(log).toEqual([]);
  });

  it('never asks for a chain for onInit, then or constructor', () => {
    const chain = vi.fn(() => [A]);
    const proxy = interceptedProxy(new Payments(), provider, null, {
      session: session([[A, recorder([], 'A')]]),
      chain,
    });
    proxy.onInit();
    expect(chain).not.toHaveBeenCalledWith('onInit');
  });

  it('returns constructor as read, so identity, statics and new hold', () => {
    class Svc {
      static region = 'eu';
      ping() {
        return 'pong';
      }
    }
    const proxy = interceptedProxy(new Svc(), provider, null, {
      session: session([[A, recorder([], 'A')]]),
      chain: () => [A],
    });
    expect(proxy.constructor).toBe(Svc);
    expect(proxy.constructor.name).toBe('Svc');
    expect((proxy.constructor as typeof Svc).region).toBe('eu');
    expect(new (proxy.constructor as typeof Svc)()).toBeInstanceOf(Svc);
  });

  it('returns a class-valued field as read, even under a global chain', () => {
    class Model {
      constructor(readonly id: number) {}
    }
    class Repo {
      readonly Model = Model;
      readonly Builtin = Map;
    }
    const chain = vi.fn(() => [A]);
    const proxy = interceptedProxy(new Repo(), provider, null, {
      session: session([[A, recorder([], 'A')]]),
      chain,
    });
    expect(proxy.Model).toBe(Model);
    expect(new proxy.Model(3).id).toBe(3);
    expect(proxy.Builtin).toBe(Map);
    expect(chain).not.toHaveBeenCalled();
  });

  it('runs the method again for each next() call, as a retry does', () => {
    let attempts = 0;
    const retry: Interceptor = {
      intercept(_call, next) {
        try {
          return next();
        } catch {
          return next();
        }
      },
    };
    const proxy = interceptedProxy(
      {
        send(): string {
          attempts++;
          if (attempts === 1) throw new Error('flaky');
          return 'sent';
        },
      },
      provider,
      null,
      { session: session([[A, retry]]), chain: () => [A] },
    );
    expect(proxy.send()).toBe('sent');
    expect(attempts).toBe(2);
  });

  it('rejects next() with arguments that are not an array', () => {
    const proxy = interceptedProxy(new Payments(), provider, null, {
      session: session([
        [A, { intercept: (_call, next) => next('5' as never) }],
      ]),
      chain: (key) => (key === 'charge' ? [A] : []),
    });
    expect(
      findCode(
        thrown(() => proxy.charge(1)),
        'NEXUS_INTERCEPTOR_INVALID',
      ),
    ).toMatchObject({
      reason: 'bad-next',
      token: 'A',
      target: 'Payments',
      method: 'charge',
    });
  });

  it('passes the context and lets next() replace the arguments', () => {
    let seen: CallContext | undefined;
    const doubler: Interceptor = {
      intercept(call, next) {
        seen = call;
        return next([(call.args[0] as number) * 2]);
      },
    };
    const raw = new Payments();
    const proxy = interceptedProxy(raw, provider, 's3', {
      session: session([[A, doubler]]),
      chain: (key) => (key === 'charge' ? [A] : []),
    });
    expect(proxy.charge(2)).toBe(6);
    expect(seen).toMatchObject({
      instance: raw,
      provider,
      method: 'charge',
      args: [2],
      async: false,
      scope: 's3',
    });
    expect(Object.isFrozen(seen)).toBe(true);
  });

  it('short-circuits when an interceptor does not call next', () => {
    const cache: Interceptor = { intercept: () => 99 };
    const raw = new Payments();
    const proxy = interceptedProxy(raw, provider, null, {
      session: session([[A, cache]]),
      chain: () => [A],
    });
    expect(proxy.charge(1)).toBe(99);
    expect(raw.calls).toEqual([]);
  });

  it('turns a sync throw in an async method chain into a rejection', async () => {
    const failure = new Error('invalid');
    const validate: Interceptor = {
      intercept: () => {
        throw failure;
      },
    };
    const proxy = interceptedProxy(new Payments(), provider, null, {
      session: session([[A, validate]]),
      chain: () => [A],
    });
    const result = proxy.settle();
    expect(result).toBeInstanceOf(Promise);
    expect(await rejected(result)).toBe(failure);
  });

  it('keeps a sync throw sync for a sync method', () => {
    const failure = new Error('invalid');
    const validate: Interceptor = {
      intercept: () => {
        throw failure;
      },
    };
    const proxy = interceptedProxy(new Payments(), provider, null, {
      session: session([[A, validate]]),
      chain: () => [A],
    });
    expect(thrown(() => proxy.charge(1))).toBe(failure);
  });

  it('throws NOT_READY while building and after disposal', () => {
    const building: Session = { instances: undefined, disposed: false };
    const proxy = interceptedProxy(new Payments(), provider, null, {
      session: building,
      chain: () => [A],
    });
    expect(
      findCode(
        thrown(() => proxy.charge(1)),
        'NEXUS_INTERCEPTOR_NOT_READY',
      ),
    ).toMatchObject({
      state: 'building',
      target: 'Payments',
      method: 'charge',
    });
    const done = session([[A, recorder([], 'A')]]);
    const later = interceptedProxy(new Payments(), provider, null, {
      session: done,
      chain: () => [A],
    });
    done.disposed = true;
    expect(
      findCode(
        thrown(() => later.charge(1)),
        'NEXUS_INTERCEPTOR_NOT_READY',
      ),
    ).toMatchObject({ state: 'disposed' });
  });

  it('returns the same function for repeated reads of a method', () => {
    const proxy = interceptedProxy(new Payments(), provider, null, {
      session: session([[A, recorder([], 'A')]]),
      chain: () => [A],
    });
    expect(proxy.charge).toBe(proxy.charge);
  });

  it('intercepts own function properties of a plain object', () => {
    const log: string[] = [];
    const client = { send: (text: string) => `sent ${text}` };
    const proxy = interceptedProxy(client, provider, null, {
      session: session([[A, recorder(log, 'A')]]),
      chain: () => [A],
    });
    expect(proxy.send('x')).toBe('sent x');
    expect(log).toEqual(['A:before:send', 'A:after']);
  });

  it('leaves Object.prototype members alone', () => {
    const chain = vi.fn(() => [A]);
    const proxy = interceptedProxy(new Payments(), provider, null, {
      session: session([[A, recorder([], 'A')]]),
      chain,
    });
    expect(proxy.toString).toBe(Object.prototype.toString);
    expect(proxy.toString()).toBe('[object Object]');
    expect(chain).not.toHaveBeenCalledWith('toString');
  });

  it('writes properties to the raw instance', () => {
    const raw = { value: 1 };
    const proxy = interceptedProxy(raw, provider, null, {
      session: session([]),
      chain: () => [],
    });
    proxy.value = 2;
    expect(raw.value).toBe(2);
  });

  it('intercepts an own method of a frozen object', () => {
    const log: string[] = [];
    const client = Object.freeze({
      send: (text: string) => `sent ${text}`,
      ping: () => 'pong',
    });
    const proxy = interceptedProxy(client, provider, null, {
      session: session([[A, recorder(log, 'A')]]),
      chain: (key) => (key === 'send' ? [A] : []),
    });
    expect(proxy.send('x')).toBe('sent x');
    expect(proxy.ping()).toBe('pong');
    expect(log).toEqual(['A:before:send', 'A:after']);
  });

  it('reads keys, membership and descriptors of a frozen object through its proxy', () => {
    class Client {
      send() {
        return 'sent';
      }
    }
    const raw = Object.freeze(
      Object.assign(new Client(), { label: 'c', run: () => 1 }),
    );
    const proxy = interceptedProxy(raw, provider, null, {
      session: session([[A, recorder([], 'A')]]),
      chain: () => [A],
    });
    expect(proxy).toBeInstanceOf(Client);
    expect(Reflect.ownKeys(proxy)).toEqual(['label', 'run']);
    expect('send' in proxy).toBe(true);
    expect(Object.getOwnPropertyDescriptor(proxy, 'label')).toMatchObject({
      value: 'c',
      writable: false,
    });
    expect(
      thrown(() => ((proxy as { label: string }).label = 'd')),
    ).toBeInstanceOf(TypeError);
    expect(proxy.send()).toBe('sent');
  });

  it('fails for a frozen function whose own method is intercepted', () => {
    const fn = Object.freeze(
      Object.assign(() => 'called', { send: () => 'sent' }),
    );
    const env = {
      session: session([[A, recorder([], 'A')]]),
      chain: () => [A],
    };
    expect(
      findCode(
        thrown(() => interceptedProxy(fn, provider, null, env)),
        'NEXUS_INTERCEPTOR_INVALID',
      ),
    ).toMatchObject({
      reason: 'bad-target',
      target: 'Payments',
      method: 'send',
    });
  });

  it("returns a frozen function's own method as is when nothing intercepts it", () => {
    const send = () => 'sent';
    const fn = Object.freeze(Object.assign(() => 'called', { send }));
    const proxy = interceptedProxy(fn, provider, null, {
      session: session([]),
      chain: () => [],
    });
    expect(proxy.send).toBe(send);
    expect(proxy()).toBe('called');
  });
});
