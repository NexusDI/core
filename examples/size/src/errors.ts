import { Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

import { App, UserService } from './app.ts';

const app = await Nexus.create(App, { plugins: [errors()] });
app.get(UserService).logger.log('ready');
