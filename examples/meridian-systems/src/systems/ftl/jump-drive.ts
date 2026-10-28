import { FtlNotSpooledError } from '../../errors';
import type { QueuedCommand } from '../../simulation/commands';
import {
  type IShipState,
  type ITickLoop,
  SHIP_STATE,
  TICK_LOOP,
} from '../../simulation/contracts';
import { type IPowerRouter, POWER_ROUTER } from '../engineering/contracts';
import { type INavCharts, NAV_CHARTS } from '../tactical/contracts';

import type { FtlRating, IFtlDrive } from './contracts';
import { refuseFtl } from './ftl-commands';
import { FTL_SPOOL, FTL_SPOOL_LOAD } from './ftl-model';
import { FtlPhysics } from './ftl-physics';
import { FtlPower } from './ftl-power';

/**
 * The Meridian's jump drive. It joins the loop and the router in `onInit`,
 * so a container whose plugin sets `onInit: false` gives a drive that never charges.
 */
export class JumpDrive implements IFtlDrive, Disposable {
  static deps = [TICK_LOOP, SHIP_STATE, NAV_CHARTS, POWER_ROUTER] as const;

  readonly rating: FtlRating = FTL_SPOOL;

  private detach: readonly (() => void)[] = [];

  constructor(
    private readonly loop: ITickLoop,
    private readonly state: IShipState,
    private readonly charts: INavCharts,
    private readonly router: IPowerRouter,
  ) {}

  onInit(): void {
    // The loop's all(SHIP_SYSTEMS) and the router's all(POWER_CONSUMERS) are
    // the lists at their construction, so a loaded drive attaches itself.
    // The drive keeps each detach as its attach returns. When the router
    // attach throws, load() disposes the drive it built, and the dispose
    // removes the loop entry, so a later load can attach the drive again.
    const detachLoop = this.loop.attach(new FtlPhysics(this.rating));
    this.detach = [detachLoop];
    this.detach = [detachLoop, this.router.attach(new FtlPower(this.rating))];
  }

  spool(): QueuedCommand {
    const ship = this.state.snapshot();
    // An armed drive stays armed, so a second spool has nothing to queue. A
    // second router check would refuse it on a tick the router sheds it.
    if (ship.setpoints.ftl.armed) return { tick: ship.tick + 1 };
    this.router.divert({ ...FTL_SPOOL_LOAD, demand: this.rating.power });
    return this.state.queue({ ftl: { armed: true } });
  }

  jump(to: string): QueuedCommand {
    if (!this.charts.has(to)) throw refuseFtl('jump', { argument: 'to' });
    const { charge } = this.state.snapshot().ftl;
    if (charge < this.rating.energy) {
      throw new FtlNotSpooledError({ charge, energy: this.rating.energy });
    }
    return this.state.queue({ ftl: { jump: to } });
  }

  [Symbol.dispose](): void {
    for (const detach of this.detach) detach();
  }
}
