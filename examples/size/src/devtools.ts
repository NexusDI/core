import { Nexus } from '@nexusdi/core';
import { devtools, graph } from '@nexusdi/devtools';

import { App, UserService } from './app.ts';

const app = await Nexus.create(App, { plugins: [devtools()] });
app.get(UserService).logger.log('ready');
graph(app);
