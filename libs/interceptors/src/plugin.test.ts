import { defineModule, lazy, Nexus, provide, Token } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { findCode, rejected, thrown } from '../test-support/catch.js';
import { interceptor } from './options.js';
import { interceptors } from './plugin.js';
import type { CallContext, Interceptor, Next } from './types.js';

interface IPayments {
  charge(amount: number): number;
  settle(): Promise<string>;
}
interface ILedger {
  readonly lines: string[];
}

const PAYMENTS = new Token<IPayments>('Payments');
const LEDGER = new Token<ILedger>('Ledger');
const AUDIT = new Token<Interceptor>('Audit');

class Ledger implements ILedger {
  readonly lines: string[] = [];
}

class AuditInterceptor implements Interceptor {
  static deps = [LEDGER] as const;
  constructor(private readonly ledger: ILedger) {}
  intercept(call: CallContext, next: Next) {
    this.ledger.lines.push(`${call.provider.name}.${String(call.method)}`);
    return next();
  }
}

class Payments implements IPayments {
  static interceptors = { methods: { charge: [AUDIT], settle: [AUDIT] } };
  #total = 0;
  charge(amount: number): number {
    this.#total += amount;
    return this.#total;
  }
  async settle(): Promise<string> {
    return `settled ${this.#total}`;
  }
}

const LedgerModule = defineModule({
  name: 'Ledger',
  providers: [provide(LEDGER, { useClass: Ledger })],
  exports: [LEDGER],
});

const plugin = () =>
  interceptors({
    imports: [LedgerModule],
    register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
  });

const Billing = defineModule({
  name: 'Billing',
  imports: [LedgerModule],
  providers: [provide(PAYMENTS, { useClass: Payments })],
  exports: [PAYMENTS],
});

describe('interceptors()', () => {
  it('intercepts a declared method and resolves the interceptor deps', async () => {
    await using ship = await Nexus.create(Billing, { plugins: [plugin()] });
    expect(ship.get(PAYMENTS).charge(5)).toBe(5);
    await expect(ship.get(PAYMENTS).settle()).resolves.toBe('settled 5');
    expect(ship.get(LEDGER).lines).toEqual([
      'Payments.charge',
      'Payments.settle',
    ]);
  });

  it('runs interceptors for a call made from another singleton onInit', async () => {
    class Warmup {
      static deps = [PAYMENTS] as const;
      constructor(private readonly payments: IPayments) {}
      onInit() {
        this.payments.charge(1);
      }
    }
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [Billing, LedgerModule],
        providers: [Warmup],
      }),
      { plugins: [plugin()] },
    );
    expect(ship.get(LEDGER).lines).toEqual(['Payments.charge']);
  });

  it('applies a global interceptor to every service and never to its own providers', async () => {
    const LOG = new Token<Interceptor>('Log');
    const seen: string[] = [];
    class Plain {
      ping() {
        return 'pong';
      }
    }
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [LedgerModule],
        providers: [Plain],
      }),
      {
        plugins: [
          interceptors({
            imports: [LedgerModule],
            register: [
              interceptor(LOG, {
                useValue: {
                  intercept: (call, next) => (
                    seen.push(String(call.method)),
                    next()
                  ),
                },
              }),
            ],
            global: [LOG],
          }),
        ],
      },
    );
    expect(ship.get(Plain).ping()).toBe('pong');
    expect(seen).toEqual(['ping']);
  });

  it('leaves a service with no interceptors unproxied', async () => {
    class Plain {
      ping() {
        return 'pong';
      }
    }
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [LedgerModule],
        providers: [Plain],
      }),
      { plugins: [plugin()] },
    );
    const plain = ship.get(Plain);
    expect(plain.ping).toBe(Plain.prototype.ping);
  });

  it('intercepts a factory provider through a binding', async () => {
    const CLIENT = new Token<{ send(text: string): string }>('Client');
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [LedgerModule],
        providers: [
          provide(CLIENT, {
            useFactory: () => ({ send: (text: string) => text }),
          }),
        ],
      }),
      {
        plugins: [
          interceptors({
            imports: [LedgerModule],
            register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
            bindings: [{ token: CLIENT, methods: { send: [AUDIT] } }],
          }),
        ],
      },
    );
    expect(ship.get(CLIENT).send('hi')).toBe('hi');
    expect(ship.get(LEDGER).lines).toEqual(['Client.send']);
  });

  it('fails the build when a binding names a method the instance lacks', async () => {
    const CLIENT = new Token<object>('Client');
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'App',
          imports: [LedgerModule],
          providers: [provide(CLIENT, { useFactory: () => ({}) })],
        }),
        {
          plugins: [
            interceptors({
              imports: [LedgerModule],
              register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
              bindings: [{ token: CLIENT, methods: { send: [AUDIT] } }],
            }),
          ],
        },
      ),
    );
    expect(findCode(error, 'NEXUS_INTERCEPTOR_INVALID')).toMatchObject({
      reason: 'unknown-method',
      method: 'send',
    });
  });

  it('passes the scope id to a scoped service call', async () => {
    const scopes: (string | null)[] = [];
    const SCOPED = new Token<{ run(): string }>('Scoped');
    class Worker {
      static interceptors = { class: [AUDIT] };
      run() {
        return 'ran';
      }
    }
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [LedgerModule],
        providers: [provide(SCOPED, { useClass: Worker, lifetime: 'scoped' })],
      }),
      {
        plugins: [
          interceptors({
            imports: [LedgerModule],
            register: [
              interceptor(AUDIT, {
                useValue: {
                  intercept: (call, next) => (scopes.push(call.scope), next()),
                },
              }),
            ],
          }),
        ],
      },
    );
    await using shuttle = await ship.createScope();
    expect(shuttle.get(SCOPED).run()).toBe('ran');
    expect(scopes).toEqual([shuttle.id]);
  });

  it('throws NOT_READY for a constructor call made before the registry is built', async () => {
    const DEEP = new Token<object>('Deep');
    const DEEPER = new Token<object>('Deeper');
    class Deep2 {}
    class Deep1 {
      static deps = [DEEPER] as const;
      constructor(_d: object) {}
    }
    class SlowInterceptor implements Interceptor {
      static deps = [DEEP] as const;
      constructor(_d: object) {}
      intercept(_call: CallContext, next: Next) {
        return next();
      }
    }
    class Eager {
      static deps = [PAYMENTS] as const;
      constructor(payments: IPayments) {
        payments.charge(1);
      }
    }
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'App',
          imports: [Billing, LedgerModule],
          providers: [Eager],
        }),
        {
          plugins: [
            interceptors({
              providers: [
                provide(DEEP, { useClass: Deep1 }),
                provide(DEEPER, { useClass: Deep2 }),
              ],
              register: [interceptor(AUDIT, { useClass: SlowInterceptor })],
            }),
          ],
        },
      ),
    );
    expect(findCode(error, 'NEXUS_INTERCEPTOR_NOT_READY')).toMatchObject({
      state: 'building',
      method: 'charge',
    });
  });

  it('throws NOT_READY after the container is disposed', async () => {
    const ship = await Nexus.create(Billing, { plugins: [plugin()] });
    const payments = ship.get(PAYMENTS);
    await ship[Symbol.asyncDispose]();
    expect(
      findCode(
        thrown(() => payments.charge(1)),
        'NEXUS_INTERCEPTOR_NOT_READY',
      ),
    ).toMatchObject({ state: 'disposed' });
  });

  it('rejects one plugin object in two live containers, and allows it after disposal', async () => {
    const shared = plugin();
    const first = await Nexus.create(Billing, { plugins: [shared] });
    expect(
      findCode(
        await rejected(Nexus.create(Billing, { plugins: [shared] })),
        'NEXUS_INTERCEPTORS_SHARED',
      ),
    ).toBeDefined();
    await first[Symbol.asyncDispose]();
    await using second = await Nexus.create(Billing, { plugins: [shared] });
    expect(second.get(PAYMENTS).charge(2)).toBe(2);
  });

  it('fails create for a registered interceptor without intercept()', async () => {
    const error = await rejected(
      Nexus.create(Billing, {
        plugins: [
          interceptors({
            imports: [LedgerModule],
            register: [interceptor(AUDIT, { useValue: {} as Interceptor })],
          }),
        ],
      }),
    );
    expect(findCode(error, 'NEXUS_INTERCEPTOR_INVALID')).toMatchObject({
      reason: 'no-intercept',
      token: 'Audit',
    });
  });

  it('intercepts a frozen factory result under a global interceptor', async () => {
    const LOG = new Token<Interceptor>('Log');
    const CLIENT = new Token<{ send(text: string): string }>('Client');
    const seen: string[] = [];
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        providers: [
          provide(CLIENT, {
            useFactory: () => Object.freeze({ send: (text: string) => text }),
          }),
        ],
        exports: [CLIENT],
      }),
      {
        plugins: [
          interceptors({
            register: [
              interceptor(LOG, {
                useValue: {
                  intercept: (call, next) => (
                    seen.push(String(call.method)),
                    next()
                  ),
                },
              }),
            ],
            global: [LOG],
          }),
        ],
      },
    );
    expect(ship.get(CLIENT).send('hi')).toBe('hi');
    expect(seen).toEqual(['send']);
  });

  it('never intercepts a useValue provider', async () => {
    const VALUE = new Token<{ ping(): string }>('Value');
    const value = { ping: () => 'pong' };
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [LedgerModule],
        providers: [provide(VALUE, { useValue: value })],
      }),
      {
        plugins: [
          interceptors({
            imports: [LedgerModule],
            register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
            global: [AUDIT],
          }),
        ],
      },
    );
    expect(ship.get(VALUE)).toBe(value);
  });

  it('keeps lazy() of an intercepted service intercepted', async () => {
    class Caller {
      static deps = [lazy(PAYMENTS)] as const;
      constructor(readonly payments: () => IPayments) {}
    }
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [Billing, LedgerModule],
        providers: [Caller],
      }),
      { plugins: [plugin()] },
    );
    ship.get(Caller).payments().charge(1);
    expect(ship.get(LEDGER).lines).toEqual(['Payments.charge']);
  });

  it("skips global entries on the interceptors' own deps, so an interceptor never re-enters itself", async () => {
    interface IJournal {
      write(line: string): void;
      readonly lines: string[];
    }
    const JOURNAL = new Token<IJournal>('Journal');
    const LOG = new Token<Interceptor>('Log');
    class Journal implements IJournal {
      readonly lines: string[] = [];
      write(line: string): void {
        this.lines.push(line);
      }
    }
    class LogInterceptor implements Interceptor {
      static deps = [JOURNAL] as const;
      constructor(private readonly journal: IJournal) {}
      intercept(call: CallContext, next: Next) {
        this.journal.write(String(call.method));
        return next();
      }
    }
    class Radar {
      scan(): string {
        return 'clear';
      }
    }
    const JournalModule = defineModule({
      name: 'Journal',
      providers: [provide(JOURNAL, { useClass: Journal })],
      exports: [JOURNAL],
    });
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [JournalModule],
        providers: [Radar],
        exports: [JOURNAL],
      }),
      {
        plugins: [
          interceptors({
            imports: [JournalModule],
            register: [interceptor(LOG, { useClass: LogInterceptor })],
            global: [LOG],
          }),
        ],
      },
    );
    expect(ship.get(Radar).scan()).toBe('clear');
    ship.get(JOURNAL).write('direct');
    expect(ship.get(JOURNAL).lines).toEqual(['scan', 'direct']);
  });

  it('leaves a live container intact when a second create with the same plugin fails', async () => {
    const calls: string[] = [];
    const shared = interceptors({
      register: [
        interceptor(AUDIT, {
          useValue: {
            intercept: (call, next) => (
              calls.push(String(call.method)),
              next()
            ),
          },
        }),
      ],
    });
    const SCOPED = new Token<{ run(): string }>('Scoped');
    class Worker {
      static interceptors = { class: [AUDIT] };
      run() {
        return 'ran';
      }
    }
    // Inner is m1 in the first container; the plugin's module is m1 in the
    // second, so a module id shared across containers would skip Worker.
    const Inner = defineModule({
      name: 'Inner',
      providers: [provide(SCOPED, { useClass: Worker, lifetime: 'scoped' })],
      exports: [SCOPED],
    });
    await using first = await Nexus.create(
      defineModule({ name: 'First', imports: [Inner], exports: [Inner] }),
      { plugins: [shared] },
    );
    const error = await rejected(
      Nexus.create(defineModule({ name: 'Second' }), { plugins: [shared] }),
    );
    expect(findCode(error, 'NEXUS_INTERCEPTORS_SHARED')).toBeDefined();
    await using shuttle = await first.createScope();
    expect(shuttle.get(SCOPED).run()).toBe('ran');
    expect(calls).toEqual(['run']);
  });
});
