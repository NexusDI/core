import { Nexus } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';

import { App, UserService } from './app.ts';

const app = await Nexus.create(App, { plugins: [federation()] });
app.get(UserService).logger.log('ready');
