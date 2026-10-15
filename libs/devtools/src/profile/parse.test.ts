import { describe, expect, it } from 'vitest';

import { isNexusError } from '@nexusdi/core';

import { thrown } from '../../test-support/catch.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { parseProfileReport } from './parse.js';

const good = report([
  build({ providerId: 'a', token: 'A', startMs: 0, durationMs: 1 }),
]);

function pathOf(value: unknown): string | null {
  const error = thrown(() => parseProfileReport(value));
  if (!isNexusError(error, 'NEXUS_DEVTOOLS_PROFILE_INVALID')) throw error;
  return error.path;
}

describe('parseProfileReport', () => {
  it('returns a report that JSON wrote', () => {
    expect(parseProfileReport(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it('names the first bad field', () => {
    const bad = JSON.parse(JSON.stringify(good));
    delete bad.runs[0].builds[0].startMs;
    expect(pathOf(bad)).toBe('runs[0].builds[0].startMs');
  });

  it('rejects another format, another version and a value that is no object', () => {
    expect(pathOf({ ...good, format: 'nexusdi-graph' })).toBe('format');
    expect(pathOf({ ...good, version: 2 })).toBe('version');
    expect(pathOf(42)).toBe('(root)');
  });

  it('reads a run kind and a lifetime it does not know as given', () => {
    const newer = JSON.parse(JSON.stringify(good));
    newer.runs[0].kind = 'fork';
    newer.runs[0].builds[0].lifetime = 'pooled';
    expect(parseProfileReport(newer)).toMatchObject({
      runs: [{ kind: 'fork', builds: [{ lifetime: 'pooled' }] }],
    });
  });

  it('names a list field that holds no list', () => {
    expect(pathOf({ ...good, runs: {} })).toBe('runs');
  });

  it('returns the value it checked, an unknown field included', () => {
    const value = { ...JSON.parse(JSON.stringify(good)), notes: 'kept' };
    expect(parseProfileReport(value)).toBe(value);
    expect(parseProfileReport(value)).toMatchObject({ notes: 'kept' });
  });

  it('rejects a time that is not a finite number', () => {
    expect(pathOf({ ...good, reportedMs: Number.NaN })).toBe('reportedMs');
  });
  it('reads an environment when the report carries one, and checks its fields', () => {
    const recorded = {
      ...JSON.parse(JSON.stringify(good)),
      environment: { node: '24.20.0', core: '0.4.0' },
    };
    expect(parseProfileReport(recorded).environment).toEqual({
      node: '24.20.0',
      core: '0.4.0',
    });
    expect(
      pathOf({ ...recorded, environment: { node: 24, core: '0.4.0' } }),
    ).toBe('environment.node');
    expect(
      parseProfileReport(JSON.parse(JSON.stringify(good))).environment,
    ).toBe(undefined);
  });
});
