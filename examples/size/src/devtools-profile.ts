import { Nexus } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';

import { App, UserService } from './app.ts';

const profiler = profile();
const app = await Nexus.create(App, { plugins: [profiler] });
app.get(UserService).logger.log('ready');
console.log(profiler.report().runs.length);
