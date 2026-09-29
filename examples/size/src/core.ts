import { Nexus } from '@nexusdi/core';

import { App, UserService } from './app.ts';

const app = await Nexus.create(App);
app.get(UserService).logger.log('ready');
