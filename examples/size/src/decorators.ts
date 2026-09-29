// The app from app.ts with UserService declared through @Injectable.
import { Nexus, defineModule, provide } from '@nexusdi/core';
import { Injectable } from '@nexusdi/decorators';

import { ConsoleLogger, LOGGER, type ILogger } from './logger.ts';

@Injectable({ deps: [LOGGER] })
class UserService {
  constructor(readonly logger: ILogger) {}
}

const app = await Nexus.create(
  defineModule({
    name: 'App',
    providers: [provide(LOGGER, { useClass: ConsoleLogger }), UserService],
  }),
);
app.get(UserService).logger.log('ready');
