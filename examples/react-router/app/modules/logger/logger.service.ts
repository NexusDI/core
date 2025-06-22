import { Service, Token } from '../../../../../src';

export interface ILoggerService {
  log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
}

export const LOGGER_SERVICE_TOKEN = new Token<ILoggerService>('LoggerService');

@Service()
export class LoggerService implements ILoggerService {
  log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
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

  info(message: string, meta?: Record<string, any>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, any>): void {
    this.log('error', message, meta);
  }
} 