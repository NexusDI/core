/** A plotted course: the destination and the heading to it. */
export interface Course {
  readonly to: string;
  readonly heading: number;
}

/** The star charts the shell's `Tactical` provides to every station. */
export interface INavCharts {
  plot(to: string): Course;
}
