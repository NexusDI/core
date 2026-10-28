import { describe, expect, it } from 'vitest';

import { BadCommandError } from '../../errors';
import { PLASMA_DRIVE, RCS_THRUSTERS } from '../../physics/motion';
import type { IMainDrive } from '../propulsion/contracts';
import type { INavCharts } from '../tactical/contracts';

import { HELM_ACTIONS, type IThrusters } from './contracts';
import { HelmControl } from './helm-control';

/** A helm over doubles of its dependencies that record each call. */
function build() {
  const steered: number[] = [];
  const throttled: number[] = [];
  const charted: string[] = [];
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
    has: (to) => {
      charted.push(`has ${to}`);
      return to === 'Kepler-442b';
    },
    plot: (to) => {
      charted.push(`plot ${to}`);
      return { to, heading: to === 'Kepler-442b' ? 42 : 0 };
    },
  };
  const helm = new HelmControl(thrusters, drive, charts);
  return { helm, steered, throttled, charted };
}

describe('HelmControl', () => {
  it("plots the course and steers the charts' heading in rad", () => {
    const { helm, steered, charted } = build();
    expect(helm.course('Kepler-442b')).toEqual({ tick: 3 });
    expect(charted).toEqual(['has Kepler-442b', 'plot Kepler-442b']);
    expect(steered).toEqual([0.7330382858376184]);
  });

  it.each(['Vega', 'constructor'])(
    'refuses a course to %s, which the charts do not hold',
    (to) => {
      const { helm, steered, charted } = build();
      const course = () => helm.course(to);
      expect(course).toThrow(BadCommandError);
      expect(course).toThrow(
        expect.objectContaining({
          code: 'MERIDIAN_BAD_COMMAND',
          reason: 'argument',
          system: 'helm',
          action: 'course',
          argument: 'to',
          expected: HELM_ACTIONS,
        }),
      );
      expect(charted).not.toContain(`plot ${to}`);
      expect(steered).toEqual([]);
    },
  );

  it('throttles the main drive for a burn', () => {
    const { helm, throttled, steered } = build();
    expect(helm.burn(0.5)).toEqual({ tick: 4 });
    expect(throttled).toEqual([0.5]);
    expect(steered).toEqual([]);
  });
});
