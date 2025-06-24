import { Module, DynamicModule } from '@nexusdi/core';
import { LOGGER_CONFIG_TOKEN, type LoggerConfig } from './logger.types';
import { LoggerService } from './logger.service';

@Module({
  providers: [
    LoggerService, // Simplified format - uses @Service decorator token
  ],
  exports: [LoggerService],
})
export class LoggerModule extends DynamicModule<LoggerConfig> {
  protected readonly configToken = LOGGER_CONFIG_TOKEN;
}
