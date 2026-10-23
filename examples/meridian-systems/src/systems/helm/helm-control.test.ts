import { describe, expect, it } from 'vitest';

import { PLASMA_DRIVE, RCS_THRUSTERS } from '../../physics/motion';
import type { IMainDrive } from '../propulsion/contracts';
import type { INavCharts } from '../tactical/contracts';
import type { IThrusters } from './contracts';
import { HelmControl } from './helm-control';

/** A helm over doubles of its dependencies that record each call. */
function build() {
  const steered: number[] = [];
  const throttled: number[] = [];
  const plotted: string[] = [];
  const thrusters: IThrusters = {
    rating: RCS_THRUSTERS,
    steer: (heading) => {
      steered.push(heading);
      return { tick: 3 };
    },
  };
  const drive: IMainDrive = {
    rating: PLASMA_DRIVE,
    throttle: (level) => {
      throttled.push(level);
      return { tick: 4 };
    },
  };
  const charts: INavCharts = {
    plot: (to) => {
      plotted.push(to);
      return { to, heading: to === 'Kepler-442b' ? 42 : 0 };
    },
  };
  const helm = new HelmControl(thrusters, drive, charts);
  return { helm, steered, throttled, plotted };
}

describe('HelmControl', () => {
  it("plots the course and steers the charts' heading in rad", () => {
    const { helm, steered, plotted } = build();
    expect(helm.course('Kepler-442b')).toEqual({ tick: 3 });
    expect(plotted).toEqual(['Kepler-442b']);
    expect(steered).toEqual([0.7330382858376184]);
  });

  it('steers heading 0 for a star the charts do not hold', () => {
    const { helm, steered } = build();
    helm.course('Vega');
    expect(steered).toEqual([0]);
  });

  it('throttles the main drive for a burn', () => {
    const { helm, throttled, steered } = build();
    expect(helm.burn(0.5)).toEqual({ tick: 4 });
    expect(throttled).toEqual([0.5]);
    expect(steered).toEqual([]);
  });
});
