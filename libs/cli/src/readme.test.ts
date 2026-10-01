import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { OPTIONS, parseCommand } from './args.js';

/**
 * The README shows shell commands, which no doctest runs. This file holds
 * them against the parser instead: every `npx nexusdi` line parses as a
 * graph command, and the options table lists exactly the flags parseArgs
 * accepts.
 */

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

/** The body of the `## <heading>` section, up to the next H2. */
function section(heading: string): string {
  const start = README.indexOf(`\n## ${heading}\n`);
  if (start === -1) return '';
  const body = README.slice(start + heading.length + 5);
  const end = body.indexOf('\n## ');
  return end === -1 ? body : body.slice(0, end);
}

const usage = section('Usage');
const commands = usage
  .split('\n')
  .filter((line) => line.startsWith('npx nexusdi '));

describe('the published README', () => {
  it('shows between one and four commands under Usage', () => {
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.length).toBeLessThanOrEqual(4);
  });

  it('shows commands the parser reads as graph commands', () => {
    for (const line of commands) {
      const argv = line.slice('npx nexusdi '.length).split(' ');
      expect(parseCommand(argv, '/project'), line).toMatchObject({
        kind: 'graph',
      });
    }
  });

  it('shows Mermaid to stdout, SVG to a file, the modules view and the CI line', () => {
    const parsed = commands.map((line) =>
      parseCommand(line.slice('npx nexusdi '.length).split(' '), '/project'),
    );
    const graphs = parsed.flatMap((c) => (c.kind === 'graph' ? [c] : []));
    expect(graphs.some((c) => c.format === 'mermaid' && c.out === null)).toBe(
      true,
    );
    expect(graphs.some((c) => c.format === 'svg' && c.out !== null)).toBe(true);
    expect(graphs.some((c) => c.view === 'modules')).toBe(true);
    expect(
      commands.some((line) => line.endsWith('-f json -o graph.json')),
    ).toBe(true);
    expect(usage).toContain('exits 1 when the graph is invalid');
  });

  it('lists exactly the flags parseArgs accepts, help and version aside', () => {
    const listed = section('Options')
      .split('\n')
      .filter((line) => line.startsWith('| `-'))
      .flatMap((line) => {
        const cell = /^\| `([^`]+)`/.exec(line)?.[1] ?? '';
        return [...cell.matchAll(/(--?[a-z]+)/g)].map((m) => m[1]);
      });
    const accepted = Object.entries(OPTIONS)
      .filter(([name]) => name !== 'help' && name !== 'version')
      .flatMap(([name, option]) => [
        `--${name}`,
        ...('short' in option ? [`-${option.short}`] : []),
      ]);
    expect(listed.sort()).toEqual(accepted.sort());
  });
});
