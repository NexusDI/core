import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FIXTURES, runCli } from '../test-support/run.js';
import { tempDir } from '../test-support/temp.js';

const DIR = join(FIXTURES, 'profile');

describe('nexusdi profile', () => {
  it('prints the table for a module entry and exits 0', () => {
    const run = runCli(['profile', 'meridian.module.js#Meridian'], {
      cwd: DIR,
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^Node \d+\.\d+\.\d+, @nexusdi\/core /);
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
  it('refuses --cpu with exit 2 until CPU sampling ships', () => {
    const run = runCli(
      ['profile', 'meridian.module.js', '--chrome', 'c.json', '--cpu'],
      { cwd: DIR },
    );
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/^nexusdi: --cpu is not available/);
  });
});
