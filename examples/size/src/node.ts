import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

import { App, UserService } from './app.ts';

const app = await Nexus.create(App);
app.get(UserService).logger.log('ready');
nodeScopes().run(await app.createScope(), () => 1);
