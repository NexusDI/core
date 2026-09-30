import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BIN, FIXTURES, runCli } from '../test-support/run.js';
import { tempDir } from '../test-support/temp.js';

const JS = join(FIXTURES, 'js');
const JSON_DIR = join(FIXTURES, 'json');

describe('nexusdi graph, JavaScript entries', () => {
  it('writes mermaid for the default export', () => {
    const run = runCli(['graph', 'meridian.module.js'], { cwd: JS });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^flowchart LR\n/);
    expect(run.stdout).toContain('["NavCharts<br/>StellarCharts"]');
  });

  it('writes dot, json and the modules view', () => {
    expect(
      runCli(['graph', 'meridian.module.js', '-f', 'dot'], { cwd: JS }).stdout,
    ).toMatch(/^digraph nexus \{/);
    const json = JSON.parse(
      runCli(['graph', 'meridian.module.js#Meridian', '-f', 'json'], {
        cwd: JS,
      }).stdout,
    ) as { modules: { name: string }[] };
    expect(json.modules.map((m) => m.name)).toEqual(['Meridian', 'Navigation']);
    expect(
      runCli(['graph', 'meridian.module.js', '--view', 'modules'], { cwd: JS })
        .stdout,
    ).toContain('m0 --> m1');
  });

  it('writes to --out and takes the format from its extension', () => {
    const dir = tempDir();
    const run = runCli(
      ['graph', 'meridian.module.js', '-o', join(dir, 'g.dot')],
      { cwd: JS },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
    expect(readFileSync(join(dir, 'g.dot'), 'utf8')).toMatch(
      /^digraph nexus \{/,
    );
  });

  it('compiles --load modules after the root', () => {
    const run = runCli(
      [
        'graph',
        'meridian.module.js',
        '-f',
        'json',
        '--load',
        'science.module.js#Science',
      ],
      { cwd: JS },
    );
    expect(run.status).toBe(0);
    expect(
      JSON.parse(run.stdout).modules.map((m: { name: string }) => m.name),
    ).toContain('Science');
  });

  it('registers the --plugins array', () => {
    const run = runCli(
      ['graph', 'meridian.module.js', '--plugins', 'plugins.js#plugins'],
      { cwd: JS },
    );
    // The fixture's check hook reports an error, which only a registered plugin can do.
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('[FIXTURE_LINT] the fixture check hook ran');
  });

  it('exits 2 when --plugins names something other than an array', () => {
    const run = runCli(
      ['graph', 'meridian.module.js', '--plugins', 'plugins.js#notArray'],
      {
        cwd: JS,
      },
    );
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('is not an array of plugins');
  });

  it('exits 1 with the @nexusdi/errors text for an invalid graph, and writes nothing', () => {
    const run = runCli(['graph', 'broken.module.js'], { cwd: JS });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(/^nexusdi: \[NEXUS_BLUEPRINT_INVALID\]/);
    expect(run.stderr).toContain('NEXUS_MISSING_PROVIDER');
    expect(run.stderr).toContain('NavCharts');
  });

  it("exits 2 with core's fix line when the export is not a module", () => {
    const run = runCli(['graph', 'not-a-module.js'], { cwd: JS });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(/^nexusdi: \[NEXUS_INVALID_MODULE\]/);
    expect(run.stderr).toContain('Fix: create one with defineModule()');
    expect(run.stderr).not.toContain('unexpected error');
  });

  it('exits 2 and lists the exports when there is no default export', () => {
    const run = runCli(['graph', 'named-only.module.js'], { cwd: JS });
    expect(run.status).toBe(2);
    expect(run.stderr).toBe(
      'nexusdi: named-only.module.js has no default export.\n' +
        '  Its exports: Meridian, Navigation\n' +
        '  Pass one: nexusdi graph named-only.module.js#Meridian\n',
    );
  });

  it('exits 2 for a missing entry file', () => {
    const run = runCli(['graph', 'nowhere.module.js'], { cwd: JS });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('nowhere.module.js does not exist.');
  });

  it('exits 2 and prints the stack when the entry throws on import', () => {
    const run = runCli(['graph', 'throws.module.js'], { cwd: JS });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain(
      'throws.module.js threw while it was imported',
    );
    expect(run.stderr).toContain('reactor breach');
  });

  it('exits after writing when the entry leaves a server listening', () => {
    const run = runCli(['graph', 'server.module.js', '-f', 'dot'], {
      cwd: JS,
      timeout: 15_000,
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^digraph nexus \{/);
  });

  it('writes a complete graph to a pipe', () => {
    const run = runCli(['graph', 'meridian.module.js', '-f', 'json'], {
      cwd: JS,
    });
    expect(() => JSON.parse(run.stdout)).not.toThrow();
    expect(run.stdout.endsWith('}\n')).toBe(true);
  });

  it('exits 0 with nothing on stderr when the reader closes the pipe early', async () => {
    const child = spawn(
      process.execPath,
      [BIN, 'graph', 'meridian.module.js', '-f', 'json'],
      { cwd: JS, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    // Closing the read end before the CLI writes makes its write fail with EPIPE.
    child.stdout.destroy();
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const status = await new Promise<number | null>((resolve) =>
      child.on('close', resolve),
    );
    expect(stderr).toBe('');
    expect(status).toBe(0);
  });

  it('renders a .json graph', () => {
    const run = runCli(['graph', 'graph.json', '-f', 'dot'], { cwd: JSON_DIR });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('NavCharts');
  });

  it('exits 2 for a .json file that is not a NexusGraph', () => {
    const run = runCli(['graph', 'bad-graph.json'], { cwd: JSON_DIR });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('providers[0]');
  });

  it('prints usage and the version', () => {
    expect(runCli(['--help'], { cwd: JS }).stdout).toContain(
      'nexusdi graph <entry>',
    );
    const version = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ).version as string;
    expect(runCli(['--version'], { cwd: JS }).stdout).toBe(`${version}\n`);
  });

  it('exits 2 for an unknown flag', () => {
    const run = runCli(['graph', 'meridian.module.js', '--colour'], {
      cwd: JS,
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/^nexusdi: /);
  });
});
