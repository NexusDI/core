// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildBenchmarkData,
  gitCommit,
  readBenchmarkData,
} from './benchmark-data.mjs';
import { lookup, unitOf } from './benchmark-path.mjs';

const FIXTURE = join(import.meta.dirname, '__fixtures__/benchmark-results');
const LIBRARIES = JSON.parse(
  readFileSync(join(FIXTURE, 'libraries.json'), 'utf8'),
).libraries;
const build = (results = FIXTURE, coreVersion = '0.4.0-rc.0') =>
  buildBenchmarkData({
    results,
    libraries: LIBRARIES,
    coreVersion,
    commitOf: () => 'abc1234',
  });

const copies = [];
function copy(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'benchmark-results-'));
  copies.push(dir);
  cpSync(FIXTURE, dir, { recursive: true });
  edit(dir);
  return dir;
}
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true });
});

describe('buildBenchmarkData', () => {
  it('indexes every family by the paths of benchmarks spec section 4.9', () => {
    const data = build();
    const at = (path, run) => lookup(data, path, run).value;
    expect(at('size.nexusdi.plain.esbuild.gzip')).toBe(18991);
    expect(at('emit.tsyringe.decorated.metadataCalls')).toBe(200);
    expect(at('matrix.tsyringe.decorated.esbuild.outcome')).toBe(
      'wrong-instance',
    );
    expect(at('probes.needle-di.decorated.cycle.detectedAt')).toBe(
      'first-resolve',
    );
    expect(at('timings.nexusdi.plain.cold-start.median')).toBe(43000000);
    expect(at('timings.tsyringe.decorated.cold-start.vsNexus.median')).toBe(
      0.83,
    );
    expect(at('build.nexusdi.plain.tsc.median')).toBe(2100);
    expect(at('build.nexusdi.plain.esbuild.meridian-8.mad')).toBe(4);
    expect(at('build.headline.tsyringe.vsNexus.high')).toBe(0.52);
  });

  it('reads the newest timings file by name, and another through run', () => {
    const data = build();
    expect(data.newest).toBe('2026-10-01-2222222');
    expect(
      lookup(
        data,
        'timings.nexusdi.plain.cold-start.median',
        '2026-09-28-1111111',
      ).value,
    ).toBe(47000000);
  });

  it('carries the documented variant and the measured core version per library', () => {
    const { libraries } = build();
    expect(libraries.nexusdi).toMatchObject({
      version: '0.4.0-rc.0',
      documented: 'plain',
    });
    expect(libraries['needle-di']?.notApplicable.transient).toBe(
      'needle-di documents singletons only.',
    );
  });

  it('rejects a schema version src/schema.ts does not declare', () => {
    const results = copy((dir) => {
      const file = join(dir, 'size.json');
      const size = JSON.parse(readFileSync(file, 'utf8'));
      writeFileSync(file, JSON.stringify({ ...size, schema: 2 }));
    });
    expect(() => build(results)).toThrow(
      'benchmarks/results/size.json: size.schema: expected 1.',
    );
  });

  it('fails with the fix when no timings file exists', () => {
    const results = copy((dir) =>
      rmSync(join(dir, 'timings'), { recursive: true }),
    );
    expect(() => build(results)).toThrow(
      'benchmarks/results/timings/ holds no <YYYY-MM-DD>-<sha7>.json file. Merge the results pull request',
    );
  });

  it('fails when the results measured another release line', () => {
    expect(() => build(FIXTURE, '0.5.0')).toThrow(
      'benchmarks/results/matrix.json measured @nexusdi/core 0.4.0-rc.0, and libs/core/package.json is 0.5.0.',
    );
    expect(build(FIXTURE, '0.4.0-rc.1').core).toBe('0.4.0-rc.1');
  });
});

describe('lookup', () => {
  const data = build();

  it('fails a path the data does not hold, naming the missing key', () => {
    expect(() => lookup(data, 'size.nexusdi.plain.esbuild.brotli')).toThrow(
      `"size.nexusdi.plain.esbuild.brotli": benchmarks/results holds no 'size.nexusdi.plain.esbuild.brotli'.`,
    );
    expect(() => lookup(data, 'speed.nexusdi')).toThrow(
      "starts with 'speed', which is no results family",
    );
    expect(() => lookup(data, 'size.nexusdi.plain.esbuild')).toThrow(
      'names a record that holds several figures. Add one of its fields: minified, gzip, polyfillGzip, runs.',
    );
    expect(() =>
      lookup(data, 'timings.nexusdi.plain.ready.median', '2020-01-01-0000000'),
    ).toThrow('run "2020-01-01-0000000" names no file');
  });

  it('gives each path its unit', () => {
    expect(unitOf('size.nexusdi.plain.esbuild.gzip')).toBe('bytes');
    expect(unitOf('timings.nexusdi.plain.ready.median')).toBe('ns');
    expect(unitOf('build.nexusdi.plain.tsc.median')).toBe('ms');
    expect(unitOf('timings.tsyringe.decorated.ready.vsNexus.low')).toBe(
      'ratio',
    );
    expect(unitOf('emit.nexusdi.plain.importsKept')).toBe('plain');
  });
});

describe('the workspace results', () => {
  // readBenchmarkData runs `git log` per results file. The release job checks
  // out with `filter: tree:0`, so each call fetches trees from origin and the
  // test takes longer than vitest's 5 s default there.
  it(
    'validate and describe the core version on this branch',
    { timeout: 60_000 },
    () => {
      const core = JSON.parse(
        readFileSync(
          join(import.meta.dirname, '../../../libs/core/package.json'),
          'utf8',
        ),
      ).version;
      const data = readBenchmarkData();
      expect(data.core).toBe(core);
      expect(typeof lookup(data, 'size.nexusdi.plain.esbuild.gzip').value).toBe(
        'number',
      );
    },
  );
});

describe('gitCommit', () => {
  it('names the commit of a clean file and answers null for an edited one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'benchmark-git-'));
    copies.push(dir);
    const git = (...args) =>
      execFileSync(
        'git',
        ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
        { cwd: dir, encoding: 'utf8' },
      ).trim();
    git('init', '-q');
    mkdirSync(join(dir, 'benchmarks/results'), { recursive: true });
    const path = 'benchmarks/results/size.json';
    writeFileSync(join(dir, path), '{}\n');
    git('add', '.');
    git('commit', '-q', '-m', 'results');
    const head = git('rev-parse', 'HEAD');
    expect(gitCommit(dir)(path)).toBe(head);
    writeFileSync(join(dir, path), '{"edited":true}\n');
    expect(gitCommit(dir)(path)).toBeNull();
  });
});
