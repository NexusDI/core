// The app from app.ts with its module declared through @Module, so the
// report measures @Module apart from @Injectable.
import { Nexus, provide } from '@nexusdi/core';
import { Module } from '@nexusdi/decorators';

import { ConsoleLogger, LOGGER, type ILogger } from './logger.ts';

class UserService {
  static deps = [LOGGER] as const;
  constructor(readonly logger: ILogger) {}
}

@Module({
  name: 'App',
  providers: [provide(LOGGER, { useClass: ConsoleLogger }), UserService],
})
class App {}

const app = await Nexus.create(App);
app.get(UserService).logger.log('ready');
