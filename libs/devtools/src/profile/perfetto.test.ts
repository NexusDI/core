import { describe, expect, it } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { toPerfettoTrace } from './perfetto.js';

const r = report(
  [
    build({
      providerId: 'r',
      token: 'ReactorCore',
      startMs: 1,
      durationMs: 1,
      syncMs: 1,
      finishMs: 0,
    }),
    build({
      providerId: 'c',
      token: 'ShipComputer',
      startMs: 2,
      durationMs: 3,
      syncMs: 2,
      finishMs: 1,
      level: 1,
    }),
  ],
  [['c', 'r']],
);

type Ev = Record<string, unknown>;

describe('toPerfettoTrace', () => {
  const { traceEvents, metadata, displayTimeUnit } = toPerfettoTrace(r);
  const evs = traceEvents as Ev[];

  it('gives each run a pid, the steps tid 1 and each provider a named, sorted tid', () => {
    expect(evs.find((e) => e['name'] === 'process_name')).toMatchObject({
      pid: 1,
      args: { name: 'nexusdi create (run 0)' },
    });
    const threads = evs
      .filter((e) => e['name'] === 'thread_name')
      .map((e) => (e['args'] as { name: string }).name);
    expect(threads).toEqual(['steps', 'ReactorCore', 'ShipComputer']);
    const sorts = evs
      .filter((e) => e['name'] === 'thread_sort_index')
      .map((e) => (e['args'] as { sort_index: number }).sort_index);
    expect(sorts).toEqual([0, 1, 10001]);
  });

  it('nests the sync and finish slices inside the provider slice on its tid', () => {
    const tid = defined(
      evs.find((e) => e['name'] === 'ShipComputer' && e['ph'] === 'X'),
    )['tid'];
    const slices = evs.filter((e) => e['ph'] === 'X' && e['tid'] === tid);
    const [first, ...children] = slices;
    const parent = defined(first);
    for (const child of children) {
      expect(child['ts'] as number).toBeGreaterThanOrEqual(
        parent['ts'] as number,
      );
      expect(
        (child['ts'] as number) + (child['dur'] as number),
      ).toBeLessThanOrEqual(
        (parent['ts'] as number) + (parent['dur'] as number),
      );
    }
  });

  it('pairs every flow start with one finish, and names the barrier-path edge critical', () => {
    const starts = evs.filter((e) => e['ph'] === 's');
    const finishes = evs.filter((e) => e['ph'] === 'f');
    expect(starts.map((e) => e['id']).sort()).toEqual(
      finishes.map((e) => e['id']).sort(),
    );
    expect(starts.map((e) => e['name'])).toEqual(['critical']);
    expect(finishes[0]).toMatchObject({ bp: 'e' });
  });

  it('carries the profile metadata in ms', () => {
    expect(metadata).toMatchObject({ 'nexusdi-profile': 1 });
    expect(displayTimeUnit).toBe('ms');
  });
});

describe('toPerfettoTrace edges and slices', () => {
  it('draws no flow for an edge that orders no build, and names an edge off the path dep', () => {
    const fleet = report(
      [
        build({ providerId: 'a', token: 'A', startMs: 0, durationMs: 1 }),
        build({ providerId: 'b', token: 'B', startMs: 0, durationMs: 2 }),
        build({
          providerId: 'c',
          token: 'C',
          startMs: 2,
          durationMs: 1,
          level: 1,
        }),
      ],
      [
        ['c', 'a'],
        ['c', 'b'],
      ],
    );
    const graph = defined(fleet.graph ?? undefined);
    const lazy = {
      ...fleet,
      graph: {
        ...graph,
        edges: graph.edges.map((e) =>
          e.to === 'a' ? { ...e, kind: 'lazy', ordersBuild: false } : e,
        ),
      },
    };
    const names = (traceEvents: readonly Ev[]) =>
      traceEvents.filter((e) => e['ph'] === 's').map((e) => e['name']);
    expect(names(toPerfettoTrace(fleet).traceEvents as Ev[])).toEqual([
      'dep',
      'critical',
    ]);
    expect(names(toPerfettoTrace(lazy).traceEvents as Ev[])).toEqual([
      'critical',
    ]);
  });

  it("puts an onInit on its provider's tid", () => {
    const withInit = report(
      [build({ providerId: 'r', token: 'Reactor', startMs: 0, durationMs: 1 })],
      [],
      {
        inits: [
          {
            providerId: 'r',
            token: 'Reactor',
            level: 0,
            async: false,
            startMs: 2,
            syncMs: 1,
            awaitMs: null,
            durationMs: 1,
            failed: false,
          },
        ],
      },
    );
    const evs = toPerfettoTrace(withInit).traceEvents as Ev[];
    const tid = defined(evs.find((e) => e['name'] === 'Reactor'))['tid'];
    expect(evs.find((e) => e['name'] === 'onInit')).toMatchObject({
      tid,
      ts: 2000,
      dur: 1000,
    });
  });

  it('keeps a child slice inside its parent when the ends round apart', () => {
    // A 1 µs build whose finish is its last 0.5 µs. Rounding the finish's
    // start (0.5 µs) and length (0.5 µs) apart would end it at 2 µs, past
    // its parent's end at 1 µs.
    const tight = report([
      build({
        providerId: 't',
        token: 'Tight',
        startMs: 0,
        durationMs: 0.001,
        syncMs: 0.0005,
        finishMs: 0.0005,
      }),
    ]);
    const evs = (toPerfettoTrace(tight).traceEvents as Ev[]).filter(
      (e) => e['ph'] === 'X' && e['tid'] === 2,
    );
    const [first, ...children] = evs;
    const parent = defined(first);
    const end = (e: Ev) => (e['ts'] as number) + (e['dur'] as number);
    for (const child of children)
      expect(end(child)).toBeLessThanOrEqual(end(parent));
  });
});
