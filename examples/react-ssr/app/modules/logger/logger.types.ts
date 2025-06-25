import { Token } from '@nexusdi/core';

export interface ILoggerService {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
}

export interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text' | 'minimal';
  enableConsole?: boolean;
  enableFile?: boolean;
  filePath?: string;
}

// Shared tokens
export const LOGGER_SERVICE_TOKEN = new Token<ILoggerService>('LoggerService');
export const LOGGER_CONFIG_TOKEN = new Token<LoggerConfig>('LOGGER_CONFIG');
