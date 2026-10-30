import { Token } from '@nexusdi/core';

/** A course to a star: its name and the heading the helm steers. */
export interface Course {
  readonly to: string;
  readonly heading: number;
}

/** The ship's star charts. */
export interface INavCharts {
  /** True when the charts hold a heading for `to`. A key of Object.prototype is no star. */
  has(to: string): boolean;
  /** The course to `to`. Throws UnchartedStarError for a star the charts do not hold. */
  plot(to: string): Course;
  /** The names of the stars the charts hold, in chart order. */
  stars(): readonly string[];
}

export const NAV_CHARTS = new Token<INavCharts>('NavCharts');
