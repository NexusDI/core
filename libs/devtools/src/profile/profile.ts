import {
  NEXUS_PLUGIN_API,
  type BlueprintView,
  type NexusPlugin,
  type PluginContext,
  type RunKind,
  type TraceEvent,
} from '@nexusdi/core';

import { DevtoolsError } from '../devtools-error.js';
import type {
  ProfileBuild,
  ProfileInit,
  ProfilePending,
  ProfileReport,
  ProfileRun,
} from './report.js';
import { liveSink } from './live.js';
import { stepsOf } from './steps.js';

export interface ProfileOptions {
  /** Draw spans live with console.timeStamp on Chromium 134 and later; elsewhere nothing. Default false. */
  readonly live?: boolean;
  /** Record createScope() and extend() runs as well. Default false: create and load only. */
  readonly scopes?: boolean;
  /** Runs kept; the oldest goes first and counts in report().dropped. Default 1000. */
  readonly maxRuns?: number;
  /** The DevTools track group for live spans. Default 'NexusDI'. */
  readonly trackGroup?: string;
}

/** A plugin that records where startup time goes. One per container. */
export interface Profiler extends NexusPlugin {
  /**
   * What it recorded so far, as plain JSON. An open run has ok: null and lists
   * its in-flight providers in pending. Throws NEXUS_DEVTOOLS_PROFILE_REUSED
   * when the profiler saw a second create.
   */
  report(): ProfileReport;
  /** Drops every recorded run. */
  clear(): void;
}

/** One run as the profiler accumulates it. */
export interface Recording {
  readonly id: number;
  kind: RunKind;
  scope: string | null;
  ok: boolean | null;
  startMs: number;
  durationMs: number | null;
  compile: ProfileRun['compile'];
  readonly builds: ProfileBuild[];
  readonly inits: ProfileInit[];
  readonly pending: Map<string, ProfilePending>;
}

export function runOf(rec: Recording): ProfileRun {
  const run = {
    id: rec.id,
    kind: rec.kind,
    scope: rec.scope,
    ok: rec.ok,
    startMs: rec.startMs,
    durationMs: rec.durationMs,
    compile: rec.compile,
    builds: [...rec.builds],
    inits: [...rec.inits],
    pending: rec.ok === null ? [...rec.pending.values()] : [],
  };
  return { ...run, steps: stepsOf(run) };
}

// The view is one frozen object per blueprint, so a graph built from it
// stays valid until a load or extend() gives the container a new blueprint.
const graphs = new WeakMap<
  BlueprintView,
  NonNullable<ProfileReport['graph']>
>();

/** The report's graph of `view`, built once per blueprint. */
function graphOf(view: BlueprintView): NonNullable<ProfileReport['graph']> {
  const known = graphs.get(view);
  if (known !== undefined) return known;
  const graph = buildGraph(view);
  graphs.set(view, graph);
  return graph;
}

function buildGraph(view: BlueprintView): NonNullable<ProfileReport['graph']> {
  const names = new Map(view.modules.map((m) => [m.id, m.name]));
  return {
    root: names.get(view.root) ?? view.root,
    providers: view.providers.map((p) => ({
      id: p.id,
      token: p.name,
      module: names.get(p.module) ?? p.module,
      lifetime: p.lifetime,
      kind: p.kind,
      inline: p.inline,
    })),
    edges: view.edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      ordersBuild: e.ordersBuild,
    })),
  };
}

const REUSED_TEXT =
  'not one container: this profile() recorded a second Nexus.create, so its report would mix two containers.\n  Fix: create one profile() per container: Nexus.create(Root, { plugins: [profile()] }).';

export function profile(options: ProfileOptions = {}): Profiler {
  const scopes = options.scopes ?? false;
  const live =
    options.live === true
      ? liveSink(options.trackGroup ?? 'NexusDI')
      : undefined;
  const maxRuns = options.maxRuns ?? 1000;
  const runs = new Map<number, Recording>();
  // Builds with no run wait here for the build that ran them (spec 6.2).
  const orphans = new Map<string, ProfileBuild[]>();
  const seenScopes = new Set<string>();
  let context: PluginContext | undefined;
  let dispose: ProfileReport['dispose'] = null;
  let dropped = 0;
  let creates = 0;
  let reused = false;

  const open = (
    id: number,
    kind: RunKind,
    scope: string | null,
    startMs: number,
  ): Recording => {
    const known = runs.get(id);
    if (known !== undefined) return known;
    if (runs.size >= maxRuns) {
      const [oldest] = runs.keys();
      if (oldest !== undefined) runs.delete(oldest);
      dropped++;
    }
    const rec: Recording = {
      id,
      kind,
      scope,
      ok: null,
      startMs,
      durationMs: null,
      compile: null,
      builds: [],
      inits: [],
      pending: new Map(),
    };
    runs.set(id, rec);
    return rec;
  };

  /** A scope's first run is its createScope; later ones are extend(). */
  const forScope = (
    id: number,
    scope: string | null,
    startMs: number,
  ): Recording => {
    if (scope === null || runs.has(id))
      return open(id, 'create', scope, startMs);
    const kind = seenScopes.has(scope) ? 'extend' : 'createScope';
    seenScopes.add(scope);
    return open(id, kind, scope, startMs);
  };

  const place = (
    build: ProfileBuild,
    run: number | null,
    parent: string | null,
  ): void => {
    const waiting = orphans.get(build.providerId);
    if (waiting !== undefined) orphans.delete(build.providerId);
    const group = waiting === undefined ? [build] : [...waiting, build];
    if (run !== null) {
      forScope(run, build.scope, build.startMs).builds.push(...group);
      return;
    }
    // An on-demand build after startup has neither, and is not recorded.
    if (parent === null) return;
    const list = orphans.get(parent);
    if (list === undefined) orphans.set(parent, group);
    else list.push(...group);
  };

  const closed = (id: number): boolean => {
    const rec = runs.get(id);
    return rec !== undefined && rec.ok !== null;
  };

  const observe = (event: TraceEvent): void => {
    if (reused) return;
    // A build, onInit or await of a run that already closed (an async build that
    // settled after its run failed) is ignored: not reuse, not recorded (plan choice 6).
    if (
      (event.type === 'construct' ||
        event.type === 'construct:failed' ||
        event.type === 'construct:await' ||
        event.type === 'init' ||
        event.type === 'init:failed' ||
        event.type === 'init:await') &&
      event.run !== null &&
      closed(event.run)
    )
      return;
    switch (event.type) {
      case 'compile': {
        if (event.run === null) return;
        if ((event.phase === 'create' && ++creates > 1) || closed(event.run)) {
          reused = true;
          return;
        }
        open(
          event.run,
          event.phase === 'create' ? 'create' : 'load',
          null,
          event.startMs,
        ).compile = {
          startMs: event.startMs,
          durationMs: event.durationMs,
          modules: event.modules,
          providers: event.providers,
          errors: event.errors,
        };
        return;
      }
      case 'construct':
      case 'construct:failed': {
        if (event.scope !== null && !scopes) return;
        const done = event.type === 'construct' ? event : null;
        place(
          {
            providerId: event.providerId,
            token: event.token,
            module: event.module,
            lifetime: event.lifetime,
            scope: event.scope,
            async: event.async,
            level: event.level,
            parent: event.parent,
            startMs: event.startMs,
            syncMs: done?.syncMs ?? null,
            awaitMs: done?.awaitMs ?? null,
            finishMs: done?.finishMs ?? null,
            durationMs: event.durationMs,
            failed: done === null,
          },
          event.run,
          event.parent,
        );
        if (event.run !== null)
          runs
            .get(event.run)
            ?.pending.delete(`construct ${event.scope} ${event.providerId}`);
        return;
      }
      case 'construct:await':
      case 'init:await': {
        if ((event.scope !== null && !scopes) || event.run === null) return;
        const what = event.type === 'construct:await' ? 'construct' : 'init';
        forScope(event.run, event.scope, event.startMs).pending.set(
          `${what} ${event.scope} ${event.providerId}`,
          {
            providerId: event.providerId,
            token: event.token,
            module: event.module,
            level: event.level,
            what,
            startMs: event.startMs,
            syncMs: event.syncMs,
          },
        );
        return;
      }
      case 'init':
      case 'init:failed': {
        if (event.run === null) return;
        const done = event.type === 'init' ? event : null;
        const rec = forScope(event.run, null, event.startMs);
        rec.inits.push({
          providerId: event.providerId,
          token: event.token,
          level: event.level,
          async: event.async,
          startMs: event.startMs,
          syncMs: done?.syncMs ?? null,
          awaitMs: done?.awaitMs ?? null,
          durationMs: event.durationMs,
          failed: done === null,
        });
        rec.pending.delete(`init ${event.scope} ${event.providerId}`);
        return;
      }
      case 'run': {
        if (event.scope !== null && !scopes) return;
        if (closed(event.run)) {
          reused = true;
          return;
        }
        const rec = open(event.run, event.kind, event.scope, event.startMs);
        // RunKind is open to core's additions (spec 5.2, P2), so the run's own kind wins over the inferred one.
        rec.kind = event.kind;
        rec.scope = event.scope;
        rec.ok = event.ok;
        rec.startMs = event.startMs;
        rec.durationMs = event.durationMs;
        rec.pending.clear();
        if (event.scope !== null) seenScopes.add(event.scope);
        // A run's spans are drawn when it closes, so the critical-path colour
        // is known (spec 6.5). An observe hook never throws (spec 6.3).
        if (live !== undefined)
          try {
            live(
              runOf(rec),
              context === undefined ? null : graphOf(context.blueprint()),
            );
          } catch {
            // The view or the sink failed; the app being measured does not.
          }
        return;
      }
      case 'dispose':
        dispose = {
          startMs: event.startMs,
          durationMs: event.durationMs,
          errors: event.errors,
        };
        return;
      default:
        // A type from a newer core or another package (spec 5.3).
        return;
    }
  };

  return {
    name: 'nexus:profile',
    apiVersion: NEXUS_PLUGIN_API,
    observe,
    setup(ctx) {
      context = ctx;
    },
    report() {
      if (reused)
        throw new DevtoolsError(
          { code: 'NEXUS_DEVTOOLS_PROFILE_REUSED', path: null },
          { text: REUSED_TEXT },
        );
      return {
        format: 'nexusdi-profile',
        version: 1,
        timeOrigin: performance.timeOrigin,
        reportedMs: performance.now(),
        runs: [...runs.values()].map(runOf),
        graph: context === undefined ? null : graphOf(context.blueprint()),
        dropped,
        dispose,
      };
    },
    clear() {
      runs.clear();
      orphans.clear();
      dropped = 0;
      dispose = null;
    },
  };
}
