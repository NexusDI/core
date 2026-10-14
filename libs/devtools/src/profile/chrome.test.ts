import { describe, expect, it } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { toChromeTrace } from './chrome.js';

const r = report([
  build({ providerId: 'q', token: 'Quote"\\·Core', startMs: 1, durationMs: 2 }),
]);

describe('toChromeTrace', () => {
  it('starts with the metadata and the TracingStartedInBrowser frame DevTools needs', () => {
    const { traceEvents } = toChromeTrace(r);
    const started = defined(
      traceEvents.find((e) => e['name'] === 'TracingStartedInBrowser'),
    );
    expect(started).toMatchObject({
      pid: 2,
      tid: 2,
      cat: 'disabled-by-default-devtools.timeline',
      ts: 0,
    });
    expect(
      (
        started['args'] as {
          data: { frames: { frame: string; url: string }[] };
        }
      ).data.frames[0],
    ).toMatchObject({
      frame: 'F1',
      url: 'nexusdi://profile/Meridian',
      isInPrimaryMainFrame: true,
      isOutermostMainFrame: true,
      processId: 1,
    });
  });

  it('writes each span as a b/e pair with a JSON detail that stays valid with quotes and backslashes', () => {
    const { traceEvents } = toChromeTrace(r, { trackGroup: 'Ship' });
    const begin = defined(
      traceEvents.find((e) => e['ph'] === 'b' && e['name'] === 'Quote"\\·Core'),
    );
    const detail = JSON.parse((begin['args'] as { detail: string }).detail) as {
      devtools: { track: string; trackGroup: string };
    };
    expect(detail.devtools).toMatchObject({
      track: 'create · level 0',
      trackGroup: 'Ship',
    });
    expect(begin['ts']).toBe(1000);
    const end = defined(
      traceEvents.find(
        (e) =>
          e['ph'] === 'e' &&
          (e['id2'] as { local: string }).local ===
            (begin['id2'] as { local: string }).local,
      ),
    );
    expect(end['ts']).toBe(3000);
  });

  it('merges a CPU profile and shifts every span by offsetMs', () => {
    const profile = {
      nodes: [
        {
          id: 1,
          callFrame: {
            functionName: '(root)',
            scriptId: '0',
            url: '',
            lineNumber: -1,
            columnNumber: -1,
          },
          children: [2],
        },
        {
          id: 2,
          callFrame: {
            functionName: 'build',
            scriptId: '1',
            url: 'file:///a.js',
            lineNumber: 1,
            columnNumber: 1,
          },
        },
      ],
      startTime: 500_000,
      endTime: 520_000,
      samples: [2, 2],
      timeDeltas: [0, 100],
    };
    const { traceEvents } = toChromeTrace(r, {
      cpuProfile: { profile, offsetMs: 500 },
    });
    const chunk = defined(
      traceEvents.find((e) => e['name'] === 'ProfileChunk'),
    );
    const nodes = (
      chunk['args'] as {
        data: { cpuProfile: { nodes: { id: number; parent?: number }[] } };
      }
    ).data.cpuProfile.nodes;
    expect(nodes.find((n) => n.id === 2)?.parent).toBe(1);
    expect(
      defined(
        traceEvents.find(
          (e) => e['ph'] === 'b' && e['name'] === 'Quote"\\·Core',
        ),
      )['ts'],
    ).toBe(501_000);
  });

  it('writes no NaN for an empty report', () => {
    expect(JSON.stringify(toChromeTrace(report([])))).not.toMatch(
      /NaN|"ts":null|"dur":null/,
    );
  });
  it('names no root in the frame URL when the report has no graph', () => {
    const { traceEvents } = toChromeTrace({ ...r, graph: null });
    const started = defined(
      traceEvents.find((e) => e['name'] === 'TracingStartedInBrowser'),
    );
    expect(
      (started['args'] as { data: { frames: { url: string }[] } }).data
        .frames[0]?.url,
    ).toBe('nexusdi://profile');
  });
});
