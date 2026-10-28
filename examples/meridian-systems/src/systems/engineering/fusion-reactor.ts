import type { QueuedCommand } from '../../simulation/commands';
import { type IShipState, SHIP_STATE } from '../../simulation/contracts';

import type { IReactorCore, ReactorRating } from './contracts';
import { FUSION_REACTOR } from './engineering-model';

/** The Meridian's fusion reactor. It reads its output from `SHIP_STATE` and queues its throttle there. */
export class FusionReactor implements IReactorCore, Disposable {
  static deps = [SHIP_STATE] as const;

  readonly rating: ReactorRating = FUSION_REACTOR;

  constructor(private readonly state: IShipState) {}

  get output(): number {
    return this.state.snapshot().reactor.electric;
  }

  throttle(level: number): QueuedCommand {
    return this.state.queue({ reactor: { throttle: level } });
  }

  /**
   * The scram: the control rods drop. Commits the current
   * snapshot at the same tick with the reactor at level 0, no output and the
   * throttle at 0, so the last state a disposed ship shows is a cold reactor.
   * The power record stays the last tick's allocation: the scram drops the
   * rods and touches no load.
   */
  [Symbol.dispose](): void {
    const ship = this.state.snapshot();
    this.state.commit(
      Object.freeze({
        ...ship,
        reactor: Object.freeze({
          ...ship.reactor,
          level: 0,
          thermal: 0,
          electric: 0,
        }),
        setpoints: Object.freeze({
          ...ship.setpoints,
          reactor: Object.freeze({ throttle: 0 }),
        }),
      }),
    );
  }
}
