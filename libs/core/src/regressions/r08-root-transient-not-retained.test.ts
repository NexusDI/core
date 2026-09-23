import { describe, expect, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Nexus } from '../runtime/nexus.js';

const gc = (globalThis as { gc?: () => void }).gc;
const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('R08', () => {
  it('retains no reference to a transient resolved from the root', async () => {
    expect(
      gc,
      'run vitest with --expose-gc (libs/core/vite.config.ts sets execArgv)',
    ).toBeTypeOf('function');
    const log: string[] = [];
    class Drone {
      [Symbol.dispose]() {
        log.push('drone disposed');
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Bay',
        providers: [provide(Drone, { lifetime: 'transient' })],
      }),
    );

    const ref = (() => new WeakRef(ship.get(Drone)))();
    // A WeakRef keeps its target alive until the job that created it ends.
    await macrotask();
    gc!();
    await macrotask();
    gc!();
    expect(ref.deref()).toBeUndefined();

    const shuttle = await ship.createScope();
    shuttle.get(Drone);
    shuttle.get(Drone);
    await shuttle[Symbol.asyncDispose]();
    expect(log).toEqual(['drone disposed', 'drone disposed']);
  });
});
