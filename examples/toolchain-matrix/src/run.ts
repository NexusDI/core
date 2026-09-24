import {
  Nexus,
  type InjectionToken,
  type ModuleRef,
  type NexusGraph,
  type TraceEvent,
} from '@nexusdi/core';

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: string;
  }
}

export interface Handles {
  readonly bridge: InjectionToken<{ course(to: string): string }>;
  readonly router: InjectionToken<{ divert(): number }>;
  readonly mission: InjectionToken<string>;
}

export interface ScenarioOutput {
  readonly values: {
    readonly course: string;
    readonly divert: number;
    readonly mission: string;
  };
  readonly graph: NexusGraph;
  readonly trace: {
    readonly counts: Record<string, number>;
    readonly disposed: string[];
  };
  readonly log: string[];
}

/** Creates the container, resolves through every lifetime, opens and closes a scope, disposes, and reports. */
export async function runScenario(
  root: ModuleRef,
  handles: Handles,
  log: string[],
): Promise<ScenarioOutput> {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(root, {
    trace: (event) => events.push(event),
  });
  const course = ship.get(handles.bridge).course('Kepler-442b');
  const divert = ship.get(handles.router).divert();
  const shuttle = await ship.createScope({ request: { mission: 'survey-7' } });
  const mission = shuttle.get(handles.mission);
  await shuttle[Symbol.asyncDispose]();
  const graph = ship.graph();
  await ship[Symbol.asyncDispose]();

  const counts: Record<string, number> = {};
  for (const event of events)
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  const disposed = events.flatMap((event) =>
    event.type === 'dispose:instance' ? [event.token] : [],
  );
  return {
    values: { course, divert, mission },
    graph,
    trace: { counts, disposed },
    log,
  };
}
