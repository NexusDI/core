import {
  LOGGER_SERVICE_TOKEN,
  type ILoggerService,
  type LoggerConfig,
} from './logger.types';

export class LoggerService implements ILoggerService {
  constructor(private config: LoggerConfig) {}

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= configLevelIndex;
  }

  private formatMessage(
    level: string,
    message: string,
    ...args: unknown[]
  ): string {
    const timestamp = new Date().toISOString();

    if (this.config.format === 'json') {
      return JSON.stringify({
        timestamp,
        level,
        message,
        args,
      });
    }

    if (this.config.format === 'minimal') {
      return `[${level.toUpperCase()}] ${message}`;
    }

    // Default text format
    const argsStr =
      args.length > 0
        ? ` ${args.map((arg) => JSON.stringify(arg)).join(' ')}`
        : '';
    return `[${level.toUpperCase()}] ${timestamp} - ${message}${argsStr}`;
  }

  private writeToConsole(level: string, formattedMessage: string): void {
    if (!this.config.enableConsole) return;

    switch (level) {
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.log(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }
  }

  private writeToFile(level: string, formattedMessage: string): void {
    if (!this.config.enableFile || !this.config.filePath) return;

    // In a real implementation, you'd use a file system library
    // For now, we'll just log that we would write to file
    console.log(
      `[FILE] Would write to ${this.config.filePath}: ${formattedMessage}`,
    );
  }

  private logMessage(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    ...args: unknown[]
  ): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, ...args);
    this.writeToConsole(level, formattedMessage);
    this.writeToFile(level, formattedMessage);
  }

  // ILoggerService.log is the generic entry point; this service treats it as info level.
  log(message: string, ...args: unknown[]): void {
    this.logMessage('info', message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.logMessage('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.logMessage('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.logMessage('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.logMessage('error', message, ...args);
  }
}

// Re-export types for convenience
export { type ILoggerService, LOGGER_SERVICE_TOKEN };
