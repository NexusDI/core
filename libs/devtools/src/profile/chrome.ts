import { least } from './extent.js';
import type { CpuProfile, ProfileReport, TraceFile } from './report.js';
import { spansOf } from './spans.js';

type Event = Readonly<Record<string, unknown>>;

/** The node tree as a ProfileChunk carries it: each node names its parent. */
function withParents(profile: CpuProfile): Event[] {
  const parents = new Map<number, number>();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id);
  return profile.nodes.map((n) => ({
    id: n.id,
    callFrame: n.callFrame,
    ...(parents.has(n.id) ? { parent: parents.get(n.id) } : {}),
  }));
}

/**
 * The report as a Chrome DevTools Performance trace (spec 7.3): one
 * NexusDI track group of user-timing spans, and with `cpuProfile` the JS
 * flame chart under Main. The layout is Chrome's undocumented format; the
 * golden test in vitest.trace.config.ts holds it.
 */
export function toChromeTrace(
  report: ProfileReport,
  options: {
    readonly cpuProfile?: {
      readonly profile: CpuProfile;
      readonly offsetMs: number;
    };
    readonly trackGroup?: string;
  } = {},
): TraceFile {
  const trackGroup = options.trackGroup ?? 'NexusDI';
  const offset = options.cpuProfile?.offsetMs ?? 0;
  const us = (msValue: number): number => Math.round((msValue + offset) * 1000);
  const spans = report.runs.flatMap((run) =>
    spansOf(run, report.graph, report.reportedMs),
  );
  const cpu = options.cpuProfile?.profile;
  const first = least(
    spans.map((s) => us(s.startMs)),
    cpu === undefined ? Infinity : cpu.startTime,
  );
  const origin = Number.isFinite(first) ? first : 0;

  const events: Event[] = [
    {
      name: 'process_name',
      ph: 'M',
      pid: 1,
      tid: 1,
      ts: 0,
      args: { name: 'Renderer' },
    },
    {
      name: 'thread_name',
      ph: 'M',
      pid: 1,
      tid: 1,
      ts: 0,
      args: { name: 'CrRendererMain' },
    },
    {
      name: 'process_name',
      ph: 'M',
      pid: 2,
      tid: 2,
      ts: 0,
      args: { name: 'Browser' },
    },
    {
      name: 'thread_name',
      ph: 'M',
      pid: 2,
      tid: 2,
      ts: 0,
      args: { name: 'CrBrowserMain' },
    },
    {
      name: 'TracingStartedInBrowser',
      ph: 'I',
      s: 't',
      cat: 'disabled-by-default-devtools.timeline',
      pid: 2,
      tid: 2,
      ts: Math.max(0, origin - 1000),
      args: {
        data: {
          frameTreeNodeId: 1,
          persistentIds: true,
          frames: [
            {
              frame: 'F1',
              name: '',
              processId: 1,
              isInPrimaryMainFrame: true,
              isOutermostMainFrame: true,
              url:
                report.graph === null
                  ? 'nexusdi://profile'
                  : `nexusdi://profile/${report.graph.root}`,
            },
          ],
        },
      },
    },
  ];

  spans.forEach((s, i) => {
    const id2 = { local: `0x${(i + 1).toString(16)}` };
    const detail = JSON.stringify({
      devtools: {
        dataType: s.marker ? 'marker' : 'track-entry',
        ...(s.marker ? {} : { track: s.track, trackGroup }),
        color: s.color,
        properties: s.properties,
        tooltipText: s.tooltip,
      },
    });
    events.push(
      {
        name: s.name,
        cat: 'blink.user_timing',
        ph: 'b',
        id2,
        pid: 1,
        tid: 1,
        ts: us(s.startMs),
        args: { detail },
      },
      {
        name: s.name,
        cat: 'blink.user_timing',
        ph: 'e',
        id2,
        pid: 1,
        tid: 1,
        ts: us(s.endMs),
        args: {},
      },
    );
  });

  if (cpu !== undefined) {
    const cat = 'disabled-by-default-v8.cpu_profiler';
    events.push(
      {
        name: 'Profile',
        ph: 'P',
        id: '0x1',
        cat,
        pid: 1,
        tid: 1,
        ts: cpu.startTime,
        args: { data: { startTime: cpu.startTime } },
      },
      {
        name: 'ProfileChunk',
        ph: 'P',
        id: '0x1',
        cat,
        pid: 1,
        tid: 1,
        ts: cpu.startTime,
        args: {
          data: {
            cpuProfile: { nodes: withParents(cpu), samples: cpu.samples },
            timeDeltas: cpu.timeDeltas,
          },
        },
      },
    );
  }
  return { traceEvents: events, metadata: { 'nexusdi-profile': 1 } };
}
