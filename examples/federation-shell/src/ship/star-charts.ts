import type { Course, INavCharts } from '@nexusdi/federation-contracts';

import headings from './charts.json';

/** The shell's star charts: the bundled heading table. */
export class StarCharts implements INavCharts {
  plot(to: string): Course {
    return { to, heading: (headings as Record<string, number>)[to] ?? 0 };
  }
}
