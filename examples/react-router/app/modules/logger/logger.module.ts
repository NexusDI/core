import { Module, DynamicModule } from '../../../../../src';
import { LOGGER_SERVICE_TOKEN, LOGGER_CONFIG_TOKEN, type LoggerConfig } from './logger.types';
import { LoggerService } from './logger.service';

@Module({
  providers: [
    LoggerService, // Simplified format - uses @Service decorator token
  ],
})
export class LoggerModule extends DynamicModule<LoggerConfig> {
  protected readonly configToken = LOGGER_CONFIG_TOKEN;
} 