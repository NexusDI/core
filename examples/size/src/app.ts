// The two-service app every fixture but decorators.ts builds. It uses only
// API that every revision from 03f2aca on has, so the size report can
// measure a merge base with the head's fixture.
import { defineModule, provide } from '@nexusdi/core';

import { ConsoleLogger, LOGGER, type ILogger } from './logger.ts';

export class UserService {
  static deps = [LOGGER] as const;
  constructor(readonly logger: ILogger) {}
}

export const App = defineModule({
  name: 'App',
  providers: [provide(LOGGER, { useClass: ConsoleLogger }), UserService],
});
