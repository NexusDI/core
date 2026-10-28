import charts from '../../../deck/charts.json' with { type: 'json' };
import { RelayError } from '../../errors';
import type { ISubspaceLink } from '../comms/contracts';

import type { Course, INavCharts } from './contracts';

// The `./charts` entry carries the token and its types beside the class, so
// a browser bundle imports this one file and none of the simulation.
export { NAV_CHARTS, type Course, type INavCharts } from './contracts';

/** The chart table the ship carries: a heading for each star it charts. */
export const BUNDLED_CHARTS: Readonly<Record<string, number>> = charts;

/**
 * The relay's answer as a chart table, or a `RelayError` when it is no plain
 * object of finite headings. A name that `Object.prototype` holds, such as
 * `__proto__` or `constructor`, is no star, so it fails the check too.
 */
function readCharts(answer: unknown): Record<string, number> {
  const malformed = () =>
    new RelayError({
      channel: 'charts',
      reason: 'malformed',
      expected: 'a JSON object that maps each star name to a finite heading',
    });
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    throw malformed();
  }
  const table: Record<string, number> = Object.create(null);
  for (const [name, heading] of Object.entries(answer)) {
    if (name in Object.prototype) throw malformed();
    if (typeof heading !== 'number' || !Number.isFinite(heading)) {
      throw malformed();
    }
    table[name] = heading;
  }
  return table;
}

/** The ship's star charts over a table of headings, in degrees, by star name. */
export class StarCharts implements INavCharts {
  /** Downloads the chart table over the subspace link. Does I/O, so a Worker builds it on the first request, since a Worker allows no I/O in the global scope. */
  static async download(link: ISubspaceLink): Promise<StarCharts> {
    return new StarCharts(readCharts(await link.receive<unknown>('charts')));
  }

  constructor(private readonly headings: Readonly<Record<string, number>>) {}

  /** The bundled table and the downloaded one go through this check, so an entry that is not a finite number reads as uncharted. */
  has(to: string): boolean {
    return (
      Object.hasOwn(this.headings, to) && Number.isFinite(this.headings[to])
    );
  }

  plot(to: string): Course {
    return { to, heading: this.has(to) ? this.headings[to] : 0 };
  }

  stars(): readonly string[] {
    return Object.keys(this.headings).filter((name) => this.has(name));
  }
}
