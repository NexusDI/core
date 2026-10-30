import type { Nexus, NexusPlugin } from '@nexusdi/core';
import type * as DevtoolsModule from '@nexusdi/devtools';
import { shipNotes } from '@nexusdi/meridian-systems';

import { blackBox, type BlackBox } from '../ship/black-box.plugin';
import type { BridgeOptions } from './options';

/** The part of `@nexusdi/devtools` the introspection routes use. */
export type Devtools = Pick<
  typeof DevtoolsModule,
  'criticalPath' | 'devtools' | 'graph' | 'profile' | 'profileTable'
>;

/** What `GET /profile` answers: the startup table and the critical path of the create run. */
export interface ProfileAnswer {
  readonly table: string;
  readonly criticalPath: ReturnType<Devtools['criticalPath']>;
}

/** The devtools and profiler plugins and the routes that read the ship they watched. */
export interface Introspection {
  /**
   * Register these when the ship is created: graph() needs devtools(), and
   * the profiler sees only the startup that follows its registration.
   */
  readonly plugins: NexusPlugin[];
  /** The black box among `plugins`: this ship's recorder, shared with no other. */
  readonly box: BlackBox;
  /** The `graph` and `profile` options of a bridge over `ship`. */
  options(
    ship: Nexus | Promise<Nexus>,
  ): Required<Pick<BridgeOptions, 'graph' | 'profile'>>;
}

/**
 * The devtools module is a parameter, so a Worker loads it with
 * `await import('@nexusdi/devtools')` only when SHIP_INTROSPECTION is on.
 */
export function introspect(devtools: Devtools): Introspection {
  const profiler = devtools.profile();
  // The recorder serves diagnostics, so it joins the ship with the other
  // introspection plugins and a ship with the flag off carries none of it.
  const box = blackBox();
  return {
    plugins: [
      devtools.devtools({ annotate: [shipNotes] }),
      profiler,
      box.plugin,
    ],
    box,
    options: (ship) => ({
      graph: async () => devtools.graph(await ship),
      profile: () => {
        const report = profiler.report();
        const [create] = report.runs;
        return {
          table: devtools.profileTable(report),
          criticalPath:
            create === undefined
              ? null
              : devtools.criticalPath(report, create.id),
        };
      },
    }),
  };
}
