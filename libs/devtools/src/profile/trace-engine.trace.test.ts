import { readFileSync, writeFileSync } from 'node:fs';

import * as Trace from '@paulirish/trace_engine';
import { describe, expect, it } from 'vitest';

import {
  parseProfileReport,
  toChromeTrace,
  toPerfettoTrace,
  type CpuProfile,
  type TraceFile,
} from '../index.js';
import { spansOf } from './spans.js';

const at = (name: string): URL =>
  new URL(`../../test-fixtures/profile/${name}`, import.meta.url);

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(at(name), 'utf8'));

/** The trace as the DevTools trace engine, the one DevTools ships, reads it. */
async function model(file: TraceFile) {
  const engine = Trace.TraceModel.Model.createWithAllHandlers();
  await engine.parse(file.traceEvents as never);
  const parsed = engine.parsedTrace();
  if (parsed === null) throw new Error('the engine parsed nothing');
  return parsed.data;
}

type Event = Readonly<Record<string, unknown>>;

/** The track entries the file writes: each non-marker b/e pair, by track. */
function spansByTrack(
  file: TraceFile,
): Map<string, [string, number, number][]> {
  const ends = new Map<string, number>();
  for (const e of file.traceEvents)
    if (e['ph'] === 'e')
      ends.set((e['id2'] as { local: string }).local, e['ts'] as number);
  const byTrack = new Map<string, [string, number, number][]>();
  for (const e of file.traceEvents as readonly Event[]) {
    if (e['ph'] !== 'b') continue;
    const { devtools } = JSON.parse(
      (e['args'] as { detail: string }).detail,
    ) as {
      devtools: { dataType: string; track?: string };
    };
    if (devtools.dataType === 'marker' || devtools.track === undefined)
      continue;
    const start = e['ts'] as number;
    const end = ends.get((e['id2'] as { local: string }).local) ?? start;
    const list = byTrack.get(devtools.track) ?? [];
    list.push([e['name'] as string, start, end - start]);
    byTrack.set(devtools.track, list);
  }
  return byTrack;
}

const meridian = parseProfileReport(fixture('meridian.report.json'));
const partial = parseProfileReport(fixture('partial.report.json'));
const failed = parseProfileReport(fixture('failed.report.json'));

/** The golden track list: Runs, Steps, then each run's level tracks and onInit. */
const TRACKS = [
  'Runs',
  'Steps',
  'create · level 0',
  'create · level 1',
  'create · level 2',
  'create · level 3',
  'create · onInit',
  'load 1 · level 0',
];

describe('the Chrome layout, as the DevTools trace engine reads it', () => {
  it('finds the main frame (the tripwire for TracingStartedInBrowser)', async () => {
    expect((await model(toChromeTrace(meridian))).Meta.mainFrameId).toBe('F1');
  });

  it('draws one NexusDI group with the golden tracks and entry counts', async () => {
    const file = toChromeTrace(meridian);
    const groups = (await model(file)).ExtensionTraceData.extensionTrackData;
    expect(groups.map((g) => g.name)).toEqual(['NexusDI']);
    const tracks = Object.entries(groups[0]?.entriesByTrack ?? {});
    expect(tracks.map(([name]) => name)).toEqual(TRACKS);
    const written = spansByTrack(file);
    expect(
      Object.fromEntries(tracks.map(([name, list]) => [name, list.length])),
    ).toEqual(
      Object.fromEntries(
        [...written].map(([name, list]) => [name, list.length]),
      ),
    );
  });

  it("keeps every entry's name, start and duration in µs", async () => {
    const file = toChromeTrace(meridian);
    const groups = (await model(file)).ExtensionTraceData.extensionTrackData;
    const read = Object.entries(groups[0]?.entriesByTrack ?? {}).map(
      ([track, list]) => [
        track,
        list
          .map((entry) => [entry.name, entry.ts, entry.dur] as const)
          .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])),
      ],
    );
    // The fixture's own spans, in µs, independent of the file's events.
    const us = (ms: number) => Math.round(ms * 1000);
    const expected = new Map<string, (readonly [string, number, number])[]>();
    for (const run of meridian.runs)
      for (const span of spansOf(run, meridian.graph, meridian.reportedMs)) {
        if (span.marker) continue;
        const list = expected.get(span.track) ?? [];
        list.push([
          span.name,
          us(span.startMs),
          us(span.endMs) - us(span.startMs),
        ]);
        expected.set(span.track, list);
      }
    expect(read).toEqual(
      [...expected].map(([track, list]) => [
        track,
        [...list].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])),
      ]),
    );
  });

  it('merges the CPU profile into pid 1, its samples inside the run', async () => {
    const profile = fixture('node.cpuprofile') as CpuProfile;
    const run = meridian.runs[0];
    if (run === undefined || run.durationMs === null)
      throw new Error('the fixture has no settled create run');
    const offsetMs = profile.startTime / 1000 - run.startMs;
    const data = await model(
      toChromeTrace(meridian, { cpuProfile: { profile, offsetMs } }),
    );
    expect(data.Samples.profilesInProcess.size).toBe(1);
    // DevTools draws the flame chart under Main: the renderer's pid 1, tid 1.
    expect([...data.Samples.profilesInProcess.keys()]).toEqual([1]);
    expect([
      ...(data.Samples.profilesInProcess.get(1 as never)?.keys() ?? []),
    ]).toEqual([1]);
    const [threads] = [...data.Samples.profilesInProcess.values()];
    const [samples] = [...(threads?.values() ?? [])];
    const times = samples?.parsedProfile.timestamps ?? [];
    expect(times.length).toBeGreaterThan(0);
    // The engine keeps sample times in ms.
    const startMs = run.startMs + offsetMs;
    const endMs = run.startMs + run.durationMs + offsetMs;
    for (const ts of [times[0], times[times.length - 1]]) {
      expect(ts).toBeGreaterThanOrEqual(startMs);
      expect(ts).toBeLessThanOrEqual(endMs);
    }
  });

  it('matches the committed golden file', () => {
    const text = `${JSON.stringify(toChromeTrace(meridian), null, 2)}\n`;
    // UPDATE=1 rewrites the golden file; review its diff before committing.
    if (process.env['UPDATE'])
      writeFileSync(at('chrome-trace.golden.json'), text);
    expect(text).toBe(readFileSync(at('chrome-trace.golden.json'), 'utf8'));
  });

  it('draws the failed and partial fixtures', async () => {
    for (const report of [failed, partial])
      expect((await model(toChromeTrace(report))).Meta.mainFrameId).toBe('F1');
  });

  it('gives a partial report with no graph the bare frame URL and no critical path', () => {
    const file = toChromeTrace(partial);
    const started = file.traceEvents.find(
      (e) => e['name'] === 'TracingStartedInBrowser',
    );
    expect(
      (started?.['args'] as { data: { frames: { url: string }[] } }).data
        .frames[0]?.url,
    ).toBe('nexusdi://profile');
    const colours = (file.traceEvents as readonly Event[])
      .filter((e) => e['ph'] === 'b')
      .map(
        (e) =>
          (
            JSON.parse((e['args'] as { detail: string }).detail) as {
              devtools: { color: string };
            }
          ).devtools.color,
      );
    expect(colours).not.toContain('primary-dark');
    expect(colours).toContain('error');
  });
});

describe('the Perfetto file', () => {
  it('nests slices per tid, pairs every flow and names every tid', () => {
    const events = toPerfettoTrace(meridian).traceEvents as readonly Event[];
    const named = new Set(
      events
        .filter((e) => e['name'] === 'thread_name')
        .map((e) => `${e['pid']} ${e['tid']}`),
    );
    const slices = events.filter((e) => e['ph'] === 'X');
    for (const e of slices)
      expect(named.has(`${e['pid']} ${e['tid']}`)).toBe(true);
    // On each tid, two slices that overlap nest: one holds the other.
    const byTid = new Map<string, Event[]>();
    for (const e of slices) {
      const key = `${e['pid']} ${e['tid']}`;
      byTid.set(key, [...(byTid.get(key) ?? []), e]);
    }
    const start = (e: Event) => e['ts'] as number;
    const end = (e: Event) => start(e) + (e['dur'] as number);
    const holds = (a: Event, b: Event) =>
      start(a) <= start(b) && end(b) <= end(a);
    for (const list of byTid.values())
      for (const a of list)
        for (const b of list)
          if (a !== b && start(a) < end(b) && start(b) < end(a))
            expect(holds(a, b) || holds(b, a)).toBe(true);
    const ids = (ph: string) =>
      events
        .filter((e) => e['ph'] === ph)
        .map((e) => e['id'])
        .sort();
    expect(ids('s')).toEqual(ids('f'));
  });
});
