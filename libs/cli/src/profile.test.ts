import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ModuleOptionsError, Nexus, Token, defineModule } from '@nexusdi/core';

import { FIXTURES, runCli } from '../test-support/run.js';
import { describeFailure } from './profile.js';
import { tempDir } from '../test-support/temp.js';

const DIR = join(FIXTURES, 'profile');

describe('nexusdi profile', () => {
  it('prints the table for a module entry and exits 0', () => {
    const run = runCli(['profile', 'meridian.module.js#Meridian'], {
      cwd: DIR,
    });
    expect(run.status).toBe(0);
    expect(run.stderr).not.toContain('no CPU sample');
    // A few ms means the sampler ran rarely; tens of ms means the anchors'
    // clock reads sat outside their samples.
    expect(run.stderr).not.toMatch(/up to \d{2,}/);
    expect(run.stdout).toMatch(
      /^create \d+\.\d ms, cold, Node \d+\.\d+\.\d+, @nexusdi\/core \S+\n/,
    );
    expect(run.stdout).toContain('slowest providers');
    expect(run.stdout).toMatch(/NavCharts\s+Tactical\s+1\s+singleton.*async/);
  });

  it('writes the Chrome, Perfetto and JSON files, and nothing to stdout with --quiet', () => {
    const dir = tempDir();
    const run = runCli(
      [
        'profile',
        'meridian.module.js',
        '--load',
        'science.module.js#Science',
        '--repeat',
        '2',
        '--quiet',
        '--chrome',
        join(dir, 'c.json'),
        '--perfetto',
        join(dir, 'p.json'),
        '--json',
        join(dir, 'r.json'),
      ],
      { cwd: DIR },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
    const reports = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')) as {
      runs: { kind: string }[];
    }[];
    expect(reports).toHaveLength(3);
    expect(reports[0]?.runs.map((r) => r.kind)).toEqual(['create', 'load']);
    expect(
      JSON.parse(readFileSync(join(dir, 'c.json'), 'utf8')).traceEvents.length,
    ).toBeGreaterThan(0);
    // The core version the entry resolves, read from its package.json.
    const core = JSON.parse(
      readFileSync(
        fileURLToPath(import.meta.resolve('@nexusdi/core/package.json')),
        'utf8',
      ),
    ) as { version: string };
    expect(
      JSON.parse(readFileSync(join(dir, 'p.json'), 'utf8')).metadata,
    ).toEqual({ 'nexusdi-profile': 1, 'nexusdi-core': core.version });
  });

  it('re-renders a saved report without running the app', () => {
    const run = runCli(['profile', 'report.json'], { cwd: DIR });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('slowest providers');
  });

  it('exits 2 for a report devtools rejects, naming the file first', () => {
    const run = runCli(['profile', 'bad-report.json'], { cwd: DIR });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(
      /^nexusdi: bad-report\.json: \[NEXUS_DEVTOOLS_PROFILE_INVALID\]/,
    );
  });

  it('exits 1 when the app fails to start, and still writes the table and files', () => {
    const dir = tempDir();
    const run = runCli(
      ['profile', 'broken.module.js#Broken', '--json', join(dir, 'r.json')],
      { cwd: DIR },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('hull breach');
    expect(run.stdout).toContain('failed');
    expect(
      JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'))[0].runs[0].ok,
    ).toBe(false);
  });

  it('exits 2 when create throws before it compiles', () => {
    const run = runCli(['profile', 'not-a-module.module.js#NotAModule'], {
      cwd: DIR,
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(
      /^nexusdi: create failed:\n.*NEXUS_INVALID_MODULE/,
    );
  });

  it('warns on a disposal error and keeps exit 0', () => {
    const run = runCli(['profile', 'leaky.module.js#Leaky'], { cwd: DIR });
    expect(run.status).toBe(0);
    expect(run.stderr).toMatch(/^nexusdi: warning: disposal/);
  });
  it('prints what a hung create still awaits after --timeout and exits 1', () => {
    const dir = tempDir();
    const run = runCli(
      [
        'profile',
        'meridian.module.js#Hung',
        '--timeout',
        '50',
        '--json',
        join(dir, 'out.json'),
      ],
      { cwd: DIR },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('create did not settle within 50 ms');
    expect(run.stderr).toContain('Still awaiting: NavCharts (Hung) factory');
    const [report] = JSON.parse(
      readFileSync(join(dir, 'out.json'), 'utf8'),
    ) as { runs: { ok: boolean | null }[] }[];
    expect(report?.runs).toMatchObject([{ ok: null }]);
  });

  it('names a disposal that hangs past --timeout, warns and keeps exit 0', () => {
    const run = runCli(
      ['profile', 'stuck.module.js#Stuck', '--timeout', '200'],
      { cwd: DIR },
    );
    expect(run.status).toBe(0);
    expect(run.stderr).toMatch(
      /^nexusdi: warning: disposal after iteration 1 did not settle within 200 ms/,
    );
    expect(run.stderr).not.toContain('create did not settle');
    expect(run.stdout).toMatch(/^create \d+\.\d ms, cold/);
  });

  it('runs no further iteration of --repeat after a disposal hangs', () => {
    const dir = tempDir();
    const run = runCli(
      [
        'profile',
        'stuck.module.js#Stuck',
        '--repeat',
        '3',
        '--timeout',
        '200',
        '--json',
        join(dir, 'r.json'),
        '--quiet',
      ],
      { cwd: DIR },
    );
    expect(run.status).toBe(0);
    expect(run.stderr.match(/did not settle/g)).toHaveLength(1);
    const reports = JSON.parse(
      readFileSync(join(dir, 'r.json'), 'utf8'),
    ) as unknown[];
    expect(reports).toHaveLength(1);
  });

  it('records the environment in the JSON, and re-renders it from the report alone', () => {
    const dir = tempDir();
    const recorded = runCli(
      [
        'profile',
        'meridian.module.js',
        '--quiet',
        '--json',
        join(dir, 'r.json'),
      ],
      { cwd: DIR },
    );
    expect(recorded.status).toBe(0);
    const [report] = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')) as {
      environment?: { node: string; core: string };
    }[];
    expect(report?.environment?.node).toBe(process.versions.node);
    // A report recorded elsewhere keeps its own environment on re-render.
    writeFileSync(
      join(dir, 'elsewhere.json'),
      JSON.stringify({
        ...report,
        environment: { node: '20.0.0', core: '9.9.9' },
      }),
    );
    const rendered = runCli(
      [
        'profile',
        join(dir, 'elsewhere.json'),
        '--perfetto',
        join(dir, 'p.json'),
      ],
      { cwd: DIR },
    );
    expect(rendered.status).toBe(0);
    expect(rendered.stdout.split('\n')[0]).toMatch(
      /, cold, Node 20\.0\.0, @nexusdi\/core 9\.9\.9$/,
    );
    expect(
      JSON.parse(readFileSync(join(dir, 'p.json'), 'utf8')).metadata,
    ).toEqual({ 'nexusdi-profile': 1, 'nexusdi-core': '9.9.9' });
  });

  it('leaves the environment out of a saved report that has none', () => {
    const dir = tempDir();
    const run = runCli(
      ['profile', 'report.json', '--perfetto', join(dir, 'p.json')],
      { cwd: DIR },
    );
    expect(run.status).toBe(0);
    expect(run.stdout.split('\n')[0]).toMatch(/^create \d+\.\d ms, cold$/);
    expect(
      JSON.parse(readFileSync(join(dir, 'p.json'), 'utf8')).metadata,
    ).toEqual({ 'nexusdi-profile': 1 });
  });

  it('refuses two outputs on one path, and an output directory that does not exist, before the run', () => {
    const dir = tempDir();
    const same = runCli(
      [
        'profile',
        'meridian.module.js#Hung',
        '--chrome',
        join(dir, 'x.json'),
        '--json',
        join(dir, 'x.json'),
      ],
      { cwd: DIR, timeout: 5_000 },
    );
    expect(same.status).toBe(2);
    expect(same.stderr).toMatch(/^nexusdi: --chrome and --json both write /);
    const missing = runCli(
      [
        'profile',
        'meridian.module.js#Hung',
        '--json',
        join(dir, 'no', 'r.json'),
      ],
      { cwd: DIR, timeout: 5_000 },
    );
    expect(missing.status).toBe(2);
    expect(missing.stderr).toMatch(
      /^nexusdi: --json .*: the directory .* does not exist/,
    );
  });

  it('prints a cause once when the errors() text already holds it', () => {
    const run = runCli(
      [
        'profile',
        'broken.module.js#Broken',
        '--plugins',
        'errors-plugins.js#plugins',
        '--quiet',
      ],
      { cwd: DIR },
    );
    expect(run.status).toBe(1);
    expect(run.stderr.match(/hull breach/g)).toHaveLength(1);
  });
});

describe('nexusdi profile --timeout', () => {
  it('prints what a hung create still awaits, writes the partial report and exits 1', () => {
    const dir = tempDir();
    const started = Date.now();
    const run = runCli(
      [
        'profile',
        'meridian.module.js#Hung',
        '--timeout',
        '300',
        '--chrome',
        join(dir, 'c.json'),
        '--json',
        join(dir, 'r.json'),
      ],
      { cwd: DIR, timeout: 10_000 },
    );
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(
      /^nexusdi: create did not settle within 300 ms\.\n {2}Still awaiting: NavCharts \(Hung\) factory, \d+ ms\n$/,
    );
    const [report] = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')) as {
      runs: { ok: null; pending: unknown[] }[];
    }[];
    expect(report?.runs[0]).toMatchObject({ ok: null });
    expect(report?.runs[0]?.pending).toHaveLength(1);
    expect(readFileSync(join(dir, 'c.json'), 'utf8')).toContain(
      'still awaiting at timeout',
    );
  });
});

describe('nexusdi profile exit codes (spec 9.5)', () => {
  it.each([
    [['profile', 'meridian.module.js', '--cpu'], 2],
    [['profile', 'report.json', '--repeat', '1'], 2],
    [['profile', 'missing.module.js'], 2],
    [['profile', 'meridian.module.js#Nope'], 2],
    [['profile', 'not-a-module.module.js#NotAModule'], 2],
  ])(
    '%j exits %i with a nexusdi: message that ends with a fix line',
    (argv, status) => {
      const run = runCli(argv, { cwd: DIR });
      expect(run.status).toBe(status);
      expect(run.stderr).toMatch(
        /^nexusdi: [^\n]*\n(?:[^\n]*\n)*? {2}\S[^\n]*\n$/,
      );
    },
  );
});

describe('describeFailure', () => {
  it('prints a short cause that only the last word of the message matches', () => {
    const error = new Error('relay link down', { cause: new Error('down') });
    expect(describeFailure(error)).toBe(
      'relay link down\n  caused by Error: down',
    );
  });

  it('prints an error with a symbol message', () => {
    const error = new Error('x');
    Object.defineProperty(error, 'message', { value: Symbol('m') });
    expect(describeFailure(new Error('outer', { cause: error }))).toBe(
      'outer\n  caused by Error: Symbol(m)',
    );
  });

  it("skips a NexusError cause that core's one-line message ends with", async () => {
    const OPTIONS = new Token<{ seed: number }>('SimOptions');
    const Simulation = defineModule({
      name: 'Simulation',
      options: OPTIONS,
      schema: {
        '~standard': {
          version: 1,
          vendor: 'nexusdi-test',
          validate: () => ({ issues: [{ message: 'expected 1 to 10' }] }),
        },
      },
    });
    const error = (await Nexus.create(Simulation.forRoot({ seed: 0 })).catch(
      (caught: unknown) => caught,
    )) as Error;
    expect(describeFailure(error)).toBe(error.message);
  });

  it('skips a formatted NexusError cause the first line ends with', () => {
    const cause = new ModuleOptionsError({
      code: 'NEXUS_INVALID_MODULE_OPTIONS',
      module: 'Simulation',
      issues: [],
    });
    Reflect.set(
      cause,
      'message',
      '[NEXUS_INVALID_MODULE_OPTIONS] Simulation refused:\n  seed: expected 1 to 10',
    );
    const error = new Error(
      '[NEXUS_PROVIDER_FAILED] SimOptions failed: [NEXUS_INVALID_MODULE_OPTIONS] Simulation refused:\n      seed: expected 1 to 10',
      { cause },
    );
    expect(describeFailure(error)).toBe(error.message);
  });

  it('prints a cause whose text only starts the end of the message', () => {
    const error = new Error('dock gave up: Error: timeout after 5s', {
      cause: new Error('timeout'),
    });
    expect(describeFailure(error)).toBe(
      'dock gave up: Error: timeout after 5s\n  caused by Error: timeout',
    );
  });

  it('skips a cause the first line of the message ends with', () => {
    const error = new Error('dock gave up: Error: timeout\nFix: retry', {
      cause: new Error('timeout'),
    });
    expect(describeFailure(error)).toBe(
      'dock gave up: Error: timeout\nFix: retry',
    );
  });
});

describe('nexusdi profile --cpu', () => {
  it('merges the CPU samples into the Chrome trace, as the README says', () => {
    const dir = tempDir();
    const run = runCli(
      [
        'profile',
        'meridian.module.js',
        '--chrome',
        join(dir, 'c.json'),
        '--cpu',
        '--quiet',
      ],
      { cwd: DIR },
    );
    expect(run.status).toBe(0);
    expect(run.stderr).not.toContain('no CPU sample');
    // A few ms means the sampler ran rarely; tens of ms means the anchors'
    // clock reads sat outside their samples.
    expect(run.stderr).not.toMatch(/up to \d{2,}/);
    const events = JSON.parse(readFileSync(join(dir, 'c.json'), 'utf8'))
      .traceEvents as {
      name: string;
      args?: { data?: { cpuProfile?: { samples?: number[] } } };
    }[];
    const samples = events
      .filter((e) => e.name === 'ProfileChunk')
      .flatMap((e) => e.args?.data?.cpuProfile?.samples ?? []);
    expect(samples.length).toBeGreaterThan(0);
  });
});
