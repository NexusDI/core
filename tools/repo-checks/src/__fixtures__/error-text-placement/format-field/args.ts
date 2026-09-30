import { parseArgs } from 'node:util';

export interface Command {
  readonly format: 'json' | 'dot';
  readonly out: string | null;
}

function formatOf(value: string | undefined): Command['format'] {
  return value === 'dot' ? 'dot' : 'json';
}

export function parseCommand(argv: readonly string[]): Command {
  const { values } = parseArgs({
    args: [...argv],
    options: { format: { type: 'string' }, out: { type: 'string' } },
  });
  const format = formatOf(values.format);
  return { format, out: values.out ?? null };
}
