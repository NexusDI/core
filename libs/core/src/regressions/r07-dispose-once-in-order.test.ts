import { describe, expect, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from '../runtime/nexus.js';
import type { TraceEvent } from '../runtime/trace.js';

describe('R07', () => {
  it('disposes each object once, in reverse creation order, whichever providers reach it', async () => {
    const events: TraceEvent[] = [];
    const log: string[] = [];
    class Reactor {
      [Symbol.dispose]() {
        log.push('reactor');
      }
    }
    class Computer {
      constructor(readonly reactor: Reactor) {}
      [Symbol.dispose]() {
        log.push('computer');
      }
    }
    // AGAIN's factory and IN_SCOPE's scoped factory both hand back the same
    // Reactor instance: neither one comes to own it (ownership.ts claim), so
    // their own construct events never gain a matching dispose:instance.
    const AGAIN = new Token<Reactor>('ReactorAgain');
    const IN_SCOPE = new Token<Reactor>('ReactorInScope');
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [
          Reactor,
          provide(Computer, { deps: [Reactor] }),
          provide(AGAIN, { useFactory: (r) => r, deps: [Reactor] }),
          provide(IN_SCOPE, {
            useFactory: (r) => r,
            deps: [Reactor],
            lifetime: 'scoped',
          }),
        ],
      }),
      { trace: (event) => events.push(event) },
    );
    const shuttle = await ship.createScope();
    expect(shuttle.get(IN_SCOPE)).toBe(ship.get(Reactor));
    await shuttle[Symbol.asyncDispose]();
    expect(log).toEqual([]);
    expect(
      events.filter(
        (e) => e.type === 'dispose:instance' && e.scope === shuttle.id,
      ),
    ).toEqual([]);

    await ship[Symbol.asyncDispose]();
    expect(log).toEqual(['computer', 'reactor']);

    const constructed = events
      .filter(
        (e) =>
          e.type === 'construct' &&
          e.token !== 'ReactorAgain' &&
          e.token !== 'ReactorInScope',
      )
      .map((e) => (e.type === 'construct' ? e.token : ''));
    const disposed = events
      .filter((e) => e.type === 'dispose:instance')
      .map((e) => (e.type === 'dispose:instance' ? e.token : ''));
    expect(constructed).toEqual(['Reactor', 'Computer']);
    expect(disposed).toEqual(['Computer', 'Reactor']);
    expect(disposed).toEqual([...constructed].reverse());
    // Exactly one dispose:instance per object: Reactor is built once and
    // reused by AGAIN and IN_SCOPE, so it is disposed once, not three times.
    expect(disposed).toHaveLength(2);
  });
});
