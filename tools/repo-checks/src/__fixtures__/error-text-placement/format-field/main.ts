import { parseCommand } from './args.js';

declare function render(format: string): string;
declare function write(data: string, format: string): void;

export function main(argv: readonly string[]): string {
  const command = parseCommand(argv);
  if (command.format === 'dot' && command.out === null) return '';
  const { format } = command;
  write(render(command.format), format);
  return command['format'];
}
