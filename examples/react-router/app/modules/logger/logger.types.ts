import { Token } from '../../../../../src';

export interface ILoggerService {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
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