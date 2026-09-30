import { describe, expect, it } from 'vitest';

import { parseCommand } from './args.js';

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
