import { toRadians } from '../../physics/motion';
import type { QueuedCommand } from '../../simulation/commands';
import { type IMainDrive, MAIN_DRIVE } from '../propulsion/contracts';
import { type INavCharts, NAV_CHARTS } from '../tactical/contracts';
import { type IHelm, type IThrusters, THRUSTERS } from './contracts';

/**
 * The Meridian's helm. It plots a course once, at the command, so a tick
 * never calls the charts, and it converts the charts' degrees to rad.
 */
export class HelmControl implements IHelm {
  static deps = [THRUSTERS, MAIN_DRIVE, NAV_CHARTS] as const;

  constructor(
    private readonly thrusters: IThrusters,
    private readonly drive: IMainDrive,
    private readonly charts: INavCharts,
  ) {}

  /** A star the charts do not hold plots heading 0, as `INavCharts.plot` documents. */
  course(to: string): QueuedCommand {
    return this.thrusters.steer(toRadians(this.charts.plot(to).heading));
  }

  burn(level: number): QueuedCommand {
    return this.drive.throttle(level);
  }
}
