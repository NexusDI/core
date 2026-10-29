import { FtlNotSpooledError } from '../../errors';
import {
  COMMAND_DESK,
  type ICommandDesk,
  type ICommandHandler,
  type QueuedCommand,
} from '../../simulation/commands';
import {
  type IShipState,
  type IShipSystem,
  type ITickLoop,
  SHIP_STATE,
  TICK_LOOP,
} from '../../simulation/contracts';
import {
  type IPowerConsumer,
  type IPowerRouter,
  POWER_ROUTER,
} from '../engineering/contracts';
import { type INavCharts, NAV_CHARTS } from '../tactical/contracts';

import {
  FTL_COMMANDS,
  FTL_PHYSICS,
  FTL_POWER,
  type FtlRating,
  type IFtlDrive,
} from './contracts';
import { refuseFtl } from './ftl-commands';
import { FTL_SPOOL, FTL_SPOOL_LOAD } from './ftl-model';
import { FTL_RECORD } from './ftl-record';

/**
 * The Meridian's jump drive. A module that `load()` adds cannot contribute to
 * a multi token, so `onInit` registers the drive's record with the ship
 * state, its step with the loop, its load with the router and its commands
 * with the desk, and the dispose unregisters them. The record joins first,
 * so the step and the load read it from their first tick. A container whose plugin sets `onInit: false` gives a
 * drive that never charges and that the desk does not serve. A ship loads
 * the drive after startup, when every consumer of the router is built, so the
 * router's register reads a ready list.
 */
export class JumpDrive implements IFtlDrive, Disposable {
  static deps = [
    TICK_LOOP,
    SHIP_STATE,
    NAV_CHARTS,
    POWER_ROUTER,
    COMMAND_DESK,
    FTL_PHYSICS,
    FTL_POWER,
    FTL_COMMANDS,
  ] as const;

  readonly rating: FtlRating = FTL_SPOOL;
  /** The unregister of each registration so far, in registration order. */
  private readonly unregisters: (() => void)[] = [];

  constructor(
    private readonly loop: ITickLoop,
    private readonly state: IShipState,
    private readonly charts: INavCharts,
    private readonly router: IPowerRouter,
    private readonly desk: ICommandDesk,
    private readonly physics: IShipSystem,
    private readonly power: IPowerConsumer,
    private readonly commands: ICommandHandler,
  ) {}

  /**
   * The drive keeps each unregister as its register returns. When a register
   * throws, load() disposes the drive it built, and the dispose removes the
   * parts registered before it, so a later load can register them again.
   */
  onInit(): void {
    this.unregisters.push(this.state.register(FTL_RECORD));
    this.unregisters.push(this.loop.register(this.physics));
    this.unregisters.push(this.router.register(this.power));
    this.unregisters.push(this.desk.register(this.commands));
  }

  spool(): QueuedCommand {
    const ship = this.state.snapshot();
    // An armed drive stays armed, so a second spool has nothing to queue. A
    // second router check would refuse it on a tick the router sheds it.
    if (ship.setpoints.ftl?.armed === true) return { tick: ship.tick + 1 };
    this.router.divert({ ...FTL_SPOOL_LOAD, demand: this.rating.power });
    return this.state.queue({ ftl: { armed: true } });
  }

  jump(to: string): QueuedCommand {
    if (!this.charts.has(to)) throw refuseFtl('jump', { argument: 'to' });
    const charge = this.state.snapshot().ftl?.charge ?? 0;
    if (charge < this.rating.energy) {
      throw new FtlNotSpooledError({ charge, energy: this.rating.energy });
    }
    return this.state.queue({ ftl: { jump: to } });
  }

  /** Unregisters the parts in reverse registration order. */
  [Symbol.dispose](): void {
    for (const unregister of this.unregisters.splice(0).reverse()) {
      unregister();
    }
  }
}
