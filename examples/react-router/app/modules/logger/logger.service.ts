import { Service, Token } from '../../../../../src';

export interface ILoggerService {
  log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export const LOGGER_SERVICE_TOKEN = new Token<ILoggerService>('LoggerService');

@Service()
export class LoggerService implements ILoggerService {
  log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const _logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };
    
    switch (level) {
      case 'info':
        console.log(`[INFO] ${timestamp} - ${message}`, meta || '');
        break;
      case 'warn':
        console.warn(`[WARN] ${timestamp} - ${message}`, meta || '');
        break;
      case 'error':
        console.error(`[ERROR] ${timestamp} - ${message}`, meta || '');
        break;
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }
} 