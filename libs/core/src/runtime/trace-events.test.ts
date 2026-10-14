import { describe, expect, it, vi } from 'vitest';

import { recordEvents } from '../../test-support/observe.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';
import type { TraceEvent } from './trace.js';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  onInit(): void {}
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [REACTOR, COMPUTER],
});

describe('startMs', () => {
  it('gives every timed event a span inside the operation that emitted it', async () => {
    const { events, plugin } = recordEvents();
    const before = performance.now();
    const ship = await Nexus.create(Engineering, { plugins: [plugin] });
    const shuttle = await ship.createScope();
    class Probe {}
    await ship.load(
      defineModule({
        name: 'Science',
        providers: [provide(Probe, { lifetime: 'scoped' })],
      }),
    );
    await shuttle.extend();
    await shuttle[Symbol.asyncDispose]();
    await ship[Symbol.asyncDispose]();
    const after = performance.now();
    // The type names startMs so the loop below compiles. The predicate tests
    // durationMs alone, so a core event that lacks startMs still reaches the
    // assertions and fails them.
    const timed = events.filter(
      (e): e is Extract<TraceEvent, { durationMs: number; startMs: number }> =>
        'durationMs' in e,
    );
    expect(timed.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'compile',
        'construct',
        'init',
        'scope:create',
        'scope:extend',
        'scope:dispose',
        'dispose',
      ]),
    );
    for (const e of timed) {
      expect(e.startMs, e.type).toBeGreaterThanOrEqual(before);
      expect(e.startMs + e.durationMs, e.type).toBeLessThanOrEqual(after);
    }
  });

  it('reads no clock during create, get and dispose without an observer', async () => {
    const clock = vi.spyOn(performance, 'now');
    const ship = await Nexus.create(Engineering);
    ship.get(COMPUTER);
    await ship[Symbol.asyncDispose]();
    expect(clock).not.toHaveBeenCalled();
    clock.mockRestore();
  });
});
