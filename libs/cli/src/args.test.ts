import { describe, expect, it } from 'vitest';

import { parseCommand } from './args.js';
import type { CliError } from './cli-error.js';

const CWD = '/work/app';

function exitOf(argv: string[]): unknown {
  try {
    parseCommand(argv, CWD);
  } catch (error) {
    return (error as { exitCode?: number }).exitCode;
  }
  return 'no throw';
}

describe('parseCommand', () => {
  it('reads a graph command with defaults', () => {
    expect(parseCommand(['graph', 'src/app.ts#App'], CWD)).toEqual({
      kind: 'graph',
      entry: {
        path: '/work/app/src/app.ts',
        exportName: 'App',
        shown: 'src/app.ts',
      },
      format: 'mermaid',
      out: null,
      view: 'providers',
      load: [],
      plugins: null,
    });
  });

  it('takes the format from --out when --format is absent', () => {
    expect(parseCommand(['graph', 'a.ts', '-o', 'g.svg'], CWD)).toMatchObject({
      format: 'svg',
      out: '/work/app/g.svg',
    });
    expect(parseCommand(['graph', 'a.ts', '-o', 'g.gv'], CWD)).toMatchObject({
      format: 'dot',
    });
    expect(parseCommand(['graph', 'a.ts', '-o', 'g.mmd'], CWD)).toMatchObject({
      format: 'mermaid',
    });
  });

  it('honours --format over the --out extension', () => {
    expect(
      parseCommand(['graph', 'a.ts', '-f', 'json', '-o', 'g.svg'], CWD),
    ).toMatchObject({
      format: 'json',
    });
  });

  it('falls back to mermaid for an --out extension it does not know', () => {
    expect(parseCommand(['graph', 'a.ts', '-o', 'g.txt'], CWD)).toMatchObject({
      format: 'mermaid',
    });
  });

  it('collects repeated --load flags in order and one --plugins', () => {
    expect(
      parseCommand(
        [
          'graph',
          'a.ts',
          '--load',
          'b.ts#B',
          '--load',
          'c.ts#C',
          '--plugins',
          'p.ts#plugins',
        ],
        CWD,
      ),
    ).toMatchObject({
      load: [{ exportName: 'B' }, { exportName: 'C' }],
      plugins: { exportName: 'plugins' },
    });
  });

  it('reads --help and --version', () => {
    expect(parseCommand(['--help'], CWD)).toEqual({ kind: 'help' });
    expect(parseCommand(['-v'], CWD)).toEqual({ kind: 'version' });
  });

  it.each([
    [['graph']],
    [[]],
    [['draw', 'a.ts']],
    [['graph', 'a.ts', 'b.ts']],
    [['graph', 'a.ts', '--colour']],
    [['graph', 'a.ts', '-f', 'gif']],
    [['graph', 'a.ts', '--view', 'tokens']],
    [['graph', 'g.json', '--load', 'b.ts#B']],
    [['graph', 'g.json', '--plugins', 'p.ts#plugins']],
    [['graph', 'a.ts', '--load', 'g.json']],
    [['graph', 'a.ts', '--plugins', 'p.json']],
  ])('exits 2 for %j', (argv) => {
    expect(exitOf(argv)).toBe(2);
  });
});

/** The error `fn` throws. Fails the test when it returns. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw, and it returned');
}

describe('parseCommand, profile', () => {
  const cwd = '/project';
  it('reads the defaults', () => {
    expect(
      parseCommand(['profile', 'src/ship.ts#Meridian'], cwd),
    ).toMatchObject({
      kind: 'profile',
      entry: { path: '/project/src/ship.ts', exportName: 'Meridian' },
      repeat: 0,
      chrome: null,
      perfetto: null,
      json: null,
      cpu: false,
      cpuInterval: 100,
      top: 20,
      timeout: 60_000,
      quiet: false,
    });
  });

  it('reads every flag', () => {
    expect(
      parseCommand(
        [
          'profile',
          'a.ts',
          '--load',
          'b.ts#B',
          '--plugins',
          'p.ts#plugins',
          '--repeat',
          '20',
          '--chrome',
          'c.json',
          '--perfetto',
          'p.json',
          '--json',
          'r.json',
          '--cpu',
          '--cpu-interval',
          '50',
          '--top',
          '5',
          '--timeout',
          '100',
          '--quiet',
        ],
        cwd,
      ),
    ).toMatchObject({
      repeat: 20,
      chrome: '/project/c.json',
      perfetto: '/project/p.json',
      json: '/project/r.json',
      cpu: true,
      cpuInterval: 50,
      top: 5,
      timeout: 100,
      quiet: true,
    });
  });

  it.each([
    [['profile', 'a.ts', '--cpu'], '--cpu needs --chrome'],
    [['profile', 'r.json', '--load', 'b.ts'], 'a .json entry'],
    [['profile', 'r.json', '--repeat', '3'], 'a .json entry'],
    // node:util reads "--repeat -1" as a flag with no value and refuses it;
    // "--repeat=-1" reaches the CLI's own check.
    [
      ['profile', 'a.ts', '--repeat', '-1'],
      "Option '--repeat' argument is ambiguous",
    ],
    [['profile', 'a.ts', '--repeat=-1'], '--repeat takes'],
    [['profile', 'a.ts', '--timeout', 'soon'], '--timeout takes'],
    [['profile', 'a.ts', '-f', 'svg'], '-f is a graph option'],
    [['graph', 'a.ts', '--chrome', 'c.json'], '--chrome is a profile option'],
  ])('refuses %j with exit 2', (argv, message) => {
    const error = thrown(() => parseCommand(argv, cwd)) as CliError;
    expect(error.exitCode).toBe(2);
    expect(error.message).toContain(message);
  });
});
