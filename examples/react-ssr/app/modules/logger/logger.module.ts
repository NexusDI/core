import { Module } from '@nexusdi/core';
import type { DynamicModule } from '@nexusdi/core';
import { LOGGER_CONFIG_TOKEN, type LoggerConfig } from './logger.types';
import { LoggerService } from './logger.service';

@Module({
  providers: [
    LoggerService, // Simplified format - uses @Service decorator token
  ],
  exports: [LoggerService],
})
export class LoggerModule implements DynamicModule<LoggerConfig> {
  readonly configToken = LOGGER_CONFIG_TOKEN;

  static config(config: LoggerConfig) {
    return {
      token: LOGGER_CONFIG_TOKEN,
      useValue: config,
    };
  }
}
