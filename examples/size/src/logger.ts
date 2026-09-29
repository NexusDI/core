import { Token } from '@nexusdi/core';

export interface ILogger {
  log(line: string): string;
}
export const LOGGER = new Token<ILogger>('Logger');

export class ConsoleLogger implements ILogger {
  log(line: string): string {
    return line;
  }
}
