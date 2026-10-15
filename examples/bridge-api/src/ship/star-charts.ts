import type { Course, INavCharts, ISubspaceLink } from './contracts';

export class StarCharts implements INavCharts {
  /** Downloads the chart table over the subspace link. Does I/O, so a Worker builds it on the first request (spec 9.2). */
  static async download(link: ISubspaceLink): Promise<StarCharts> {
    return new StarCharts(await link.receive<Record<string, number>>('charts'));
  }
  constructor(private readonly headings: Readonly<Record<string, number>>) {}
  plot(to: string): Course {
    return { to, heading: this.headings[to] ?? 0 };
  }
}
