import { Token } from '@nexusdi/core';

/** A course to a star: its name and the heading the helm steers. */
export interface Course {
  readonly to: string;
  readonly heading: number;
}

/** The ship's star charts. */
export interface INavCharts {
  /** The course to `to`, or heading 0 for a star the charts do not hold. */
  plot(to: string): Course;
}

export const NAV_CHARTS = new Token<INavCharts>('NavCharts');
