
import { Module } from '../../../../../src';
import { LOGGER_SERVICE_TOKEN, LoggerService } from './logger.service';

@Module({
  providers: [
    { token: LOGGER_SERVICE_TOKEN, useClass: LoggerService },
  ],
})
export class LoggerModule {} 