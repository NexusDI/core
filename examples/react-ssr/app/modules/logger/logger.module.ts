import { defineModule, provide } from '@nexusdi/core';
import { LoggerService } from './logger.service';
import { LOGGER_CONFIG_TOKEN, LOGGER_SERVICE_TOKEN } from './logger.types';

export const LoggerModule = defineModule({
  name: 'LoggerModule',
  options: LOGGER_CONFIG_TOKEN,
  providers: [
    provide(LOGGER_SERVICE_TOKEN, {
      useClass: LoggerService,
      deps: [LOGGER_CONFIG_TOKEN],
    }),
  ],
  exports: [LOGGER_SERVICE_TOKEN],
});
