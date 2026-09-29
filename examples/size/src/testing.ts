import { createTestingContainer } from '@nexusdi/testing';

import { App, UserService } from './app.ts';
import { LOGGER } from './logger.ts';

const app = await createTestingContainer(App)
  .override(LOGGER, { useValue: { log: (line) => line } })
  .create();
app.get(UserService).logger.log('ready');
